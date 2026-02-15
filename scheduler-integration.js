/**
 * スケジューラー統合
 * スケジュール管理機能をThreads APIと統合する
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

import Scheduler from './lib/scheduler.js';
import { generateThreadPost, generateFallbackPost, createThread, publishThread } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env
dotenv.config({ path: path.join(__dirname, '.env') });

/**
 * スケジュール統合クラス
 */
class SchedulerIntegration {
  constructor(config, sendMessage) {
    this.config = config;
    this.sendMessage = sendMessage || (() => {});
    this.scheduler = new Scheduler();
  }

  /**
   * スケジューラーを初期化・開始する
   * @returns {Promise<void>}
   */
  async start() {
    await this.scheduler.start(async (scheduledPost) => {
      await this.executeScheduledPost(scheduledPost);
    });
    console.log('[Scheduler Integration] スケジューラーを開始しました');
  }

  /**
   * スケジューラーを停止する
   * @returns {Promise<void>}
   */
  async stop() {
    await this.scheduler.stop();
    console.log('[Scheduler Integration] スケジューラーを停止しました');
  }

  /**
   * スケジュールされた投稿を実行する
   * @param {Object} scheduledPost - スケジュールされた投稿
   * @returns {Promise<void>}
   */
  async executeScheduledPost(scheduledPost) {
    console.log(`[Scheduler Integration] 投稿を実行します: ${scheduledPost.id}`);

    try {
      // 投稿実行
      const result = await this.postToThreads(scheduledPost.post);

      // ステータスを更新
      if (result.success) {
        await this.scheduler.updatePostStatus(scheduledPost.id, 'published', {
          threadId: result.threadId,
          publishedAt: new Date().toISOString()
        });

        // 成功通知
        const message = `✅ **配信予約投稿が完了しました**\n\n` +
          `📝 ${scheduledPost.post.title || '無題'}\n` +
          `🕐 ${scheduledPost.scheduledAt}\n` +
          `🔗 Thread ID: ${result.threadId}`;
        await this.sendMessage(this.config.discord.channel, message).catch(() => {});

      } else {
        await this.scheduler.updatePostStatus(scheduledPost.id, 'failed', {
          error: result.error
        });

        // 失敗通知
        const message = `❌ **配信予約投稿に失敗しました**\n\n` +
          `📝 ${scheduledPost.post.title || '無題'}\n` +
          `🕐 ${scheduledPost.scheduledAt}\n` +
          `❌ エラー: ${result.error}`;
        await this.sendMessage(this.config.discord.channel, message).catch(() => {});
      }

    } catch (error) {
      console.error(`[Scheduler Integration] 投稿実行中にエラーが発生しました:`, error);
      await this.scheduler.updatePostStatus(scheduledPost.id, 'failed', {
        error: error.message
      });
    }
  }

  /**
   * ブログ記事をThreadsに投稿する
   * @param {Object} post - ブログ記事
   * @returns {Promise<Object>} 投稿結果
   */
  async postToThreads(post) {
    try {
      console.log(`[Threads Poster] 投稿を開始します: ${post.title}`);

      // 投稿内容の生成
      const threadContent = this.config.posting.generateWithAI
        ? await generateThreadPost(post, this.config)
        : generateFallbackPost(post, `${this.config.portfolioSite.baseUrl}/blog/${post.slug}`);

      console.log('[Threads Poster] 投稿内容を生成しました:', threadContent);

      // スレッドの作成
      const threadId = await createThread(threadContent, this.config.threads.accessToken);
      console.log('[Threads Poster] スレッドを作成しました:', threadId);

      // スレッドの公開
      await publishThread(threadId, this.config.threads.accessToken);

      return {
        success: true,
        postId: post.id,
        threadId: threadId,
        threadContent: threadContent
      };
    } catch (error) {
      console.error('[Threads Poster] Threadsへの投稿に失敗しました:', error);
      return {
        success: false,
        postId: post.id,
        error: error.message
      };
    }
  }

  /**
   * ブログ記事の配信予約を追加する
   * @param {Object} post - ブログ記事
   * @param {Date} scheduledAt - 配信日時
   * @returns {Promise<Object>} スケジュールされた投稿
   */
  async schedulePost(post, scheduledAt) {
    console.log(`[Scheduler Integration] 投稿の配信予約を追加します: ${post.title} (${scheduledAt})`);

    const scheduledPost = await this.scheduler.schedulePost(post, scheduledAt);

    // 通知
    const message = `📅 **配信予約を追加しました**\n\n` +
      `📝 ${post.title}\n` +
      `🕐 ${scheduledAt.toLocaleString('ja-JP')}\n` +
      `🆔 予約ID: ${scheduledPost.id}`;
    await this.sendMessage(this.config.discord.channel, message).catch(() => {});

    return scheduledPost;
  }

  /**
   * テキスト投稿の配信予約を追加する
   * @param {string} text - 投稿テキスト
   * @param {Date} scheduledAt - 配信日時
   * @param {Object} metadata - 追加メタデータ
   * @returns {Promise<Object>} スケジュールされた投稿
   */
  async scheduleTextPost(text, scheduledAt, metadata = {}) {
    console.log(`[Scheduler Integration] テキスト投稿の配信予約を追加します (${scheduledAt})`);

    const postData = {
      type: 'text',
      text: text,
      ...metadata
    };

    const scheduledPost = await this.scheduler.schedulePost(postData, scheduledAt);

    // 通知
    const message = `📅 **テキスト投稿の配信予約を追加しました**\n\n` +
      `📝 ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}\n` +
      `🕐 ${scheduledAt.toLocaleString('ja-JP')}\n` +
      `🆔 予約ID: ${scheduledPost.id}`;
    await this.sendMessage(this.config.discord.channel, message).catch(() => {});

    return scheduledPost;
  }

  /**
   * 予約済み投稿の一覧を取得する
   * @param {string} status - ステータスでフィルタリング（オプション）
   * @returns {Array<Object>} 予約済み投稿の配列
   */
  listScheduledPosts(status = null) {
    return this.scheduler.getAllScheduledPosts(status);
  }

  /**
   * 配信予約をキャンセルする
   * @param {string} id - スケジュールID
   * @returns {Promise<boolean>} 成功したかどうか
   */
  async cancelScheduledPost(id) {
    console.log(`[Scheduler Integration] 配信予約をキャンセルします: ${id}`);

    const success = await this.scheduler.cancelScheduledPost(id);

    if (success) {
      // 通知
      const message = `🗑️ **配信予約をキャンセルしました**\n\n` +
        `🆔 予約ID: ${id}`;
      await this.sendMessage(this.config.discord.channel, message).catch(() => {});
    }

    return success;
  }

  /**
   * 古いスケジュールをクリーンアップする
   * @param {number} days - この日数より古い完了済み投稿を削除
   * @returns {Promise<number>} 削除した投稿の数
   */
  async cleanupOldPosts(days = 7) {
    console.log(`[Scheduler Integration] 古いスケジュールをクリーンアップします (${days}日)`);
    return await this.scheduler.cleanupOldPosts(days);
  }

  /**
   * スケジューラーの実行状態を確認する
   * @returns {boolean} 実行中かどうか
   */
  isActive() {
    return this.scheduler.isActive();
  }

  /**
   * 統計情報を取得する
   * @returns {Object} 統計情報
   */
  getStats() {
    const posts = this.scheduler.getAllScheduledPosts();

    return {
      total: posts.length,
      pending: posts.filter(p => p.status === 'pending').length,
      published: posts.filter(p => p.status === 'published').length,
      failed: posts.filter(p => p.status === 'failed').length,
      cancelled: posts.filter(p => p.status === 'cancelled').length,
      isActive: this.scheduler.isActive()
    };
  }
}

/**
 * メイン関数（CLI使用）
 * @param {Object} config - 設定オブジェクト
 * @param {Function} sendMessage - Discord送信関数
 */
async function main(config, sendMessage) {
  const integration = new SchedulerIntegration(config, sendMessage);

  // CLIコマンドの解析
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case '--start':
      // スケジューラーを開始（デーモンとして実行）
      console.log('[Scheduler Integration] スケジューラーを開始します（Ctrl+Cで停止）');
      await integration.start();

      // 終了処理
      process.on('SIGINT', async () => {
        console.log('\n[Scheduler Integration] 終了信号を受信しました');
        await integration.stop();
        process.exit(0);
      });

      // プロセスを維持
      await new Promise(() => {});
      break;

    case '--schedule': {
      // 投稿の配信予約
      const postId = args[1];
      const scheduledAt = new Date(args[2]);

      if (!postId || !scheduledAt.getTime()) {
        console.error('使用方法: node scheduler-integration.js --schedule <postId> <scheduledAt>');
        process.exit(1);
      }

      // ブログ記事を取得
      const { getBlogPosts } = await import('./index.js');
      const posts = await getBlogPosts(config.portfolioSite.contentPath);
      const post = posts.find(p => p.id === postId);

      if (!post) {
        console.error(`記事が見つかりません: ${postId}`);
        process.exit(1);
      }

      await integration.schedulePost(post, scheduledAt);
      break;
    }

    case '--schedule-text': {
      // テキスト投稿の配信予約
      const text = args[1];
      const scheduledAt = new Date(args[2]);

      if (!text || !scheduledAt.getTime()) {
        console.error('使用方法: node scheduler-integration.js --schedule-text <text> <scheduledAt>');
        console.error('例: node scheduler-integration.js --schedule-text "Hello, Threads!" "2026-02-16T10:00:00"');
        process.exit(1);
      }

      await integration.scheduleTextPost(text, scheduledAt);
      break;
    }

    case '--list':
      // 予約済み投稿の一覧表示
      const statusFilter = args[1] || null;
      const posts = integration.listScheduledPosts(statusFilter);

      console.log('\n📅 配信予約一覧');
      console.log(`全${posts.length}件\n`);

      for (const post of posts) {
        const statusEmoji = {
          pending: '⏳',
          published: '✅',
          failed: '❌',
          cancelled: '🗑️'
        }[post.status] || '❓';

        const title = post.post.title || post.post.text?.substring(0, 50) || '無題';
        console.log(`${statusEmoji} ${post.id}`);
        console.log(`   ${title}`);
        console.log(`   🕐 ${new Date(post.scheduledAt).toLocaleString('ja-JP')}`);
        console.log(`   📊 ステータス: ${post.status}`);
        console.log();
      }
      break;

    case '--cancel':
      // 配信予約のキャンセル
      const id = args[1];
      if (!id) {
        console.error('使用方法: node scheduler-integration.js --cancel <id>');
        process.exit(1);
      }

      const success = await integration.cancelScheduledPost(id);
      if (success) {
        console.log('✅ 配信予約をキャンセルしました');
      } else {
        console.log('❌ 配信予約のキャンセルに失敗しました');
      }
      break;

    case '--stats':
      // 統計情報の表示
      const stats = integration.getStats();

      console.log('\n📊 スケジューラー統計');
      console.log(`実行中: ${stats.isActive ? '✅' : '❌'}`);
      console.log(`総数: ${stats.total}`);
      console.log(`待機中: ${stats.pending}`);
      console.log(`完了: ${stats.published}`);
      console.log(`失敗: ${stats.failed}`);
      console.log(`キャンセル済み: ${stats.cancelled}`);
      break;

    default:
      console.log(`
📅 Threads配信予約ツール

使用方法:
  node scheduler-integration.js --start                      スケジューラーを開始
  node scheduler-integration.js --schedule <postId> <date>  ブログ記事の配信予約
  node scheduler-integration.js --schedule-text <text> <date> テキスト投稿の配信予約
  node scheduler-integration.js --list [status]             予約済み投稿の一覧
  node scheduler-integration.js --cancel <id>               配信予約のキャンセル
  node scheduler-integration.js --stats                     統計情報の表示

例:
  node scheduler-integration.js --schedule post123 "2026-02-16T10:00:00"
  node scheduler-integration.js --schedule-text "Hello!" "2026-02-16T10:00:00"
  node scheduler-integration.js --list pending
  node scheduler-integration.js --cancel scheduled_1234567890

日時フォーマット: ISO 8601 (例: "2026-02-16T10:00:00")
      `);
  }
}

// エクスポート
export { SchedulerIntegration, main };

// 直接実行時の処理
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const config = JSON.parse(await fs.readFile(path.join(__dirname, 'config.json'), 'utf8'));

    // Discord送信関数
    const sendMessage = async (channel, text) => {
      if (typeof process.send === 'function') {
        process.send({ type: 'discord', channel, message: text });
      } else {
        console.log(`[Discord] ${channel}: ${text}`);
      }
    };

    await main(config, sendMessage);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}
