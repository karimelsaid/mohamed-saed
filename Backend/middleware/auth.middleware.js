const jwt = require('jsonwebtoken');
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

module.exports = verifyToken;
