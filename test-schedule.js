#!/usr/bin/env node

/**
 * スケジュールテスト
 */

import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';

// Load .env
dotenv.config({ path: path.join(process.cwd(), '.env') });

console.log('='.repeat(50));
console.log('🧪 スケジュールテスト');
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
  
  // テスト投稿のスケジュール
  console.log('\n📅 スケジュールを追加します...');
  const scheduledAt = new Date(Date.now() + 60000); // 1分後
  const scheduledPost = await integration.scheduleTextPost(
    "🧪 テスト投稿です - Threads APIスキルの動作確認 #Test #OpenClaw",
    scheduledAt
  );
  
  console.log(`✅ スケジュールを追加しました`);
  console.log(`   ID: ${scheduledPost.id}`);
  console.log(`   ステータス: ${scheduledPost.status}`);
  console.log(`   配信日時: ${scheduledAt.toLocaleString('ja-JP')}`);
  
  // 予約済み投稿の一覧
  console.log('\n📋 予約済み投稿:');
  const posts = integration.listScheduledPosts('pending');
  for (const post of posts) {
    const title = post.post.title || post.post.text?.substring(0, 50) || '無題';
    console.log(`   ⏳ ${post.id}`);
    console.log(`      ${title}`);
    console.log(`      🕐 ${new Date(post.scheduledAt).toLocaleString('ja-JP')}`);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ テストが完了しました');
  console.log('='.repeat(50));
  
} catch (error) {
  console.error('❌ エラーが発生しました:', error.message);
  console.error(error.stack);
  process.exit(1);
}
