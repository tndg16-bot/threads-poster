/**
 * Threads API Router
 *
 * Threads Graph API への投稿・クォータ確認・インサイト取得を提供
 * 2ステップフロー: コンテナ作成 → 公開
 */

import { Router } from 'express';
import fetch from 'node-fetch';

const router = Router();

const API_VERSION = process.env.THREADS_API_VERSION || 'v1.0';
const BASE_URL = `https://graph.threads.net/${API_VERSION}`;

/**
 * アクセストークンを取得する
 */
function getAccessToken() {
  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!token) {
    throw new Error('THREADS_ACCESS_TOKEN environment variable is required.');
  }
  return token;
}

/**
 * Threads API に認証付きリクエストを送信する
 * @param {string} endpoint - APIエンドポイント（BASE_URL以降のパス）
 * @param {Object} options - fetchオプション
 * @returns {Promise<Object>} パース済みJSONレスポンス
 */
async function threadsRequest(endpoint, options = {}) {
  const token = getAccessToken();
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data.error ? data.error.message : `HTTP ${response.status}`;
    const errorCode = data.error ? data.error.code : response.status;
    const err = new Error(`Threads API error (${errorCode}): ${errorMsg}`);
    err.status = response.status;
    err.apiError = data.error || null;
    throw err;
  }

  return data;
}

/**
 * テキスト投稿コンテナを作成する
 * @param {string} text - 投稿テキスト
 * @param {Object} options
 * @param {string} [options.replyToId] - リプライ先の投稿ID
 * @returns {Promise<Object>} { id: containerId }
 */
async function createTextContainer(text, options = {}) {
  const params = new URLSearchParams({
    media_type: 'TEXT',
    text,
  });

  if (options.replyToId) {
    params.append('reply_to_id', options.replyToId);
  }

  return threadsRequest(`/me/threads?${params.toString()}`, { method: 'POST' });
}

/**
 * 画像投稿コンテナを作成する
 * @param {string} imageUrl - 公開アクセス可能な画像URL
 * @param {string} text - 投稿テキスト
 * @param {Object} options
 * @param {string} [options.replyToId] - リプライ先の投稿ID
 * @returns {Promise<Object>} { id: containerId }
 */
async function createImageContainer(imageUrl, text, options = {}) {
  const params = new URLSearchParams({
    media_type: 'IMAGE',
    image_url: imageUrl,
    text,
  });

  if (options.replyToId) {
    params.append('reply_to_id', options.replyToId);
  }

  return threadsRequest(`/me/threads?${params.toString()}`, { method: 'POST' });
}

/**
 * IMAGEコンテナのステータスをポーリングしてFINISHEDを待つ
 * @param {string} containerId
 * @param {number} maxWaitMs - 最大待機時間（デフォルト: 60秒）
 * @returns {Promise<void>}
 */
async function waitForContainerReady(containerId, maxWaitMs = 60000) {
  const pollIntervalMs = 3000;
  const maxAttempts = Math.ceil(maxWaitMs / pollIntervalMs);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const data = await threadsRequest(`/${containerId}?fields=status,error_message`);

    switch (data.status) {
      case 'FINISHED':
        return;
      case 'ERROR':
        throw new Error(`Container processing failed: ${data.error_message || 'Unknown error'}`);
      case 'EXPIRED':
        throw new Error('Container expired before publishing.');
      case 'IN_PROGRESS':
      default:
        // Wait and retry
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        break;
    }
  }

  throw new Error(`Container ${containerId} did not become ready within ${maxWaitMs / 1000}s.`);
}

/**
 * コンテナを公開する
 * @param {string} containerId
 * @returns {Promise<Object>} { id: publishedPostId }
 */
async function publishContainer(containerId) {
  const params = new URLSearchParams({ creation_id: containerId });
  return threadsRequest(`/me/threads_publish?${params.toString()}`, { method: 'POST' });
}

// --- Routes ---

/**
 * POST /api/threads/post
 * Threadsに1件投稿する
 *
 * Body: { text, topicTag?, imageUrl?, replyToId? }
 * Response: { success, publishedId }
 */
router.post('/post', async (req, res) => {
  try {
    const { text, topicTag, imageUrl, replyToId } = req.body;

    if (!text || text.trim() === '') {
      return res.status(400).json({ success: false, error: 'text field is required.' });
    }

    // Build the final text, appending topicTag as a hashtag if provided
    let finalText = text.trim();
    if (topicTag) {
      const tag = topicTag.startsWith('#') ? topicTag : `#${topicTag}`;
      finalText = `${finalText}\n\n${tag}`;
    }

    // Enforce Threads 500-character limit
    if (finalText.length > 500) {
      return res.status(400).json({
        success: false,
        error: `Text exceeds 500-character limit (${finalText.length} chars).`,
      });
    }

    let container;

    if (imageUrl) {
      // IMAGE post flow
      container = await createImageContainer(imageUrl, finalText, { replyToId });
      // IMAGE containers may need processing time
      await waitForContainerReady(container.id);
    } else {
      // TEXT post flow
      container = await createTextContainer(finalText, { replyToId });
    }

    // Publish
    const published = await publishContainer(container.id);

    console.log(`[Threads] Published post: ${published.id}`);

    res.json({
      success: true,
      publishedId: published.id,
    });
  } catch (error) {
    console.error('POST /api/threads/post error:', error.message);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/threads/post-with-reply
 * メイン投稿 + 自己リプライ（URL付き）の2段階投稿
 *
 * Body: { text, topicTag?, imageUrl?, replyUrl }
 * Response: { success, mainId, replyId }
 */
router.post('/post-with-reply', async (req, res) => {
  try {
    const { text, topicTag, imageUrl, replyUrl } = req.body;

    if (!text || text.trim() === '') {
      return res.status(400).json({ success: false, error: 'text field is required.' });
    }
    if (!replyUrl || replyUrl.trim() === '') {
      return res.status(400).json({ success: false, error: 'replyUrl field is required.' });
    }

    // Build main text
    let mainText = text.trim();
    if (topicTag) {
      const tag = topicTag.startsWith('#') ? topicTag : `#${topicTag}`;
      mainText = `${mainText}\n\n${tag}`;
    }

    if (mainText.length > 500) {
      return res.status(400).json({
        success: false,
        error: `Main text exceeds 500-character limit (${mainText.length} chars).`,
      });
    }

    // --- Step 1: Post main content ---
    let mainContainer;

    if (imageUrl) {
      mainContainer = await createImageContainer(imageUrl, mainText);
      await waitForContainerReady(mainContainer.id);
    } else {
      mainContainer = await createTextContainer(mainText);
    }

    const mainPublished = await publishContainer(mainContainer.id);
    const mainId = mainPublished.id;

    console.log(`[Threads] Published main post: ${mainId}`);

    // --- Step 2: Self-reply with URL ---
    // Small delay to ensure main post is indexed
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const replyText = replyUrl.trim();

    if (replyText.length > 500) {
      // If reply URL text somehow exceeds limit, return partial success
      return res.json({
        success: true,
        mainId,
        replyId: null,
        warning: 'Reply text exceeds 500-character limit. Main post published without reply.',
      });
    }

    const replyContainer = await createTextContainer(replyText, { replyToId: mainId });
    const replyPublished = await publishContainer(replyContainer.id);
    const replyId = replyPublished.id;

    console.log(`[Threads] Published reply: ${replyId}`);

    res.json({
      success: true,
      mainId,
      replyId,
    });
  } catch (error) {
    console.error('POST /api/threads/post-with-reply error:', error.message);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/threads/quota
 * 投稿クォータ（Publishing Limit）を確認する
 *
 * Response: { usage, total, remaining }
 */
router.get('/quota', async (_req, res) => {
  try {
    // First, get user ID
    const userInfo = await threadsRequest('/me?fields=id,username');
    const userId = userInfo.id;

    // Then check publishing limit
    const data = await threadsRequest(
      `/${userId}/threads_publishing_limit?fields=quota_usage,config`
    );

    const entry = data.data && data.data[0] ? data.data[0] : {};
    const usage = entry.quota_usage || 0;
    const config = entry.config || {};
    const total = config.quota_total || 250;
    const remaining = total - usage;

    res.json({
      success: true,
      usage,
      total,
      remaining,
    });
  } catch (error) {
    console.error('GET /api/threads/quota error:', error.message);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/threads/insights/:postId
 * 投稿のインサイト（エンゲージメント指標）を取得する
 *
 * Response: { views, likes, replies, reposts, quotes }
 */
router.get('/insights/:postId', async (req, res) => {
  try {
    const { postId } = req.params;

    if (!postId) {
      return res.status(400).json({ success: false, error: 'postId parameter is required.' });
    }

    const metrics = ['views', 'likes', 'replies', 'reposts', 'quotes'];
    const metricParam = metrics.join(',');

    const data = await threadsRequest(
      `/${postId}/insights?metric=${encodeURIComponent(metricParam)}`
    );

    // Parse the metrics data from API response
    const insights = {};
    if (Array.isArray(data.data)) {
      for (const item of data.data) {
        const name = item.name || item.id;
        if (!name) continue;

        if (Array.isArray(item.values) && item.values.length > 0) {
          insights[name] = item.values.reduce((sum, v) => sum + (v.value || 0), 0);
        } else if (typeof item.value !== 'undefined') {
          insights[name] = item.value;
        } else {
          insights[name] = null;
        }
      }
    }

    res.json({
      success: true,
      postId,
      views: insights.views ?? null,
      likes: insights.likes ?? null,
      replies: insights.replies ?? null,
      reposts: insights.reposts ?? null,
      quotes: insights.quotes ?? null,
    });
  } catch (error) {
    console.error(`GET /api/threads/insights/${req.params.postId} error:`, error.message);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

export default router;
