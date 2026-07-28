const winston = require('winston');
const path = require('path');

/**
 * Sanitize sensitive data from logs
 */
function sanitizeData(data) {
  if (!data || typeof data !== 'object') return data;
  
  const sensitiveKeys = [
    'access_token',
    'refresh_token',
    'client_secret',
    'password',
    'token',
    'authorization',
    'secret'
  ];
  
  const sanitized = { ...data };
  
  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    
    if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeData(sanitized[key]);
    }
  }
  
  return sanitized;
}

const amazonLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'amazon-sp-api' },
  transports: [
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/amazon-error.log'),
      level: 'error'
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/amazon.log')
    })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  amazonLogger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

module.exports = {
  logRequest: (operation, data) => {
    amazonLogger.info({
      type: 'REQUEST',
      operation,
      data: sanitizeData(data),
      timestamp: new Date().toISOString()
    });
  },

  logResponse: (operation, data, executionTime) => {
    amazonLogger.info({
      type: 'RESPONSE',
      operation,
      data: sanitizeData(data),
      executionTime,
      timestamp: new Date().toISOString()
    });
  },

  logError: (operation, error, context = {}) => {
    amazonLogger.error({
      type: 'ERROR',
      operation,
      error: error.message,
      stack: error.stack,
      context: sanitizeData(context),
      timestamp: new Date().toISOString()
    });
  },

  logRetry: (operation, attempt, maxAttempts, delay) => {
    amazonLogger.warn({
      type: 'RETRY',
      operation,
      attempt,
      maxAttempts,
      delay,
      timestamp: new Date().toISOString()
    });
  },

  logSuccess: (operation, details) => {
    amazonLogger.info({
      type: 'SUCCESS',
      operation,
      details: sanitizeData(details),
      timestamp: new Date().toISOString()
    });
  }
};
