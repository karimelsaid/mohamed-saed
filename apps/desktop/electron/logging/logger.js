const fs = require('fs');
const path = require('path');
const os = require('os');

class Logger {
  constructor() {
    const baseDir = process.env.APPDATA || path.join(os.homedir(), '.suit-store');
    this.logDir = path.join(baseDir, 'SuitStore', 'logs');
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch {
      // Fallback to local logs directory if user data dir is restricted
      this.logDir = path.join(__dirname, '..', '..', '..', '..', 'logs');
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    }
  }

  getTodayLogFile() {
    const dateStr = new Date().toISOString().slice(0, 10);
    return path.join(this.logDir, `app-${dateStr}.log`);
  }

  formatMessage(level, message, meta) {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}\n`;
  }

  write(level, message, meta) {
    const line = this.formatMessage(level, message, meta);
    // Write to console with appropriate level
    if (level === 'error') {
      console.error(line.trim());
    } else if (level === 'warn') {
      console.warn(line.trim());
    } else {
      console.log(line.trim());
    }

    try {
      fs.appendFileSync(this.getTodayLogFile(), line, 'utf8');
    } catch (err) {
      console.error('Failed to write to log file:', err.message);
    }
  }

  info(msg, meta) {
    this.write('info', msg, meta);
  }

  warn(msg, meta) {
    this.write('warn', msg, meta);
  }

  error(msg, meta) {
    this.write('error', msg, meta);
  }

  debug(msg, meta) {
    if (process.env.NODE_ENV !== 'production') {
      this.write('debug', msg, meta);
    }
  }
}

const logger = new Logger();
module.exports = { logger, Logger };
