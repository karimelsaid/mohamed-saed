const rateLimit = require('express-rate-limit');

// General API rate limiter: 100 requests per 15 minutes per IP
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'عدد الطلبات كثير جداً، يرجى المحاولة بعد قليل'
    }
});

// Message sending rate limiter: 10 messages per 10 seconds per IP
const messageLimiter = rateLimit({
    windowMs: 10 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'أنت ترسل رسائل بسرعة كبيرة، يرجى الانتظار'
    }
});

// Auth rate limiter: 5 attempts per 15 minutes per IP
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'محاولات دخول كثيرة جداً، يرجى المحاولة بعد 15 دقيقة'
    }
});

// File upload rate limiter: 5 uploads per minute per IP
const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'عدد الملفات المرفوعة كثير، يرجى الانتظار'
    }
});

module.exports = {
    generalLimiter,
    messageLimiter,
    authLimiter,
    uploadLimiter
};
