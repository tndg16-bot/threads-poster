/**
 * Rate Limit Handler for Threads API
 *
 * レート制限の検出・リトライ・クォータ管理を担当
 * - Exponential backoff with jitter によるリトライ
 * - X-Business-Use-Case-Usage ヘッダー解析
 * - Publishing Quota (250投稿/24h) の事前チェック
 */

const fetch = require('node-fetch');
const logger = require('./logger');

/**
 * Threads API 固有のエラークラス
 * HTTPステータス・APIエラーコード・サブコード・復帰推定時間を構造化して保持
 */
class ThreadsApiError extends Error {
  /**
   * @param {string} message - エラーメッセージ
   * @param {number} httpStatus - HTTPステータスコード
   * @param {number|null} apiCode - Meta APIエラーコード
   * @param {number|null} apiSubCode - Meta APIサブエラーコード
   * @param {number|null} estimatedTimeToRegain - アクセス復帰までの推定秒数
   */
  constructor(message, httpStatus, apiCode = null, apiSubCode = null, estimatedTimeToRegain = null) {
    super(message);
    this.name = 'ThreadsApiError';
    this.httpStatus = httpStatus;
    this.apiCode = apiCode;
    this.apiSubCode = apiSubCode;
    this.estimatedTimeToRegain = estimatedTimeToRegain;
  }
}

/**
 * リトライ可能なAPIエラーコード一覧
 * 1: Unknown error (一時的な場合あり)
 * 2: Service temporarily unavailable
 * 4: Application-level rate limit
 * 17: User-level rate limit
 * 80002: Publishing rate limit
 */
const RETRYABLE_API_CODES = new Set([1, 2, 4, 17, 80002]);

/**
 * リトライ可能なHTTPステータスコード一覧
 */
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

class RateLimitHandler {
  /**
   * @param {Object} options
   * @param {number} [options.maxRetries=3] - 最大リトライ回数
   * @param {number} [options.baseDelay=1000] - 初回リトライ時の待機時間 (ms)
   * @param {number} [options.maxDelay=60000] - リトライ待機時間の上限 (ms)
   * @param {number} [options.backoffMultiplier=2] - 指数バックオフの倍率
   */
  constructor(options = {}) {
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;
    this.baseDelay = options.baseDelay !== undefined ? options.baseDelay : 1000;
    this.maxDelay = options.maxDelay !== undefined ? options.maxDelay : 60000;
    this.backoffMultiplier = options.backoffMultiplier !== undefined ? options.backoffMultiplier : 2;
  }

  /**
   * 関数をリトライ付きで実行する
   * Exponential backoff with jitter を使用
   *
   * @param {Function} fn - 実行する非同期関数
   * @returns {Promise<*>} 関数の戻り値
   * @throws {Error} 全リトライ失敗時に最後のエラーをthrow
   */
  async executeWithRetry(fn) {
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // 最終試行またはリトライ不可のエラーなら即throw
        if (attempt >= this.maxRetries || !this.isRetryable(error)) {
          throw error;
        }

        const delay = this.calculateDelay(attempt, error);
        logger.warn(
          `API request failed (attempt ${attempt + 1}/${this.maxRetries + 1}): ${error.message}. ` +
          `Retrying in ${Math.round(delay / 1000)}s...`
        );
        await this._sleep(delay);
      }
    }

    // ここには到達しないが安全のため
    throw lastError;
  }

  /**
   * リトライ待機時間を計算する
   * - estimated_time_to_regain_access が存在する場合はそちらを優先
   * - それ以外は指数バックオフ + 10%ジッター
   *
   * @param {number} attempt - 現在の試行回数 (0-indexed)
   * @param {Error} error - 発生したエラー
   * @returns {number} 待機時間 (ms)
   */
  calculateDelay(attempt, error) {
    // API側が復帰推定時間を返している場合はそちらを優先
    if (error instanceof ThreadsApiError && error.estimatedTimeToRegain) {
      const apiDelay = error.estimatedTimeToRegain * 1000;
      // 上限を超えない範囲で使用
      return Math.min(apiDelay, this.maxDelay);
    }

    // 指数バックオフ: baseDelay * multiplier^attempt
    const exponentialDelay = this.baseDelay * Math.pow(this.backoffMultiplier, attempt);

    // 上限適用
    const cappedDelay = Math.min(exponentialDelay, this.maxDelay);

    // 10%ジッター: ±10%の範囲でランダムにずらす
    const jitterRange = cappedDelay * 0.1;
    const jitter = (Math.random() * 2 - 1) * jitterRange;

    return Math.max(0, Math.round(cappedDelay + jitter));
  }

  /**
   * エラーがリトライ可能かどうかを判定する
   *
   * @param {Error} error - 判定するエラー
   * @returns {boolean} リトライ可能ならtrue
   */
  isRetryable(error) {
    if (error instanceof ThreadsApiError) {
      // HTTPステータスコードでの判定
      if (RETRYABLE_HTTP_STATUSES.has(error.httpStatus)) {
        return true;
      }

      // APIエラーコードでの判定
      if (error.apiCode !== null && RETRYABLE_API_CODES.has(error.apiCode)) {
        return true;
      }

      return false;
    }

    // ネットワークエラー（fetch失敗等）はリトライ可能
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' ||
        error.type === 'system') {
      return true;
    }

    return false;
  }

  /**
   * レスポンスヘッダーからレート制限情報を解析する
   * X-Business-Use-Case-Usage ヘッダーを解析し、80%超過で警告ログを出力
   *
   * @param {Response} response - fetchのレスポンスオブジェクト
   * @returns {Object|null} 解析したレート制限情報、またはnull
   */
  parseRateLimitHeaders(response) {
    const usageHeader = response.headers.get('X-Business-Use-Case-Usage');
    if (!usageHeader) {
      return null;
    }

    try {
      const usage = JSON.parse(usageHeader);

      // 構造: { "<business_id>": [{ type, call_count, total_cputime, total_time, estimated_time_to_regain_access }] }
      const result = {};

      for (const [businessId, limits] of Object.entries(usage)) {
        result[businessId] = limits;

        for (const limit of limits) {
          // 80%超過チェック
          if (limit.call_count > 80) {
            logger.warn(
              `Rate limit warning: call_count at ${limit.call_count}% ` +
              `(type: ${limit.type}, business: ${businessId})`
            );
          }
          if (limit.total_cputime > 80) {
            logger.warn(
              `Rate limit warning: total_cputime at ${limit.total_cputime}% ` +
              `(type: ${limit.type}, business: ${businessId})`
            );
          }
          if (limit.total_time > 80) {
            logger.warn(
              `Rate limit warning: total_time at ${limit.total_time}% ` +
              `(type: ${limit.type}, business: ${businessId})`
            );
          }

          // 復帰推定時間がある場合は情報ログ
          if (limit.estimated_time_to_regain_access > 0) {
            logger.warn(
              `Rate limit: estimated time to regain access: ${limit.estimated_time_to_regain_access}s ` +
              `(type: ${limit.type}, business: ${businessId})`
            );
          }
        }
      }

      return result;
    } catch (parseError) {
      logger.warn(`Failed to parse X-Business-Use-Case-Usage header: ${parseError.message}`);
      return null;
    }
  }

  /**
   * Publishing Quota（投稿上限）を確認する
   * Threads APIの threads_publishing_limit エンドポイントを呼び出し
   * 250投稿/24h の残量を返す
   *
   * @param {string} userId - Threads ユーザーID
   * @param {string} accessToken - アクセストークン
   * @returns {Promise<Object>} { quota_usage, config: { quota_total, quota_duration }, remaining }
   * @throws {ThreadsApiError} API呼び出し失敗時
   */
  async checkPublishingQuota(userId, accessToken) {
    const url = `https://graph.threads.net/v1.0/${userId}/threads_publishing_limit?fields=quota_usage,config`;

    logger.debug(`Checking publishing quota for user ${userId}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data.error || {};
      throw new ThreadsApiError(
        `Failed to check publishing quota: ${error.message || response.statusText}`,
        response.status,
        error.code || null,
        error.error_subcode || null,
        null
      );
    }

    const quotaUsage = data.data && data.data[0] ? data.data[0].quota_usage : 0;
    const config = data.data && data.data[0] ? data.data[0].config : {};
    const quotaTotal = config.quota_total || 250;
    const remaining = quotaTotal - quotaUsage;

    const result = {
      quota_usage: quotaUsage,
      config: {
        quota_total: quotaTotal,
        quota_duration: config.quota_duration || 86400
      },
      remaining: remaining
    };

    logger.info(`Publishing quota: ${quotaUsage}/${quotaTotal} used, ${remaining} remaining`);

    if (remaining <= 10) {
      logger.warn(`Publishing quota critically low: only ${remaining} posts remaining`);
    } else if (remaining <= 50) {
      logger.warn(`Publishing quota getting low: ${remaining} posts remaining`);
    }

    return result;
  }

  /**
   * スリープユーティリティ
   * @param {number} ms - 待機時間 (ms)
   * @returns {Promise<void>}
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = {
  RateLimitHandler,
  ThreadsApiError,
  RETRYABLE_API_CODES,
  RETRYABLE_HTTP_STATUSES
};
