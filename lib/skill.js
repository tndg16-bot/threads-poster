/**
 * Threads Poster Skill - OpenClaw Integration
 *
 * OpenClawスキルとしてのエントリーポイント
 */

const ThreadsClient = require('./threads-client');
const { loadConfig } = require('./config');
const logger = require('./logger');

class ThreadsPosterSkill {
  constructor() {
    this.config = loadConfig();
    this.client = null;
  }

  /**
   * スキルの初期化
   */
  async init() {
    if (!this.config.accessToken) {
      throw new Error('Access token not configured. Please set THREADS_ACCESS_TOKEN in .env or config.json');
    }

    this.client = new ThreadsClient(this.config);
    logger.info('Threads Poster Skill initialized');
  }

  /**
   * 認証チェック
   */
  async checkAuth() {
    if (!this.client) {
      await this.init();
    }

    const isValid = await this.client.checkAuth();
    if (isValid) {
      const userInfo = await this.client.getUserInfo();
      return {
        authenticated: true,
        username: userInfo.username,
        userId: userInfo.id
      };
    } else {
      return {
        authenticated: false,
        error: 'Authentication failed'
      };
    }
  }

  /**
   * 投稿を作成して公開
   */
  async post(text, options = {}) {
    if (!this.client) {
      await this.init();
    }

    const result = await this.client.createAndPublishPost(text, options);
    return {
      success: true,
      threadId: result.threadId,
      permalink: result.permalink,
      containerId: result.containerId
    };
  }

  /**
   * 投稿コンテナの作成のみ
   */
  async createContainer(text, options = {}) {
    if (!this.client) {
      await this.init();
    }

    const container = await this.client.createPostContainer(text, options);
    return {
      success: true,
      containerId: container.id
    };
  }

  /**
   * コンテナを公開
   */
  async publish(containerId) {
    if (!this.client) {
      await this.init();
    }

    const result = await this.client.publishPost(containerId);
    return {
      success: true,
      threadId: result.id
    };
  }

  /**
   * ユーザー情報を取得
   */
  async getUserInfo() {
    if (!this.client) {
      await this.init();
    }

    return await this.client.getUserInfo();
  }

  /**
   * ユーザーの投稿一覧を取得
   */
  async getUserPosts(limit = 25) {
    if (!this.client) {
      await this.init();
    }

    return await this.client.getUserPosts(limit);
  }

  /**
   * ドライランモードの設定
   */
  setDryRun(dryRun) {
    this.config.dryRun = dryRun;
    if (this.client) {
      this.client.config.dryRun = dryRun;
    }
    logger.info(`Dry run mode: ${dryRun}`);
  }
}

// Export for OpenClaw
module.exports = {
  name: 'threads-poster',
  version: '1.0.0',
  description: 'Threads APIを通じて自動的にテキスト投稿を行うスキル',
  class: ThreadsPosterSkill,

  // Skill metadata
  metadata: {
    author: 'OpenClaw Team',
    license: 'MIT',
    requires: ['node-fetch', 'dotenv'],
    permissions: {
      threads_basic: 'Basic Threads access',
      threads_content_publish: 'Publish content to Threads'
    }
  }
};
