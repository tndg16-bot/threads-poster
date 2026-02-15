/**
 * Configuration Loader
 *
 * 設定ファイルと環境変数から設定を読み込む
 */

const fs = require('fs');
const path = require('path');

/**
 * Load configuration from multiple sources
 * Priority: Environment variables > config.json > defaults
 */
function loadConfig() {
  // Default configuration
  const defaults = {
    appId: '',
    appSecret: '',
    accessToken: '',
    redirectUri: 'https://localhost:3000/callback',
    apiVersion: 'v1.0',
    dryRun: false,
    logLevel: 'info'
  };

  // Load from config.json if exists
  let configFile = {};
  const configPath = path.join(__dirname, '..', 'config.json');

  if (fs.existsSync(configPath)) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      configFile = JSON.parse(configContent);
    } catch (error) {
      console.warn(`Warning: Failed to load config.json: ${error.message}`);
    }
  }

  // Environment variables mapping
  const envConfig = {
    appId: process.env.THREADS_APP_ID || process.env.FACEBOOK_APP_ID,
    appSecret: process.env.THREADS_APP_SECRET || process.env.FACEBOOK_APP_SECRET,
    accessToken: process.env.THREADS_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN,
    redirectUri: process.env.THREADS_REDIRECT_URI,
    apiVersion: process.env.THREADS_API_VERSION,
    dryRun: process.env.THREADS_DRY_RUN === 'true',
    logLevel: process.env.THREADS_LOG_LEVEL || process.env.LOG_LEVEL
  };

  // Merge all sources (env > config > defaults)
  const config = {
    ...defaults,
    ...configFile,
    ...envConfig
  };

  // Remove undefined/null values
  Object.keys(config).forEach(key => {
    if (config[key] === undefined || config[key] === null) {
      delete config[key];
    }
  });

  return config;
}

/**
 * Validate required configuration
 */
function validateConfig(config) {
  const required = ['accessToken'];
  const missing = required.filter(key => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }

  return true;
}

module.exports = {
  loadConfig,
  validateConfig
};
