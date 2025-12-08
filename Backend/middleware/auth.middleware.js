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

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

        // Try to find user by different ID fields (userId, adminId, merchantId)
        const user = await User.findOne({
            _id: decoded.userId || decoded.adminId || decoded.merchantId
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'رمز المصادقة غير صالح.'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(401).json({
            success: false,
            message: 'رمز المصادقة غير صالح أو منتهي الصلاحية.'
        });
    }
};

module.exports = verifyToken;
