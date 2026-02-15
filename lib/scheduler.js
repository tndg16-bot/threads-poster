/**
 * スケジューラー
 * Threads投稿の配信予約を管理する
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * デフォルト設定
 */
const DEFAULT_CONFIG = {
  scheduleFilePath: path.join(__dirname, '../scheduled-posts.json'),
  checkInterval: 60000, // 1分ごとにチェック
  maxRetries: 3,
  retryDelay: 5000 // 5秒後に再試行
};

/**
 * スケジューラー
 */
class Scheduler {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scheduledPosts = [];
    this.checkTimer = null;
    this.isRunning = false;
  }

  /**
   * スケジュールデータを読み込む
   * @returns {Promise<void>}
   */
  async loadSchedule() {
    try {
      const exists = await fs.pathExists(this.config.scheduleFilePath);
      if (!exists) {
        this.scheduledPosts = [];
        await this.saveSchedule();
        return;
      }

      const data = await fs.readFile(this.config.scheduleFilePath, 'utf8');
      const parsed = JSON.parse(data);
      this.scheduledPosts = parsed.scheduledPosts || [];
    } catch (error) {
      console.error('[Scheduler] スケジュールの読み込みに失敗しました:', error);
      this.scheduledPosts = [];
    }
  }

  /**
   * スケジュールデータを保存する
   * @returns {Promise<void>}
   */
  async saveSchedule() {
    try {
      const data = {
        scheduledPosts: this.scheduledPosts,
        lastUpdated: new Date().toISOString()
      };
      await fs.writeFile(this.config.scheduleFilePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[Scheduler] スケジュールの保存に失敗しました:', error);
      throw error;
    }
  }

  /**
   * 投稿をスケジュールに追加する
   * @param {Object} postData - 投稿データ
   * @param {Date} scheduledAt - 配信日時
   * @returns {Promise<Object>} スケジュールされた投稿
   */
  async schedulePost(postData, scheduledAt) {
    const id = `scheduled_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const scheduledPost = {
      id,
      post: postData,
      scheduledAt: scheduledAt instanceof Date ? scheduledAt.toISOString() : scheduledAt,
      status: 'pending',
      createdAt: new Date().toISOString(),
      threadId: null,
      publishedAt: null,
      retryCount: 0
    };

    this.scheduledPosts.push(scheduledPost);
    await this.saveSchedule();

    console.log(`[Scheduler] 投稿をスケジュールしました: ${id} (${scheduledAt})`);
    return scheduledPost;
  }

  /**
   * スケジュールされた投稿を取得する
   * @param {string} id - スケジュールID
   * @returns {Object|null} スケジュールされた投稿
   */
  getScheduledPost(id) {
    return this.scheduledPosts.find(sp => sp.id === id) || null;
  }

  /**
   * 全てのスケジュールを取得する
   * @param {string} status - ステータスでフィルタリング（オプション）
   * @returns {Array<Object>} スケジュールされた投稿の配列
   */
  getAllScheduledPosts(status = null) {
    if (status) {
      return this.scheduledPosts.filter(sp => sp.status === status);
    }
    return [...this.scheduledPosts];
  }

  /**
   * スケジュールをキャンセルする
   * @param {string} id - スケジュールID
   * @returns {Promise<boolean>} 成功したかどうか
   */
  async cancelScheduledPost(id) {
    const index = this.scheduledPosts.findIndex(sp => sp.id === id);
    if (index === -1) {
      console.error(`[Scheduler] スケジュールが見つかりません: ${id}`);
      return false;
    }

    const scheduledPost = this.scheduledPosts[index];
    if (scheduledPost.status !== 'pending') {
      console.error(`[Scheduler] キャンセルできないステータスです: ${scheduledPost.status}`);
      return false;
    }

    scheduledPost.status = 'cancelled';
    scheduledPost.updatedAt = new Date().toISOString();

    await this.saveSchedule();
    console.log(`[Scheduler] スケジュールをキャンセルしました: ${id}`);
    return true;
  }

  /**
   * 実行すべき投稿を取得する
   * @returns {Array<Object>} 実行すべき投稿の配列
   */
  getDuePosts() {
    const now = new Date();
    return this.scheduledPosts.filter(sp => {
      return sp.status === 'pending' && new Date(sp.scheduledAt) <= now;
    });
  }

  /**
   * 古いスケジュールをクリーンアップする
   * @param {number} days - この日数より古い完了済み・キャンセル済み投稿を削除
   * @returns {Promise<number>} 削除した投稿の数
   */
  async cleanupOldPosts(days = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const beforeCount = this.scheduledPosts.length;
    this.scheduledPosts = this.scheduledPosts.filter(sp => {
      if (sp.status === 'pending') {
        return true; // 保留中は削除しない
      }

      const createdAt = new Date(sp.createdAt);
      if (sp.status === 'failed' && createdAt < cutoffDate) {
        return false; // 古い失敗済みは削除
      }

      const updatedAt = new Date(sp.updatedAt || sp.publishedAt || sp.createdAt);
      if ((sp.status === 'published' || sp.status === 'cancelled') && updatedAt < cutoffDate) {
        return false; // 古い完了済みは削除
      }

      return true;
    });

    const deletedCount = beforeCount - this.scheduledPosts.length;
    if (deletedCount > 0) {
      await this.saveSchedule();
      console.log(`[Scheduler] ${deletedCount}件の古いスケジュールを削除しました`);
    }

    return deletedCount;
  }

  /**
   * 投稿のステータスを更新する
   * @param {string} id - スケジュールID
   * @param {string} status - 新しいステータス
   * @param {Object} metadata - 追加メタデータ
   * @returns {Promise<boolean>} 成功したかどうか
   */
  async updatePostStatus(id, status, metadata = {}) {
    const scheduledPost = this.scheduledPosts.find(sp => sp.id === id);
    if (!scheduledPost) {
      console.error(`[Scheduler] スケジュールが見つかりません: ${id}`);
      return false;
    }

    scheduledPost.status = status;
    scheduledPost.updatedAt = new Date().toISOString();

    if (metadata.threadId) {
      scheduledPost.threadId = metadata.threadId;
    }

    if (metadata.publishedAt) {
      scheduledPost.publishedAt = metadata.publishedAt;
    }

    if (metadata.error) {
      scheduledPost.error = metadata.error;
    }

    await this.saveSchedule();
    return true;
  }

  /**
   * スケジューラーを開始する
   * @param {Function} onPostDue - 投稿実行時のコールバック関数
   * @returns {Promise<void>}
   */
  async start(onPostDue) {
    if (this.isRunning) {
      console.warn('[Scheduler] スケジューラーは既に実行中です');
      return;
    }

    await this.loadSchedule();
    this.isRunning = true;

    console.log('[Scheduler] スケジューラーを開始しました');

    // 定期的チェック
    const checkSchedule = async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        const duePosts = this.getDuePosts();
        console.log(`[Scheduler] 実行すべき投稿: ${duePosts.length}件`);

        for (const scheduledPost of duePosts) {
          try {
            await onPostDue(scheduledPost);
          } catch (error) {
            console.error(`[Scheduler] 投稿の実行中にエラーが発生しました (${scheduledPost.id}):`, error);

            // 失敗時の再試行処理
            scheduledPost.retryCount = (scheduledPost.retryCount || 0) + 1;

            if (scheduledPost.retryCount >= this.config.maxRetries) {
              await this.updatePostStatus(scheduledPost.id, 'failed', {
                error: error.message
              });
            } else {
              console.log(`[Scheduler] 再試行します (${scheduledPost.retryCount}/${this.config.maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
            }
          }
        }

        // 古いスケジュールのクリーンアップ（1日1回）
        await this.cleanupOldPosts(7);

      } catch (error) {
        console.error('[Scheduler] スケジュールチェック中にエラーが発生しました:', error);
      }
    };

    // 最初のチェックを即時実行
    await checkSchedule();

    // 定期的チェック
    this.checkTimer = setInterval(checkSchedule, this.config.checkInterval);
  }

  /**
   * スケジューラーを停止する
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    console.log('[Scheduler] スケジューラーを停止しました');
  }

  /**
   * スケジューラーの実行状態を確認する
   * @returns {boolean} 実行中かどうか
   */
  isActive() {
    return this.isRunning;
  }
}

export default Scheduler;
