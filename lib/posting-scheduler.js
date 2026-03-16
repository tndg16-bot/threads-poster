'use strict';

const logger = require('./logger');

const POSTING_WINDOWS = [
  { name: 'morning', label: '朝 (通勤時間)', startHour: 7, endHour: 8 },
  { name: 'lunch',   label: '昼 (ランチタイム)', startHour: 12, endHour: 13 },
  { name: 'evening', label: '夕方 (仕事終わり)', startHour: 18, endHour: 19 },
  { name: 'night',   label: '夜 (リラックスタイム)', startHour: 21, endHour: 22 },
];

const OPTIMAL_TAGS = {
  morning: {
    default: '#生産性向上',
    productivity: '#生産性向上',
    career: '#キャリア',
    work: '#仕事術',
    business: '#ビジネス',
  },
  lunch: {
    default: '#マインドセット',
    mindset: '#マインドセット',
    life: '#ライフハック',
    motivation: '#モチベーション',
    health: '#ウェルビーイング',
  },
  evening: {
    default: '#AI活用',
    ai: '#AI活用',
    tech: '#テクノロジー',
    engineering: '#エンジニアリング',
    programming: '#プログラミング',
  },
  night: {
    default: '#コーチング',
    coaching: '#コーチング',
    reflection: '#内省',
    growth: '#自己成長',
    philosophy: '#思考',
  },
};

class PostingScheduler {
  constructor({ timezone = 'Asia/Tokyo' } = {}) {
    this.timezone = timezone;
    logger.info(`PostingScheduler initialized with timezone: ${this.timezone}`);
  }

  /**
   * Get current Date adjusted to JST (UTC+9).
   * Returns a plain Date whose getHours()/getMinutes() reflect JST wall clock.
   */
  _getJSTDate() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const get = (type) => parts.find((p) => p.type === type).value;

    // Build a Date string that JavaScript can parse as local time in JST context
    const year   = get('year');
    const month  = get('month');
    const day    = get('day');
    const hour   = get('hour');   // 00-23
    const minute = get('minute');
    const second = get('second');

    // Construct a Date representing JST wall-clock time as a UTC Date
    // so that getHours() etc. reflect JST values when used directly.
    const jstDate = new Date(
      `${year}-${month}-${day}T${hour === '24' ? '00' : hour}:${minute}:${second}+09:00`
    );

    return jstDate;
  }

  /**
   * Returns the next optimal posting time.
   * @returns {{ scheduledTime: Date, window: string, waitMs: number }}
   */
  getNextPostingWindow() {
    const jst = this._getJSTDate();
    const currentHour   = jst.getHours();
    const currentMinute = jst.getMinutes();
    const currentTotalMinutes = currentHour * 60 + currentMinute;

    logger.debug(
      `getNextPostingWindow: JST ${currentHour}:${String(currentMinute).padStart(2, '0')}`
    );

    // Try to find a window that hasn't passed yet today
    for (const win of POSTING_WINDOWS) {
      const windowStartMinutes = win.startHour * 60;
      if (currentTotalMinutes < windowStartMinutes) {
        // This window is still upcoming today
        const scheduledTime = new Date(jst);
        scheduledTime.setHours(win.startHour, 0, 0, 0);
        const waitMs = scheduledTime.getTime() - new Date().getTime();

        logger.info(
          `Next posting window: ${win.name} at ${win.startHour}:00 JST (wait ${Math.round(waitMs / 1000)}s)`
        );

        return {
          scheduledTime,
          window: win.name,
          waitMs: Math.max(0, waitMs),
        };
      }
    }

    // All windows have passed today — return the first window tomorrow
    const tomorrow = new Date(jst);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(POSTING_WINDOWS[0].startHour, 0, 0, 0);
    const waitMs = tomorrow.getTime() - new Date().getTime();

    logger.info(
      `All windows passed today. Next window: ${POSTING_WINDOWS[0].name} tomorrow at ` +
      `${POSTING_WINDOWS[0].startHour}:00 JST (wait ${Math.round(waitMs / 1000)}s)`
    );

    return {
      scheduledTime: tomorrow,
      window: POSTING_WINDOWS[0].name,
      waitMs: Math.max(0, waitMs),
    };
  }

  /**
   * Check if current time is within any posting window.
   * @returns {{ inWindow: boolean, currentWindow: string|null }}
   */
  isInPostingWindow() {
    const jst = this._getJSTDate();
    const currentHour = jst.getHours();

    for (const win of POSTING_WINDOWS) {
      if (currentHour >= win.startHour && currentHour < win.endHour) {
        logger.debug(`Currently in posting window: ${win.name}`);
        return { inWindow: true, currentWindow: win.name };
      }
    }

    logger.debug('Not currently in any posting window');
    return { inWindow: false, currentWindow: null };
  }

  /**
   * Return the best topic_tag based on category and current JST time.
   * @param {string} category
   * @returns {string}
   */
  getOptimalTag(category) {
    const jst = this._getJSTDate();
    const currentHour = jst.getHours();

    // Determine current or nearest time slot
    let slot;
    if (currentHour >= 21) {
      slot = 'night';
    } else if (currentHour >= 18) {
      slot = 'evening';
    } else if (currentHour >= 12) {
      slot = 'lunch';
    } else {
      slot = 'morning';
    }

    const tagMap = OPTIMAL_TAGS[slot];
    const normalizedCategory = (category || '').toLowerCase();
    const tag = tagMap[normalizedCategory] || tagMap.default;

    logger.debug(`getOptimalTag: slot=${slot}, category="${category}" → tag=${tag}`);
    return tag;
  }

  /**
   * Return a human-readable schedule report for today.
   * @returns {string}
   */
  formatScheduleReport() {
    const jst = this._getJSTDate();
    const currentHour   = jst.getHours();
    const currentMinute = jst.getMinutes();
    const currentTotalMinutes = currentHour * 60 + currentMinute;

    const dateStr = new Intl.DateTimeFormat('ja-JP', {
      timeZone: this.timezone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    }).format(new Date());

    const lines = [`📅 ${dateStr} の投稿スケジュール`, ''];

    for (const win of POSTING_WINDOWS) {
      const windowStartMinutes = win.startHour * 60;
      const windowEndMinutes   = win.endHour   * 60;

      let status;
      if (currentTotalMinutes >= windowStartMinutes && currentTotalMinutes < windowEndMinutes) {
        status = '⏰ now';
      } else if (currentTotalMinutes >= windowEndMinutes) {
        status = '✅ done';
      } else {
        status = '⏳ upcoming';
      }

      lines.push(
        `${status}  ${String(win.startHour).padStart(2, '0')}:00–${String(win.endHour).padStart(2, '0')}:00  ${win.label}`
      );
    }

    lines.push('');
    lines.push(`現在時刻 (JST): ${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`);

    const report = lines.join('\n');
    logger.debug('formatScheduleReport generated');
    return report;
  }
}

module.exports = PostingScheduler;
