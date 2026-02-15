/**
 * Threads API Client
 *
 * Threads Graph APIとの通信を担当
 */

const fetch = require('node-fetch');

class ThreadsClient {
  constructor(config) {
    this.config = config;
    this.baseUrl = `https://graph.threads.net/${config.apiVersion}`;
    this.accessToken = config.accessToken;
  }

  /**
   * HTTPリクエスト共通処理
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${this.accessToken}`
    };

    const logger = require('./logger');
    logger.debug(`Request: ${options.method || 'GET'} ${url}`);

    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data.error || {};
      logger.error(`API Error: ${error.message || response.statusText}`);
      logger.error(`Error Type: ${error.type || 'unknown'}`);
      logger.error(`Error Code: ${error.code || response.status}`);
      throw new Error(`Threads API Error: ${error.message || response.statusText}`);
    }

    logger.debug('Response:', data);
    return data;
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
}

module.exports = ThreadsClient;
