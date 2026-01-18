const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

const verifyToken = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');


        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'الوصول مرفوض. لم يتم توفير رمز المصادقة.'
            });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        } catch (err) {
            return res.status(401).json({
                success: false,
                message: 'رمز المصادقة غير صالح أو منتهي الصلاحية.'
            });
        }

        // Try to find user by different ID fields (userId, adminId, merchantId)
        const userId = decoded.userId || decoded.adminId || decoded.merchantId || decoded.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'رمز المصادقة لا يحتوي على معرف صالح.'
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'المستخدم غير موجود.'
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
