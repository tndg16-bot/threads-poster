/**
 * Threads自動投稿スキル
 * ポートフォリオサイトのブログ記事を自動でThreadsに投稿
 */

import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import fetch from 'node-fetch';

/**
 * ブログ記事のメタデータを取得する
 * @param {string} contentPath - ブログ記事のディレクトリパス
 * @returns {Promise<Array>} ブログ記事の配列
 */
async function getBlogPosts(contentPath) {
  try {
    const fileNames = await fs.readdir(contentPath);
    const posts = [];

    for (const fileName of fileNames) {
      if (!fileName.endsWith('.md')) {
        continue;
      }

      const fullPath = path.join(contentPath, fileName);
      const fileContents = await fs.readFile(fullPath, 'utf8');
      const matterResult = matter(fileContents);
      const data = matterResult.data;

      // 未公開の記事をスキップ
      if (data.published === false) {
        continue;
      }

      // 未来の記事をスキップ
      const postDate = new Date(data.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (postDate > today) {
        continue;
      }

      const id = data.slug || fileName.replace(/\.md$/, '');

      posts.push({
        id,
        title: data.title,
        description: data.description,
        category: data.category,
        tags: data.tags || [],
        date: data.date,
        slug: id
      });
    }

    // 日付順にソート（新しい順）
    return posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (error) {
    console.error('[Threads Poster] ブログ記事の取得に失敗しました:', error);
    throw error;
  }
}

/**
 * 投稿済みのスレッドを読み込む
 * @param {string} filePath - 投稿履歴のファイルパス
 * @returns {Promise<Set>} 投稿済みの記事IDのセット
 */
async function loadPostedHistory(filePath) {
  try {
    const exists = await fs.pathExists(filePath);
    if (!exists) {
      return new Set();
    }

    const data = await fs.readFile(filePath, 'utf8');
    const history = JSON.parse(data);
    return new Set(history.postedIds || []);
  } catch (error) {
    console.error('[Threads Poster] 投稿履歴の読み込みに失敗しました:', error);
    return new Set();
  }
}

/**
 * 投稿済みのスレッドを保存する
 * @param {string} filePath - 投稿履歴のファイルパス
 * @param {Set} postedIds - 投稿済みの記事IDのセット
 */
async function savePostedHistory(filePath, postedIds) {
  try {
    const data = {
      postedIds: Array.from(postedIds),
      lastUpdated: new Date().toISOString()
    };
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log('[Threads Poster] 投稿履歴を保存しました');
  } catch (error) {
    console.error('[Threads Poster] 投稿履歴の保存に失敗しました:', error);
    throw error;
  }
}

/**
 * Threads用の投稿内容を生成する
 * @param {Object} post - ブログ記事
 * @param {Object} config - 設定オブジェクト
 * @returns {Promise<string>} Threads用の投稿内容
 */
async function generateThreadPost(post, config) {
  try {
    const { baseUrl } = config.portfolioSite;
    const { generateWithAI } = config.posting;

    // ブログ記事のURLを生成
    const postUrl = `${baseUrl}/blog/${post.slug}`;

    // AI生成が無効な場合、フォールバックロジックを使用
    if (!generateWithAI) {
      return generateFallbackPost(post, postUrl);
    }

    // AIによる投稿内容の生成（現在はフォールバックロジック）
    // 将来的にはOpenAI APIなどを使用してより良い投稿内容を生成
    return generateFallbackPost(post, postUrl);
  } catch (error) {
    console.error('[Threads Poster] 投稿内容の生成に失敗しました:', error);
    throw error;
  }
}

/**
 * フォールバックロジックで投稿内容を生成する
 * @param {Object} post - ブログ記事
 * @param {string} postUrl - ブログ記事のURL
 * @returns {string} Threads用の投稿内容
 */
function generateFallbackPost(post, postUrl) {
  const { title, description, category, tags } = post;

  // 絵文字の選択（カテゴリに応じた絵文字）
  const emojis = {
    'マインドセット': '🧠',
    'AI': '🤖',
    'テクノロジー': '💻',
    'ビジネス': '💼',
    'コーチング': '🎯',
    '学習': '📚'
  };
  const emoji = emojis[category] || '✨';

  // ハッシュタグの選択（最大3つ）
  const hashtags = tags.slice(0, 3).map(tag => `#${tag.replace(/\s/g, '')}`);

  // 投稿内容の構築
  let content = '';

  // タイトルと絵文字
  content += `${title} ${emoji}\n\n`;

  // 説明文（がある場合）
  if (description) {
    content += `${description}\n\n`;
  }

  // URL
  content += `続きはこちら 👇\n${postUrl}\n\n`;

  // ハッシュタグ
  if (hashtags.length > 0) {
    content += hashtags.join(' ');
  }

  // 500文字以内に制限
  if (content.length > 500) {
    content = content.slice(0, 497) + '...';
  }

  return content;
}

/**
 * Threadsにスレッドを作成する
 * @param {string} text - スレッドのテキスト
 * @param {string} accessToken - Threads Access Token
 * @returns {Promise<string>} スレッドID
 */
async function createThread(text, accessToken) {
  try {
    const response = await fetch('https://graph.threads.net/v1.0/me/threads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        media_type: 'TEXT',
        text: text
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Threads API error: ${data.error ? data.error.message : 'Unknown error'}`);
    }

    return data.id;
  } catch (error) {
    console.error('[Threads Poster] スレッドの作成に失敗しました:', error);
    throw error;
  }
}

/**
 * Threadsにスレッドを公開する
 * @param {string} threadId - スレッドID
 * @param {string} accessToken - Threads Access Token
 */
async function publishThread(threadId, accessToken) {
  try {
    const response = await fetch('https://graph.threads.net/v1.0/me/threads_publish', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: threadId
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Threads API error: ${data.error ? data.error.message : 'Unknown error'}`);
    }

    console.log('[Threads Poster] スレッドを公開しました:', threadId);
  } catch (error) {
    console.error('[Threads Poster] スレッドの公開に失敗しました:', error);
    throw error;
  }
}

/**
 * ブログ記事をThreadsに投稿する
 * @param {Object} post - ブログ記事
 * @param {Object} config - 設定オブジェクト
 * @returns {Promise<Object>} 投稿結果
 */
async function postToThreads(post, config) {
  try {
    console.log(`[Threads Poster] 投稿を開始します: ${post.title}`);

    // 投稿内容の生成
    const threadContent = await generateThreadPost(post, config);
    console.log('[Threads Poster] 投稿内容を生成しました:', threadContent);

    // スレッドの作成
    const threadId = await createThread(threadContent, config.threads.accessToken);
    console.log('[Threads Poster] スレッドを作成しました:', threadId);

    // スレッドの公開
    await publishThread(threadId, config.threads.accessToken);

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
 * メイン関数
 * @param {Object} config - 設定オブジェクト
 * @param {Function} sendMessage - Discord送信関数
 */
async function main(config, sendMessage) {
  try {
    console.log('[Threads Poster] 自動投稿を開始します...');

    // ブログ記事の取得
    const posts = await getBlogPosts(config.portfolioSite.contentPath);
    console.log(`[Threads Poster] ${posts.length} 件のブログ記事を取得しました`);

    // 投稿済みの履歴を読み込み
    const postedIds = await loadPostedHistory(config.history.filePath);
    console.log(`[Threads Poster] ${postedIds.size} 件の投稿済み記事を確認しました`);

    // 投稿済みの記事を除外
    const unpostedPosts = posts.filter(post => !postedIds.has(post.id));
    console.log(`[Threads Poster] ${unpostedPosts.length} 件の未投稿記事を検出しました`);

    // 除外カテゴリの記事を除外
    const { excludeCategories } = config.posting;
    const filteredPosts = unpostedPosts.filter(post => {
      if (excludeCategories.includes(post.category)) {
        console.log(`[Threads Poster] 除外カテゴリのためスキップ: ${post.category} - ${post.title}`);
        return false;
      }
      return true;
    });

    // 最大投稿数を制限
    const postsToPost = filteredPosts.slice(0, config.posting.maxPostsPerRun);
    console.log(`[Threads Poster] ${postsToPost.length} 件の記事を投稿します`);

    if (postsToPost.length === 0) {
      const message = '✅ **Threads自動投稿**: 新しい記事はありません';
      await sendMessage(config.discord.channel, message).catch(() => {});
      return;
    }

    // 投稿実行
    const results = [];
    for (const post of postsToPost) {
      const result = await postToThreads(post, config);
      results.push(result);

      // 成功した場合、履歴に追加
      if (result.success) {
        postedIds.add(post.id);
      }

      // レート制限を回避するための待機
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 投稿履歴の保存
    await savePostedHistory(config.history.filePath, postedIds);

    // 結果の通知
    const successfulPosts = results.filter(r => r.success);
    const failedPosts = results.filter(r => !r.success);

    let message = '';
    message += '📱 **Threads自動投稿レポート**\n\n';
    message += `✅ 成功: ${successfulPosts.length}件\n`;
    message += `❌ 失敗: ${failedPosts.length}件\n\n`;

    if (successfulPosts.length > 0) {
      message += '🎉 投稿した記事:\n';
      for (const result of successfulPosts) {
        const post = postsToPost.find(p => p.id === result.postId);
        message += `• ${post.title}\n`;
      }
      message += '\n';
    }

    if (failedPosts.length > 0) {
      message += '⚠️ 失敗した記事:\n';
      for (const result of failedPosts) {
        const post = postsToPost.find(p => p.id === result.postId);
        message += `• ${post.title}: ${result.error}\n`;
      }
    }

    await sendMessage(config.discord.channel, message).catch(() => {});

    console.log('[Threads Poster] 自動投稿を完了しました');
  } catch (error) {
    console.error('[Threads Poster] エラーが発生しました:', error);

    // エラーメッセージを送信
    const errorMessage = '❌ **Threads自動投稿でエラーが発生しました**\n\n```\n' + error.message + '\n```';
    await sendMessage(config.discord.channel, errorMessage).catch(() => {});
  }
}

// エクスポート
export {
  main,
  getBlogPosts,
  loadPostedHistory,
  savePostedHistory,
  generateThreadPost,
  generateFallbackPost,
  createThread,
  publishThread
};

// 直接実行時の処理
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = JSON.parse(await fs.readFile(path.join(__dirname, 'config.json'), 'utf8'));

  // Discord送信関数（OpenClawのmessageツールを使用）
  const sendMessage = async (channel, text) => {
    // OpenClawのmessageツールが利用可能な場合は使用
    if (typeof process.send === 'function') {
      process.send({ type: 'discord', channel, message: text });
    } else {
      console.log(`[Discord] ${channel}: ${text}`);
    }
  };

  await main(config, sendMessage);
}
