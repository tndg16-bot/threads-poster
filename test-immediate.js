#!/usr/bin/env node

/**
 * 即時実行テスト
 */

import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';

// Load .env
dotenv.config({ path: path.join(process.cwd(), '.env') });

console.log('='.repeat(50));
console.log('🧪 即時実行テスト');
console.log('='.repeat(50));

// config.jsonの読み込み
try {
  const configPath = path.join(process.cwd(), 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('\n✅ config.jsonを読み込みました');
  
  // SchedulerIntegrationをインポート
  const { SchedulerIntegration } = await import('./scheduler-integration.js');
  
  // Discord送信関数
  const sendMessage = async (channel, text) => {
    console.log(`\n[Discord] ${channel}:\n${text}`);
  };
  
  // インスタンス作成
  const integration = new SchedulerIntegration(config, sendMessage);
  console.log('✅ SchedulerIntegrationを初期化しました');
  
  // 過去の日時でテスト投稿を追加（すぐに実行される）
  console.log('\n📅 即時実行用のスケジュールを追加します...');
  const pastScheduledAt = new Date(Date.now() - 60000); // 1分前
  const scheduledPost = await integration.scheduleTextPost(
    "🧪 即時実行テスト - Threads APIスキル #Test #OpenClaw",
    pastScheduledAt
  );
  
  console.log(`✅ スケジュールを追加しました`);
  console.log(`   ID: ${scheduledPost.id}`);
  console.log(`   配信日時: ${pastScheduledAt.toLocaleString('ja-JP')} (過去)`);
  
  // スケジューラーを開始
  console.log('\n🚀 スケジューラーを開始します...');
  console.log('   (10秒後に自動停止します)');
  
  await integration.start();
  
  console.log('✅ スケジューラーが実行中です...');
  console.log('   投稿実行を待機中...\n');
  
  // 10秒待機（投稿実行の時間）
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  // スケジューラーを停止
  console.log('🛑 スケジューラーを停止します...');
  await integration.stop();
  console.log('✅ スケジューラーを停止しました');
  
  // 予約済み投稿の一覧
  console.log('\n📋 予約済み投稿:');
  const posts = integration.listScheduledPosts();
  console.log(`   全${posts.length}件`);
  for (const post of posts) {
    const statusEmoji = {
      pending: '⏳',
      published: '✅',
      failed: '❌',
      cancelled: '🗑️'
    }[post.status] || '❓';
    
    const title = post.post.title || post.post.text?.substring(0, 50) || '無題';
    console.log(`   ${statusEmoji} ${post.id}`);
    console.log(`      ${title}`);
    console.log(`      🕐 ${new Date(post.scheduledAt).toLocaleString('ja-JP')}`);
    console.log(`      📊 ステータス: ${post.status}`);
    if (post.threadId) {
      console.log(`      🔗 Thread ID: ${post.threadId}`);
    }
    if (post.publishedAt) {
      console.log(`      📤 公開日時: ${new Date(post.publishedAt).toLocaleString('ja-JP')}`);
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ テストが完了しました');
  console.log('='.repeat(50));
  
  process.exit(0);
  
} catch (error) {
  console.error('❌ エラーが発生しました:', error.message);
  console.error(error.stack);
  process.exit(1);
}
