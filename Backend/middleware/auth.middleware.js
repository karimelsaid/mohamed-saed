const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

const verifyToken = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');


        if (!token) {
            // console.warn(`❌ [AuthMiddleware] No token provided for: ${req.method} ${req.originalUrl}`);
            return res.status(401).json({
                success: false,
                message: 'الوصول مرفوض. لم يتم توفير رمز المصادقة.'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        // console.log('✅ [AuthMiddleware] Token decoded successfully. userId:', decoded.userId);

        // Try to find user by different ID fields (userId, adminId, merchantId)
        const user = await User.findById(decoded.userId || decoded.adminId || decoded.merchantId);

        if (!user) {
            console.error('❌ [AuthMiddleware] User not found for token payload:', decoded);
            return res.status(401).json({
                success: false,
                message: 'رمز المصادقة غير صالح.'
            });
        }

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
