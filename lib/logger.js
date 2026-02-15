/**
 * Simple Logger
 *
 * コンソール出力用のシンプルなロガー
 */

const logLevels = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

class Logger {
  constructor(config = {}) {
    this.level = config.logLevel || 'info';
    this.currentLevel = logLevels[this.level] || 1;
  }

  setLevel(level) {
    this.level = level;
    this.currentLevel = logLevels[level] || 1;
  }

  log(level, ...args) {
    const levelNum = logLevels[level];

    if (levelNum >= this.currentLevel) {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
      console.log(prefix, ...args);
    }
  }

  debug(...args) {
    this.log('debug', ...args);
  }

  info(...args) {
    this.log('info', ...args);
  }

  warn(...args) {
    this.log('warn', ...args);
  }

  error(...args) {
    this.log('error', ...args);
  }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;
