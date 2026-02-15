/**
 * スケジューラーのテスト
 */

import Scheduler from '../lib/scheduler.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * テスト用の設定
 */
const TEST_SCHEDULE_FILE = path.join(__dirname, '../test-scheduled-posts.json');

/**
 * テスト実行関数
 */
async function runTests() {
  console.log('🧪 スケジューラーのテストを開始します\n');

  // テスト用の設定
  const scheduler = new Scheduler({
    scheduleFilePath: TEST_SCHEDULE_FILE,
    checkInterval: 1000, // テスト用に短縮
    maxRetries: 2,
    retryDelay: 100
  });

  // テスト結果
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  /**
   * テストヘルパー
   */
  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ ${name}`);
      results.passed++;
      results.tests.push({ name, status: 'passed' });
    } catch (error) {
      console.error(`❌ ${name}`);
      console.error(`   エラー: ${error.message}`);
      results.failed++;
      results.tests.push({ name, status: 'failed', error: error.message });
    }
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  // クリーンアップ
  try {
    await fs.remove(TEST_SCHEDULE_FILE);
  } catch (error) {
    // ファイルが存在しない場合は無視
  }

  // テスト1: スケジュールの初期化
  await test('スケジュールの初期化', async () => {
    await scheduler.loadSchedule();
    assert(scheduler.scheduledPosts.length === 0, '初期状態は空であるべき');
  });

  // テスト2: 投稿のスケジュール追加
  await test('投稿のスケジュール追加', async () => {
    const post = { id: 'test-1', title: 'テスト投稿' };
    const scheduledAt = new Date(Date.now() + 60000); // 1分後

    const scheduledPost = await scheduler.schedulePost(post, scheduledAt);

    assert(scheduledPost.id !== undefined, 'IDが設定されているべき');
    assert(scheduledPost.post.id === 'test-1', '投稿データが保存されているべき');
    assert(scheduledPost.status === 'pending', 'ステータスがpendingであるべき');
  });

  // テスト3: スケジュールの取得
  await test('スケジュールの取得', async () => {
    const posts = scheduler.getAllScheduledPosts();
    assert(posts.length === 1, '1件のスケジュールが存在するべき');

    const post = scheduler.getScheduledPost(posts[0].id);
    assert(post !== null, 'IDでスケジュールを取得できるべき');
    assert(post.id === posts[0].id, '取得したスケジュールが一致するべき');
  });

  // テスト4: 複数のスケジュール追加
  await test('複数のスケジュール追加', async () => {
    await scheduler.schedulePost({ id: 'test-2', title: 'テスト投稿2' }, new Date(Date.now() + 120000));
    await scheduler.schedulePost({ id: 'test-3', title: 'テスト投稿3' }, new Date(Date.now() + 180000));

    const posts = scheduler.getAllScheduledPosts();
    assert(posts.length === 3, '3件のスケジュールが存在するべき');
  });

  // テスト5: ステータスによるフィルタリング
  await test('ステータスによるフィルタリング', async () => {
    const pendingPosts = scheduler.getAllScheduledPosts('pending');
    assert(pendingPosts.length === 3, '3件のpendingスケジュールが存在するべき');

    const publishedPosts = scheduler.getAllScheduledPosts('published');
    assert(publishedPosts.length === 0, 'publishedスケジュールは存在しないべき');
  });

  // テスト6: 実行すべき投稿の判定
  await test('実行すべき投稿の判定', async () => {
    // 過去の時刻でスケジュール追加
    const pastPost = await scheduler.schedulePost(
      { id: 'test-past', title: '過去の投稿' },
      new Date(Date.now() - 1000)
    );

    const duePosts = scheduler.getDuePosts();
    assert(duePosts.length === 1, '1件の実行すべき投稿が存在するべき');
    assert(duePosts[0].id === pastPost.id, '過去の投稿が取得されるべき');
  });

  // テスト7: スケジュールのキャンセル
  await test('スケジュールのキャンセル', async () => {
    const posts = scheduler.getAllScheduledPosts('pending');
    const targetId = posts[0].id;

    const success = await scheduler.cancelScheduledPost(targetId);
    assert(success, 'キャンセルに成功すべき');

    const cancelledPosts = scheduler.getAllScheduledPosts('cancelled');
    assert(cancelledPosts.length === 1, '1件のcancelledスケジュールが存在するべき');
    assert(cancelledPosts[0].id === targetId, 'キャンセルしたスケジュールが一致するべき');
  });

  // テスト8: ステータスの更新
  await test('ステータスの更新', async () => {
    const posts = scheduler.getAllScheduledPosts('pending');
    const targetId = posts[0].id;

    const success = await scheduler.updatePostStatus(targetId, 'published', {
      threadId: 'thread-123',
      publishedAt: new Date().toISOString()
    });

    assert(success, 'ステータス更新に成功すべき');

    const updatedPost = scheduler.getScheduledPost(targetId);
    assert(updatedPost.status === 'published', 'ステータスがpublishedであるべき');
    assert(updatedPost.threadId === 'thread-123', 'threadIdが保存されているべき');
  });

  // テスト9: 古いスケジュールのクリーンアップ
  await test('古いスケジュールのクリーンアップ', async () => {
    // 古い日時の投稿を追加
    await scheduler.schedulePost({ id: 'test-old', title: '古い投稿' }, new Date(Date.now() - 864000000));
    await scheduler.updatePostStatus(`test-old`, 'published');

    const beforeCount = scheduler.getAllScheduledPosts().length;
    const deletedCount = await scheduler.cleanupOldPosts(0); // 全ての完了済みを削除
    const afterCount = scheduler.getAllScheduledPosts().length;

    assert(deletedCount > 0, '古いスケジュールが削除されるべき');
    assert(afterCount < beforeCount, '削除後にスケジュール数が減るべき');
  });

  // テスト10: スケジュールデータの永続化
  await test('スケジュールデータの永続化', async () => {
    // スケジューラーを再作成
    const newScheduler = new Scheduler({
      scheduleFilePath: TEST_SCHEDULE_FILE
    });

    await newScheduler.loadSchedule();

    const posts = newScheduler.getAllScheduledPosts();
    assert(posts.length > 0, '永続化されたスケジュールが読み込まれるべき');
  });

  // テスト11: スケジューラーの開始・停止
  await test('スケジューラーの開始・停止', async () => {
    assert(!scheduler.isActive(), '初期状態は停止しているべき');

    await scheduler.start(() => {});
    assert(scheduler.isActive(), '開始後にアクティブであるべき');

    await scheduler.stop();
    assert(!scheduler.isActive(), '停止後に非アクティブであるべき');
  });

  // テスト12: スケジュールの保存・読み込み
  await test('スケジュールの保存・読み込み', async () => {
    const testScheduler = new Scheduler({
      scheduleFilePath: TEST_SCHEDULE_FILE
    });

    await testScheduler.loadSchedule();

    // 保存前にデータを確認
    const postCount1 = testScheduler.getAllScheduledPosts().length;
    assert(postCount1 > 0, 'スケジュールが読み込まれているべき');

    // 新しいスケジュールを追加して保存
    await testScheduler.schedulePost(
      { id: 'test-save', title: '保存テスト' },
      new Date(Date.now() + 300000)
    );

    // 再読み込み
    await testScheduler.loadSchedule();

    const postCount2 = testScheduler.getAllScheduledPosts().length;
    assert(postCount2 > postCount1, '保存されたスケジュールが読み込まれるべき');
  });

  // 結果の表示
  console.log('\n' + '='.repeat(50));
  console.log('📊 テスト結果');
  console.log('='.repeat(50));
  console.log(`✅ 成功: ${results.passed}`);
  console.log(`❌ 失敗: ${results.failed}`);
  console.log(`📝 合計: ${results.passed + results.failed}`);

  if (results.failed > 0) {
    console.log('\n❌ 失敗したテスト:');
    for (const test of results.tests) {
      if (test.status === 'failed') {
        console.log(`   • ${test.name}`);
      }
    }
  }

  // クリーンアップ
  try {
    await fs.remove(TEST_SCHEDULE_FILE);
  } catch (error) {
    // ファイルが存在しない場合は無視
  }

  // スケジューラーの停止
  if (scheduler.isActive()) {
    await scheduler.stop();
  }

  // 終了コード
  process.exit(results.failed > 0 ? 1 : 0);
}

// テスト実行
runTests().catch(error => {
  console.error('テスト実行中にエラーが発生しました:', error);
  process.exit(1);
});
