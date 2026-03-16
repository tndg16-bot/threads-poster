/**
 * Threads API Client
 *
 * Threads Graph APIとの通信を担当
 * - RateLimitHandler によるリトライ・レート制限管理
 * - ThreadsApiError による構造化エラーハンドリング
 */

const fetch = require('node-fetch');
const { RateLimitHandler, ThreadsApiError } = require('./rate-limit-handler');

class ThreadsClient {
  /**
   * @param {Object} config
   * @param {string} config.accessToken - Threads API アクセストークン
   * @param {string} [config.apiVersion='v1.0'] - API バージョン
   * @param {boolean} [config.dryRun=false] - ドライラン
   * @param {Object} [config.rateLimitOptions] - RateLimitHandler のオプション
   */
  constructor(config) {
    this.config = config;
    this.baseUrl = `https://graph.threads.net/${config.apiVersion}`;
    this.accessToken = config.accessToken;
    this.rateLimitHandler = new RateLimitHandler(config.rateLimitOptions || {});
  }

  /**
   * HTTPリクエスト共通処理
   * RateLimitHandler によるリトライ付き
   */
  async request(endpoint, options = {}) {
    const logger = require('./logger');

    return this.rateLimitHandler.executeWithRetry(async () => {
      const url = `${this.baseUrl}${endpoint}`;
      const headers = {
        ...options.headers,
        'Authorization': `Bearer ${this.accessToken}`
      };

      logger.debug(`Request: ${options.method || 'GET'} ${url}`);

      const response = await fetch(url, {
        ...options,
        headers
      });

      // レスポンスヘッダーからレート制限情報を解析・警告
      this.rateLimitHandler.parseRateLimitHeaders(response);

      const data = await response.json();

      if (!response.ok) {
        const error = data.error || {};
        const httpStatus = response.status;
        const apiCode = error.code || null;
        const apiSubCode = error.error_subcode || null;

        // estimated_time_to_regain_access の抽出
        // API エラーレスポンス内に含まれる場合がある
        let estimatedTimeToRegain = null;
        if (error.error_data && error.error_data.estimated_time_to_regain_access) {
          estimatedTimeToRegain = error.error_data.estimated_time_to_regain_access;
        }

        logger.error(`API Error: ${error.message || response.statusText}`);
        logger.error(`Error Type: ${error.type || 'unknown'}, Code: ${apiCode}, SubCode: ${apiSubCode}, HTTP: ${httpStatus}`);

        throw new ThreadsApiError(
          error.message || response.statusText,
          httpStatus,
          apiCode,
          apiSubCode,
          estimatedTimeToRegain
        );
      }

      logger.debug('Response:', data);
      return data;
    });
  }

  /**
   * 認証チェック
   */
  async checkAuth() {
    try {
      const response = await this.request('/me', {
        method: 'GET',
        headers: {
          'fields': 'id,username'
        }
      });
      return response.id && response.username;
    } catch (error) {
      const logger = require('./logger');
      logger.error('Authentication check failed:', error.message);
      return false;
    }
  }

  /**
   * ユーザー情報の取得
   */
  async getUserInfo() {
    const response = await this.request('/me', {
      method: 'GET',
      headers: {
        'fields': 'id,username'
      }
    });
    return response;
  }

  /**
   * 投稿コンテナの作成（下書き）
   */
  async createPostContainer(text, options = {}) {
    const { replyToId } = options;

    const params = new URLSearchParams({
      media_type: 'TEXT',
      text: text
    });

    if (replyToId) {
      params.append('reply_to_id', replyToId);
    }

    const response = await this.request(`/me/threads?${params.toString()}`, {
      method: 'POST'
    });

    return response;
  }

  /**
   * 投稿の公開
   */
  async publishPost(containerId) {
    const params = new URLSearchParams({
      id: containerId
    });

    const response = await this.request(`/me/threads_publish?${params.toString()}`, {
      method: 'POST'
    });

    return response;
  }

  /**
   * 投稿を作成して公開（一連の操作）
   */
  async createAndPublishPost(text, options = {}) {
    const logger = require('./logger');

    if (this.config.dryRun) {
      logger.info('[DRY RUN] Would create and publish post:');
      logger.info(`  Text: ${text}`);
      logger.info(`  Reply to: ${options.replyToId || 'none'}`);
      return {
        threadId: 'dry-run-id',
        permalink: 'https://dry-run.example.com'
      };
    }

    // Step 1: Create container
    logger.info('Step 1/2: Creating container...');
    const container = await this.createPostContainer(text, options);
    logger.debug(`Container created: ${container.id}`);

    // Step 2: Publish
    logger.info('Step 2/2: Publishing...');
    const result = await this.publishPost(container.id);
    logger.debug(`Thread published: ${result.id}`);

    // Get permalink
    const permalink = await this.getPermalink(result.id);

    return {
      threadId: result.id,
      containerId: container.id,
      permalink: permalink
    };
  }

  /**
   * スレッドのパーマリンクを取得
   */
  async getPermalink(threadId) {
    try {
      const response = await this.request(`/${threadId}?fields=permalink`);
      return response.permalink;
    } catch (error) {
      const logger = require('./logger');
      logger.warn('Failed to get permalink:', error.message);
      return `https://www.threads.net/t/${threadId}`;
    }
  }

  /**
   * スレッド情報の取得
   */
  async getThread(threadId) {
    const response = await this.request(`/${threadId}`, {
      method: 'GET',
      headers: {
        'fields': 'id,text,media_type,permalink,timestamp,username'
      }
    });
    return response;
  }

  /**
   * ユーザーの投稿一覧を取得
   */
  async getUserPosts(limit = 25) {
    const response = await this.request(`/me/threads`, {
      method: 'GET',
      headers: {
        'fields': 'id,text,media_type,permalink,timestamp',
        'limit': limit.toString()
      }
    });
    return response;
  }

  /**
   * スレッドを削除
   */
  async deleteThread(threadId) {
    const response = await this.request(`/${threadId}`, {
      method: 'DELETE'
    });
    return response;
  }

  /**
   * Publishing Quota（投稿上限）を確認する
   * ユーザーIDを自動取得してクォータを確認
   *
   * @returns {Promise<Object>} { quota_usage, config, remaining }
   */
  async checkPublishingQuota() {
    const userInfo = await this.getUserInfo();
    return this.rateLimitHandler.checkPublishingQuota(userInfo.id, this.accessToken);
  }
}

module.exports = ThreadsClient;
