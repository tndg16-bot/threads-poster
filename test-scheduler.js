#!/usr/bin/env node

/**
 * スケジューラー起動テスト
 */

import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';

// Load .env
dotenv.config({ path: path.join(process.cwd(), '.env') });

console.log('='.repeat(50));
console.log('🧪 スケジューラー起動テスト');
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
  
  // 予約済み投稿の一覧
  console.log('\n📋 予約済み投稿（起動前）:');
  const postsBefore = integration.listScheduledPosts('pending');
  console.log(`   全${postsBefore.length}件`);
  for (const post of postsBefore) {
    const title = post.post.title || post.post.text?.substring(0, 50) || '無題';
    console.log(`   ⏳ ${post.id}`);
    console.log(`      ${title}`);
    console.log(`      🕐 ${new Date(post.scheduledAt).toLocaleString('ja-JP')}`);
  }
  
  // スケジューラーを開始
  console.log('\n🚀 スケジューラーを開始します...');
  console.log('   (30秒後に自動停止します)');
  
  await integration.start();
  
  console.log('✅ スケジューラーが実行中です...');
  
  // 30秒待機
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  // スケジューラーを停止
  console.log('\n🛑 スケジューラーを停止します...');
  await integration.stop();
  console.log('✅ スケジューラーを停止しました');
  
  // 予約済み投稿の一覧（停止後）
  console.log('\n📋 予約済み投稿（停止後）:');
  const postsAfter = integration.listScheduledPosts();
  console.log(`   全${postsAfter.length}件`);
  for (const post of postsAfter) {
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
