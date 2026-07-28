const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User.model');

const verifyToken = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');


        if (!token) {
            console.log('❌ [AuthMiddleware] No token provided in headers:', req.headers);
            return res.status(401).json({
                success: false,
                message: 'الوصول مرفوض. لم يتم توفير رمز المصادقة.'
            });
        }

        console.log('🔑 [AuthMiddleware] Validating token...');
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            console.log('✅ [AuthMiddleware] [DEBUG-DEEP] Token:', token.substring(0, 20) + '...');
            console.log('✅ [AuthMiddleware] [DEBUG-DEEP] Decoded Payload:', JSON.stringify(decoded, null, 2));
            const resolvedId = decoded.userId || decoded.adminId || decoded.merchantId || decoded.id;
            console.log('✅ [AuthMiddleware] [DEBUG-FORCE-REFRESH-1] Resolved ID:', resolvedId);
        } catch (err) {
            console.error('❌ [AuthMiddleware] Token verification failed:', err.message);
            return res.status(401).json({
                success: false,
                message: 'رمز المصادقة غير صالح أو منتهي الصلاحية.'
            });
        }

        // Try to find user by different ID fields (userId, adminId, merchantId)
        const userId = decoded.userId || decoded.adminId || decoded.merchantId || decoded.id;

        if (!userId) {
            console.warn('❌ [AuthMiddleware] No valid ID found in token:', decoded);
            return res.status(401).json({
                success: false,
                message: 'رمز المصادقة لا يحتوي على معرف صالح.'
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            console.warn(`❌ [AuthMiddleware] User not found for ID: ${userId}`);
            return res.status(401).json({
                success: false,
                message: 'المستخدم غير موجود.'
            });
        }

        console.log(`👤 [AuthMiddleware] Authenticated: ${user.email} (${user.role})`);
        req.user = user;
        next();
    } catch (error) {
        console.error('❌ [AuthMiddleware] Error:', error.message);
        res.status(401).json({
            success: false,
            message: 'رمز المصادقة غير صالح أو منتهي الصلاحية.'
        });
    }
};

const verifyN8nToken = async (req, res, next) => {
    try {
        const token = req.header('X-N8N-Secret');
        const expectedToken = process.env.N8N_SECRET;

        if (!token) {
            console.log('❌ [N8NAuthMiddleware] No token provided in headers');
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: Missing N8N secret token'
            });
        }

        if (!expectedToken) {
            console.error('❌ [N8NAuthMiddleware] N8N_SECRET environment variable not configured. Please add N8N_SECRET to your .env file.');
            return res.status(500).json({
                success: false,
                message: 'Server configuration error'
            });
        }

        // Use timing-safe comparison to prevent timing attacks
        const tokenBuffer = Buffer.from(token);
        const expectedBuffer = Buffer.from(expectedToken);

        if (tokenBuffer.length !== expectedBuffer.length) {
            console.warn('❌ [N8NAuthMiddleware] Invalid token length');
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: Invalid N8N secret token'
            });
        }

        if (!crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
            console.warn('❌ [N8NAuthMiddleware] Invalid token provided');
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: Invalid N8N secret token'
            });
        }

        console.log('✅ [N8NAuthMiddleware] N8N request authenticated');
        next();
    } catch (error) {
        console.error('❌ [N8NAuthMiddleware] Error:', error.message);
        res.status(401).json({
            success: false,
            message: 'Authentication failed'
        });
    }
};

// Support both old and new import styles for backward compatibility
module.exports = verifyToken; // Default export for old style: const verifyToken = require(...)
module.exports.verifyToken = verifyToken; // Named export for new style: const { verifyToken } = require(...)
module.exports.verifyN8nToken = verifyN8nToken; // Named export for new style: const { verifyN8nToken } = require(...)
module.exports.authMiddleware = verifyToken; // Alias for authMiddleware import style
