'use strict';

const fetch = require('node-fetch');
const logger = require('./logger');

const ALL_POST_METRICS = ['views', 'likes', 'replies', 'reposts', 'quotes'];
const ALL_USER_METRICS = ['views', 'likes', 'replies', 'reposts', 'quotes', 'followers_count'];

class InsightsClient {
  constructor({ accessToken, apiVersion = 'v1.0' }) {
    this.accessToken = accessToken;
    this.apiVersion = apiVersion;
    this.baseUrl = `https://graph.threads.net/${apiVersion}`;
  }

  _buildHeaders() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  async _request(url) {
    logger.debug(`InsightsClient request: GET ${url}`);
    const response = await fetch(url, {
      method: 'GET',
      headers: this._buildHeaders(),
    });

    const body = await response.json();

    if (!response.ok) {
      const errorCode = body.error && body.error.code ? body.error.code : response.status;
      const errorMessage =
        body.error && body.error.message ? body.error.message : 'Unknown API error';
      const err = new Error(`Threads API error ${errorCode}: ${errorMessage}`);
      err.code = errorCode;
      err.apiMessage = errorMessage;
      err.status = response.status;
      throw err;
    }

    return body;
  }

  _parseMetricsData(data) {
    const result = {};
    if (!Array.isArray(data)) return result;

    for (const item of data) {
      const name = item.name || item.id;
      if (!name) continue;

      // The API may return values as an array of period objects or a direct value
      if (Array.isArray(item.values) && item.values.length > 0) {
        // Sum values across periods if multiple are returned
        const total = item.values.reduce((acc, v) => acc + (v.value || 0), 0);
        result[name] = total;
      } else if (typeof item.value !== 'undefined') {
        result[name] = item.value;
      } else {
        result[name] = null;
      }
    }

    return result;
  }

  /**
   * Get insights for a specific post.
   * @param {string} threadId
   * @param {string[]} [metrics] - Defaults to all post metrics
   * @returns {Promise<{views, likes, replies, reposts, quotes}>}
   */
  async getPostInsights(threadId, metrics = ALL_POST_METRICS) {
    const metricParam = metrics.join(',');
    const url = `${this.baseUrl}/${threadId}/insights?metric=${encodeURIComponent(metricParam)}`;

    try {
      const body = await this._request(url);
      const parsed = this._parseMetricsData(body.data);

      return {
        views: parsed.views !== undefined ? parsed.views : null,
        likes: parsed.likes !== undefined ? parsed.likes : null,
        replies: parsed.replies !== undefined ? parsed.replies : null,
        reposts: parsed.reposts !== undefined ? parsed.reposts : null,
        quotes: parsed.quotes !== undefined ? parsed.quotes : null,
      };
    } catch (err) {
      logger.error(`Failed to get post insights for ${threadId}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get user-level insights.
   * @param {string} userId
   * @param {string[]} [metrics] - Defaults to all user metrics
   * @param {{ since?: number, until?: number }} [options]
   * @returns {Promise<object>}
   */
  async getUserInsights(userId, metrics = ALL_USER_METRICS, options = {}) {
    const metricParam = Array.isArray(metrics) ? metrics.join(',') : metrics;
    let url = `${this.baseUrl}/${userId}/threads_insights?metric=${encodeURIComponent(metricParam)}`;

    if (options.since) {
      url += `&since=${options.since}`;
    }
    if (options.until) {
      url += `&until=${options.until}`;
    }

    try {
      const body = await this._request(url);
      const parsed = this._parseMetricsData(body.data);
      return parsed;
    } catch (err) {
      logger.error(`Failed to get user insights for ${userId}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Convenience method — fetch all metrics for a single post.
   * @param {string} threadId
   * @returns {Promise<{ threadId: string, metrics: object, fetchedAt: string }>}
   */
  async getPostPerformance(threadId) {
    const metrics = await this.getPostInsights(threadId, ALL_POST_METRICS);
    return {
      threadId,
      metrics,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Get insights for multiple posts sequentially.
   * Waits 1 second between requests to avoid rate limits.
   * Failed requests are skipped with a warning.
   * @param {string[]} threadIds
   * @returns {Promise<Array<{ threadId: string, metrics: object, fetchedAt: string }>>}
   */
  async getBatchPostPerformance(threadIds) {
    const results = [];

    for (let i = 0; i < threadIds.length; i++) {
      const threadId = threadIds[i];

      try {
        const performance = await this.getPostPerformance(threadId);
        results.push(performance);
        logger.debug(`Fetched performance for thread ${threadId} (${i + 1}/${threadIds.length})`);
      } catch (err) {
        logger.warn(
          `Skipping thread ${threadId} due to error: ${err.message} (${i + 1}/${threadIds.length})`
        );
      }

      // Delay between requests to avoid rate limits, except after the last one
      if (i < threadIds.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return results;
  }
}

module.exports = InsightsClient;
