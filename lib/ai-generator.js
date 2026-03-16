/**
 * AI Generator for Threads Posts
 *
 * ブログ記事の情報からThreadsに最適化された投稿文をAIで生成する
 * - Claude API (Anthropic) または OpenAI API に対応
 * - 環境変数で切替可能 (AI_PROVIDER, AI_API_KEY, AI_MODEL)
 * - API利用不可時は null を返し、呼び出し元でフォールバックテンプレートを使用
 */

const fetch = require('node-fetch');
const logger = require('./logger');

/**
 * デフォルトモデル定義
 */
const DEFAULT_MODELS = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini'
};

/**
 * Threads投稿文の最大文字数
 */
const MAX_POST_LENGTH = 500;

class AiGenerator {
  /**
   * @param {Object} config
   * @param {string} config.apiKey - AI APIキー
   * @param {string} [config.model] - モデル名（省略時はプロバイダのデフォルト）
   * @param {string} [config.provider='anthropic'] - 'anthropic' or 'openai'
   * @param {number} [config.maxTokens=1024] - 最大トークン数
   */
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.AI_API_KEY || '';
    this.provider = config.provider || process.env.AI_PROVIDER || 'anthropic';
    this.model = config.model || process.env.AI_MODEL || DEFAULT_MODELS[this.provider] || DEFAULT_MODELS.anthropic;
    this.maxTokens = config.maxTokens || 1024;
  }

  /**
   * APIキーが設定されているかチェック
   * @returns {boolean} 利用可能ならtrue
   */
  isAvailable() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * ブログ記事からThreads投稿文を生成
   *
   * @param {Object} post - ブログ記事情報
   * @param {string} post.title - 記事タイトル
   * @param {string} [post.description] - 記事概要
   * @param {string} [post.category] - カテゴリ
   * @param {string[]} [post.tags] - タグ配列
   * @param {string} [post.content] - 記事本文（オプション）
   * @param {string} postUrl - ブログ記事のURL
   * @returns {Promise<string|null>} 生成されたテキスト（500文字以内）、失敗時はnull
   */
  async generateThreadsPost(post, postUrl) {
    if (!this.isAvailable()) {
      logger.warn('AI API key is not configured. Skipping AI generation.');
      return null;
    }

    try {
      const prompt = this._buildPrompt(post, postUrl);

      let generatedText;

      if (this.provider === 'openai') {
        generatedText = await this._callOpenAiApi(prompt);
      } else {
        generatedText = await this._callAnthropicApi(prompt);
      }

      if (!generatedText) {
        logger.warn('AI returned empty response.');
        return null;
      }

      // 500文字制限のバリデーション
      if (generatedText.length > MAX_POST_LENGTH) {
        logger.warn(`AI generated text exceeds ${MAX_POST_LENGTH} chars (${generatedText.length}). Truncating.`);
        generatedText = generatedText.slice(0, MAX_POST_LENGTH - 3) + '...';
      }

      logger.info(`AI generated Threads post (${generatedText.length} chars, provider: ${this.provider})`);
      return generatedText;
    } catch (error) {
      logger.error(`AI generation failed (provider: ${this.provider}): ${error.message}`);
      return null;
    }
  }

  /**
   * AI用プロンプトを構築
   *
   * @param {Object} post - ブログ記事情報
   * @param {string} postUrl - ブログ記事のURL
   * @returns {string} プロンプト文字列
   * @private
   */
  _buildPrompt(post, postUrl) {
    const { title, description, category, tags, content } = post;

    let prompt = `あなたはThreads（Meta社のSNS）の投稿を作成するエキスパートです。
以下のブログ記事の情報から、Threadsに最適化された投稿文を作成してください。

ルール:
- 500文字以内
- トピックタグは1個のみ（最も関連性の高いもの）
- URLは投稿の最後に配置
- 冒頭はフックで始める（質問、驚きの事実、共感を呼ぶ一言）
- 改行を適切に使って読みやすく
- 絵文字は1-2個まで
- 宣伝臭を出さず、価値提供を中心に

記事タイトル: ${title}`;

    if (description) {
      prompt += `\n記事概要: ${description}`;
    }

    if (category) {
      prompt += `\nカテゴリ: ${category}`;
    }

    if (tags && tags.length > 0) {
      prompt += `\nタグ: ${tags.join(', ')}`;
    }

    if (content) {
      // 記事本文は長すぎる場合があるため、先頭1000文字に制限
      const truncatedContent = content.length > 1000
        ? content.slice(0, 1000) + '...'
        : content;
      prompt += `\n記事本文（抜粋）: ${truncatedContent}`;
    }

    prompt += `\nURL: ${postUrl}`;

    prompt += `\n\n投稿文のみを出力してください（説明やメタ情報は不要）。`;

    return prompt;
  }

  /**
   * Claude API (Anthropic) を呼び出す
   *
   * @param {string} prompt - プロンプト
   * @returns {Promise<string|null>} 生成テキスト、失敗時はnull
   * @private
   */
  async _callAnthropicApi(prompt) {
    const url = 'https://api.anthropic.com/v1/messages';

    const body = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [
        { role: 'user', content: prompt }
      ]
    };

    logger.debug(`Calling Anthropic API (model: ${this.model})`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || response.statusText;
      throw new Error(`Anthropic API error (${response.status}): ${errorMessage}`);
    }

    const data = await response.json();

    // Anthropic Messages APIのレスポンス構造: { content: [{ type: 'text', text: '...' }] }
    if (data.content && data.content.length > 0 && data.content[0].type === 'text') {
      return data.content[0].text.trim();
    }

    return null;
  }

  /**
   * OpenAI API を呼び出す（フォールバック）
   *
   * @param {string} prompt - プロンプト
   * @returns {Promise<string|null>} 生成テキスト、失敗時はnull
   * @private
   */
  async _callOpenAiApi(prompt) {
    const url = 'https://api.openai.com/v1/chat/completions';

    const body = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [
        { role: 'user', content: prompt }
      ]
    };

    logger.debug(`Calling OpenAI API (model: ${this.model})`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || response.statusText;
      throw new Error(`OpenAI API error (${response.status}): ${errorMessage}`);
    }

    const data = await response.json();

    // OpenAI Chat Completions APIのレスポンス構造: { choices: [{ message: { content: '...' } }] }
    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      return data.choices[0].message.content.trim();
    }

    return null;
  }
}

module.exports = AiGenerator;
