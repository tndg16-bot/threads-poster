#!/usr/bin/env node

/**
 * 簡易版テスト
 */

import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';

// Load .env
dotenv.config({ path: path.join(process.cwd(), '.env') });

console.log('='.repeat(50));
console.log('🧪 Threads API - 簡易版テスト');
console.log('='.repeat(50));

// 環境変数の確認
console.log('\n[1] 環境変数の確認:');
console.log(`THREADS_ACCESS_TOKEN: ${process.env.THREADS_ACCESS_TOKEN ? '✅ 設定済み' : '❌ 未設定'}`);
console.log(`THREADS_DRY_RUN: ${process.env.THREADS_DRY_RUN || 'false'}`);

// config.jsonの読み込み
console.log('\n[2] config.jsonの読み込み:');
try {
  const configPath = path.join(process.cwd(), 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('✅ config.jsonを読み込みました');
  console.log(`   Discord Channel: ${config.discord.channel}`);
  console.log(`   Max Posts: ${config.posting.maxPostsPerRun}`);
} catch (error) {
  console.log('❌ config.jsonの読み込みに失敗しました');
  console.log(`   エラー: ${error.message}`);
  process.exit(1);
}

// Schedulerのテスト
console.log('\n[3] Schedulerのテスト:');
try {
  const Scheduler = (await import('./lib/scheduler.js')).default;
  const scheduler = new Scheduler();
  console.log('✅ Schedulerを初期化しました');
  
  // テストスケジュールの追加
  const testPost = {
    id: 'test-001',
    title: 'テスト投稿',
    text: '🧪 テスト投稿です'
  };
  const scheduledAt = new Date(Date.now() + 60000); // 1分後
  
  console.log(`   スケジュールを追加: ${testPost.title} (${scheduledAt.toLocaleString('ja-JP')})`);
  const scheduledPost = await scheduler.schedulePost(testPost, scheduledAt);
  console.log('✅ スケジュールを追加しました');
  console.log(`   ID: ${scheduledPost.id}`);
  console.log(`   ステータス: ${scheduledPost.status}`);
  
  // スケジュールの一覧
  const posts = scheduler.getAllScheduledPosts();
  console.log(`\n   予約済み投稿: ${posts.length}件`);
  for (const post of posts) {
    console.log(`   - ${post.id}: ${post.post.title || post.post.text}`);
  }
  
  // スケジューラーを停止
  if (scheduler.isActive()) {
    await scheduler.stop();
  }
  
} catch (error) {
  console.log('❌ Schedulerのテストに失敗しました');
  console.log(`   エラー: ${error.message}`);
  console.log(`   スタック: ${error.stack}`);
  process.exit(1);
}

console.log('\n' + '='.repeat(50));
console.log('✅ すべてのテストが完了しました');
console.log('='.repeat(50));
