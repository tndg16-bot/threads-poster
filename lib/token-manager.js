/**
 * Token Manager
 *
 * Threads APIのlong-livedトークンを管理
 * - 自動リフレッシュ（期限7日前）
 * - short-lived → long-lived 交換
 * - 段階的アラート（14日/7日/3日/0日）
 * - JSONファイルで永続化
 */

const fs = require('fs-extra');
const fetch = require('node-fetch');
const path = require('path');
const logger = require('./logger');

const REFRESH_ENDPOINT = 'https://graph.threads.net/refresh_access_token';
const EXCHANGE_ENDPOINT = 'https://graph.threads.net/access_token';

// リフレッシュ閾値（日数）
const REFRESH_THRESHOLD_DAYS = 7;

// アラート閾値（日数）
const ALERT_THRESHOLDS = [
  { days: 0, level: 'error', message: 'トークンが失効しています！即座に再取得してください' },
  { days: 3, level: 'error', message: 'トークンの有効期限が残り3日以内です！' },
  { days: 7, level: 'warn', message: 'トークンの有効期限が残り7日以内です' },
  { days: 14, level: 'info', message: 'トークンの有効期限が残り14日以内です' },
];

/**
 * トークンをマスクする（ログ出力用）
 * @param {string} token
 * @returns {string} マスク済みトークン
 */
function maskToken(token) {
  if (!token || token.length < 10) return '****';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

class TokenManager {
  /**
   * @param {Object} config
   * @param {string} config.appSecret - Threads App Secret
   * @param {string} [config.tokenStorePath] - トークンストアのJSONファイルパス
   */
  constructor(config = {}) {
    this.appSecret = config.appSecret;
    this.tokenStorePath = config.tokenStorePath || path.join(__dirname, '..', 'token-store.json');
  }

  /**
   * 有効なトークンを返す
   * 期限7日前なら自動リフレッシュを実行
   * @returns {Promise<string>} アクセストークン
   */
  async getValidToken() {
    const store = await this._loadTokenStore();

    if (!store || !store.accessToken) {
      throw new Error('トークンストアにアクセストークンが見つかりません。初期設定を行ってください');
    }

    logger.debug(`トークンを読み込みました: ${maskToken(store.accessToken)}`);

    // 有効期限チェック
    const remainingDays = this._calculateRemainingDays(store.expiresAt);

    if (remainingDays <= 0) {
      throw new Error('トークンが失効しています。新しいトークンを取得してください');
    }

    // 閾値以内ならリフレッシュ
    if (remainingDays <= REFRESH_THRESHOLD_DAYS) {
      logger.info(`トークンの残り有効期限: ${remainingDays}日 — 自動リフレッシュを実行します`);
      try {
        const refreshedToken = await this.refreshToken(store.accessToken);
        return refreshedToken;
      } catch (error) {
        logger.error(`トークンのリフレッシュに失敗しました: ${error.message}`);
        logger.warn('既存のトークンを使用して続行します');
        return store.accessToken;
      }
    }

    logger.debug(`トークンの残り有効期限: ${remainingDays}日`);
    return store.accessToken;
  }

  /**
   * long-livedトークンをリフレッシュする
   * @param {string} currentToken - 現在のlong-livedトークン
   * @returns {Promise<string>} 新しいアクセストークン
   */
  async refreshToken(currentToken) {
    logger.info(`トークンのリフレッシュを開始します: ${maskToken(currentToken)}`);

    const url = `${REFRESH_ENDPOINT}?grant_type=th_refresh_token&access_token=${encodeURIComponent(currentToken)}`;

    const response = await fetch(url, { method: 'GET' });
    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.error ? data.error.message : `HTTP ${response.status}`;
      throw new Error(`トークンリフレッシュAPI エラー: ${errorMessage}`);
    }

    if (!data.access_token) {
      throw new Error('リフレッシュレスポンスにaccess_tokenが含まれていません');
    }

    // 新しいトークンを保存
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (data.expires_in || 5184000) * 1000); // デフォルト60日

    const storeData = {
      accessToken: data.access_token,
      expiresAt: expiresAt.toISOString(),
      refreshedAt: now.toISOString(),
      type: 'long_lived',
    };

    await this._saveTokenStore(storeData);

    logger.info(`トークンをリフレッシュしました: ${maskToken(data.access_token)}`);
    logger.info(`新しい有効期限: ${expiresAt.toISOString()}`);

    return data.access_token;
  }

  /**
   * short-livedトークンをlong-livedトークンに交換する
   * @param {string} shortLivedToken - short-livedトークン
   * @returns {Promise<string>} long-livedアクセストークン
   */
  async exchangeForLongLived(shortLivedToken) {
    if (!this.appSecret) {
      throw new Error('appSecretが設定されていません。long-livedトークンへの交換にはappSecretが必要です');
    }

    logger.info(`short-livedトークンの交換を開始します: ${maskToken(shortLivedToken)}`);

    const url = `${EXCHANGE_ENDPOINT}?grant_type=th_exchange_token&client_secret=${encodeURIComponent(this.appSecret)}&access_token=${encodeURIComponent(shortLivedToken)}`;

    const response = await fetch(url, { method: 'GET' });
    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.error ? data.error.message : `HTTP ${response.status}`;
      throw new Error(`トークン交換API エラー: ${errorMessage}`);
    }

    if (!data.access_token) {
      throw new Error('交換レスポンスにaccess_tokenが含まれていません');
    }

    // long-livedトークンを保存
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (data.expires_in || 5184000) * 1000); // デフォルト60日

    const storeData = {
      accessToken: data.access_token,
      expiresAt: expiresAt.toISOString(),
      refreshedAt: now.toISOString(),
      type: 'long_lived',
    };

    await this._saveTokenStore(storeData);

    logger.info(`long-livedトークンを取得しました: ${maskToken(data.access_token)}`);
    logger.info(`有効期限: ${expiresAt.toISOString()}`);

    return data.access_token;
  }

  /**
   * トークンの有効期限を確認し、段階的アラートを出す
   * @returns {Promise<Object>} { remainingDays, expiresAt, isExpired, alerts }
   */
  async checkExpiry() {
    const store = await this._loadTokenStore();

    if (!store || !store.expiresAt) {
      throw new Error('トークンストアに有効期限情報がありません');
    }

    const remainingDays = this._calculateRemainingDays(store.expiresAt);
    const isExpired = remainingDays <= 0;

    // 段階的アラート
    const alerts = [];
    for (const threshold of ALERT_THRESHOLDS) {
      if (remainingDays <= threshold.days) {
        const logMethod = threshold.level;
        const message = `[Token Expiry] ${threshold.message} (残り${remainingDays}日)`;
        logger[logMethod](message);
        alerts.push({ level: threshold.level, message: threshold.message, days: threshold.days });
        break; // 最も緊急度の高いアラートのみ出す
      }
    }

    // アラートなしの場合（14日以上あり）
    if (alerts.length === 0) {
      logger.info(`[Token Expiry] トークンの残り有効期限: ${remainingDays}日`);
    }

    return {
      remainingDays,
      expiresAt: store.expiresAt,
      refreshedAt: store.refreshedAt || null,
      type: store.type || 'unknown',
      isExpired,
      alerts,
    };
  }

  /**
   * トークンストアをJSONファイルから読み込む
   * @returns {Promise<Object|null>} トークンストアデータ
   */
  async _loadTokenStore() {
    try {
      const exists = await fs.pathExists(this.tokenStorePath);
      if (!exists) {
        logger.debug(`トークンストアが見つかりません: ${this.tokenStorePath}`);
        return null;
      }

      const content = await fs.readFile(this.tokenStorePath, 'utf8');
      const data = JSON.parse(content);
      logger.debug('トークンストアを読み込みました');
      return data;
    } catch (error) {
      logger.error(`トークンストアの読み込みに失敗しました: ${error.message}`);
      throw new Error(`トークンストアの読み込みエラー: ${error.message}`);
    }
  }

  /**
   * トークンストアをJSONファイルに保存する
   * @param {Object} data - 保存するデータ
   */
  async _saveTokenStore(data) {
    try {
      await fs.writeFile(this.tokenStorePath, JSON.stringify(data, null, 2), 'utf8');
      logger.info(`トークンストアを保存しました: ${this.tokenStorePath}`);
    } catch (error) {
      logger.error(`トークンストアの保存に失敗しました: ${error.message}`);
      throw new Error(`トークンストアの保存エラー: ${error.message}`);
    }
  }

  /**
   * 残り日数を計算する
   * @param {string} expiresAt - ISO 8601形式の有効期限
   * @returns {number} 残り日数（小数点以下切り捨て）
   */
  _calculateRemainingDays(expiresAt) {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffMs = expiry.getTime() - now.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }
}

module.exports = TokenManager;
