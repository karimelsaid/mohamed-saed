const verifyAdmin = async (req, res, next) => {
    try {
        // Assumes verifyToken middleware has already run and set req.user
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'الوصول مرفوض. يجب تسجيل الدخول أولاً.'
            });
        }

        if (req.user.role !== 'admin' && req.user.role !== 'staff') {
            return res.status(403).json({
                success: false,
                message: 'الوصول مرفوض. هذه الصفحة للمسؤولين أو الموظفين فقط.'
            });
        }

        next();
    } catch (error) {
        console.error('Admin verification error:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في التحقق من الصلاحيات.'
        });
    }
};

module.exports = verifyAdmin;
