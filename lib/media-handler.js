/**
 * Media Handler for Threads API
 *
 * OGP画像の取得とIMAGE投稿機能を提供
 * - ブログ記事のOGP画像URLを取得
 * - Threads APIのIMAGE投稿（コンテナ作成→ステータス確認→公開）
 * - 画像取得失敗時はTEXT投稿へのフォールバック
 */

const fetch = require('node-fetch');
const logger = require('./logger');

/**
 * OGP画像取得・IMAGE投稿を管理するクラス
 */
class MediaHandler {
  /**
   * @param {Object} config
   * @param {string} config.baseUrl - ポートフォリオサイトのベースURL
   * @param {string} config.accessToken - Threads API アクセストークン
   * @param {string} [config.apiVersion='v1.0'] - API バージョン
   */
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.accessToken = config.accessToken;
    this.apiVersion = config.apiVersion || 'v1.0';
    this.apiBaseUrl = `https://graph.threads.net/${this.apiVersion}`;
  }

  /**
   * ブログ記事のOGP画像URLを取得する
   *
   * フォールバック戦略:
   *   1. HTML fetch → og:image メタタグを正規表現で抽出
   *   2. フォールバック: {baseUrl}/images/ogp-default.jpg
   *
   * @param {string} slug - ブログ記事のスラッグ
   * @returns {Promise<string>} OGP画像の公開URL
   */
  async getOgpImageUrl(slug) {
    const blogUrl = `${this.baseUrl}/blog/${slug}`;
    const fallbackUrl = `${this.baseUrl}/images/ogp-default.jpg`;

    try {
      logger.info(`Fetching OGP image from: ${blogUrl}`);

      const response = await fetch(blogUrl, {
        headers: {
          'User-Agent': 'ThreadsPoster/1.0'
        }
      });

      if (!response.ok) {
        logger.warn(`Failed to fetch blog page (HTTP ${response.status}): ${blogUrl}`);
        logger.info(`Using fallback OGP image: ${fallbackUrl}`);
        return fallbackUrl;
      }

      const html = await response.text();

      // og:image メタタグを正規表現で抽出
      const ogImageMatch = html.match(/<meta property="og:image" content="(.*?)"/);

      if (ogImageMatch && ogImageMatch[1]) {
        const ogImageUrl = ogImageMatch[1];
        logger.info(`OGP image found: ${ogImageUrl}`);
        return ogImageUrl;
      }

      logger.warn(`No og:image meta tag found for slug: ${slug}`);
      logger.info(`Using fallback OGP image: ${fallbackUrl}`);
      return fallbackUrl;
    } catch (error) {
      logger.error(`Error fetching OGP image for slug "${slug}": ${error.message}`);
      logger.info(`Using fallback OGP image: ${fallbackUrl}`);
      return fallbackUrl;
    }
  }

  /**
   * Threads APIでIMAGEコンテナを作成する
   *
   * @param {string} imageUrl - 公開アクセス可能な画像URL
   * @param {string} text - 投稿テキスト
   * @param {string} [altText] - 画像の代替テキスト
   * @returns {Promise<Object>} コンテナ作成レスポンス { id }
   * @throws {Error} API呼び出し失敗時
   */
  async createImageContainer(imageUrl, text, altText) {
    logger.info('Creating IMAGE container...');
    logger.debug(`  image_url: ${imageUrl}`);
    logger.debug(`  text: ${text}`);
    if (altText) {
      logger.debug(`  alt_text: ${altText}`);
    }

    const params = new URLSearchParams({
      media_type: 'IMAGE',
      image_url: imageUrl,
      text: text
    });

    if (altText) {
      params.append('alt_text', altText);
    }

    const url = `${this.apiBaseUrl}/me/threads?${params.toString()}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.error ? data.error.message : 'Unknown error';
      throw new Error(`Failed to create IMAGE container: ${errorMsg} (HTTP ${response.status})`);
    }

    logger.info(`IMAGE container created: ${data.id}`);
    return data;
  }

  /**
   * コンテナのステータスをポーリングしてFINISHEDを待つ
   *
   * Threads APIではIMAGEコンテナの処理に時間がかかるため、
   * ステータスがFINISHEDになるまでポーリングする必要がある。
   *
   * ステータス:
   *   - FINISHED: 処理完了、公開可能
   *   - IN_PROGRESS: 処理中、待機継続
   *   - ERROR: エラー発生、例外をthrow
   *   - EXPIRED: 期限切れ、例外をthrow
   *
   * @param {string} containerId - コンテナID
   * @param {number} [maxWait=300000] - 最大待機時間 (ms), デフォルト5分
   * @returns {Promise<Object>} ステータスレスポンス
   * @throws {Error} ERROR/EXPIRED/タイムアウト時
   */
  async waitForContainerReady(containerId, maxWait = 300000) {
    const pollInterval = 60000; // 1分間隔
    const maxAttempts = Math.ceil(maxWait / pollInterval);

    logger.info(`Waiting for container ${containerId} to be ready (max ${maxWait / 1000}s)...`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const url = `${this.apiBaseUrl}/${containerId}?fields=status,error_message`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error ? data.error.message : 'Unknown error';
        throw new Error(`Failed to check container status: ${errorMsg} (HTTP ${response.status})`);
      }

      const status = data.status;
      logger.info(`Container status (attempt ${attempt}/${maxAttempts}): ${status}`);

      switch (status) {
        case 'FINISHED':
          logger.info('Container is ready for publishing');
          return data;

        case 'ERROR':
          throw new Error(
            `Container processing failed: ${data.error_message || 'Unknown error'}`
          );

        case 'EXPIRED':
          throw new Error('Container has expired before publishing');

        case 'IN_PROGRESS':
          if (attempt < maxAttempts) {
            logger.debug(`Container still processing, waiting ${pollInterval / 1000}s...`);
            await this._sleep(pollInterval);
          }
          break;

        default:
          logger.warn(`Unknown container status: ${status}`);
          if (attempt < maxAttempts) {
            await this._sleep(pollInterval);
          }
          break;
      }
    }

    throw new Error(
      `Container ${containerId} did not become ready within ${maxWait / 1000}s`
    );
  }

  /**
   * コンテナを公開する
   *
   * @param {string} containerId - 公開するコンテナのID
   * @returns {Promise<Object>} 公開レスポンス { id }
   * @throws {Error} API呼び出し失敗時
   */
  async publishContainer(containerId) {
    logger.info(`Publishing container: ${containerId}`);

    const params = new URLSearchParams({
      creation_id: containerId
    });

    const url = `${this.apiBaseUrl}/me/threads_publish?${params.toString()}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.error ? data.error.message : 'Unknown error';
      throw new Error(`Failed to publish container: ${errorMsg} (HTTP ${response.status})`);
    }

    logger.info(`Container published successfully: ${data.id}`);
    return data;
  }

  /**
   * 画像付き投稿の一連のフローを実行する
   *
   * フロー:
   *   1. createImageContainer — IMAGEコンテナ作成
   *   2. waitForContainerReady — FINISHEDステータスまでポーリング
   *   3. publishContainer — コンテナ公開
   *
   * @param {string} text - 投稿テキスト
   * @param {string} imageUrl - 公開アクセス可能な画像URL
   * @param {string} [altText] - 画像の代替テキスト
   * @returns {Promise<Object>} { containerId, publishedId }
   * @throws {Error} いずれかのステップで失敗した場合
   */
  async postWithImage(text, imageUrl, altText) {
    logger.info('Starting IMAGE post flow...');
    logger.info(`  Image URL: ${imageUrl}`);
    logger.info(`  Text: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);

    // Step 1: IMAGEコンテナ作成
    logger.info('Step 1/3: Creating IMAGE container...');
    const container = await this.createImageContainer(imageUrl, text, altText);

    // Step 2: ステータスポーリング
    logger.info('Step 2/3: Waiting for container to be ready...');
    await this.waitForContainerReady(container.id);

    // Step 3: 公開
    logger.info('Step 3/3: Publishing container...');
    const published = await this.publishContainer(container.id);

    logger.info('IMAGE post flow completed successfully');

    return {
      containerId: container.id,
      publishedId: published.id
    };
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

module.exports = MediaHandler;
