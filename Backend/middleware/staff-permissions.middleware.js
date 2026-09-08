const verifyStaffPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      // Assumes verifyToken middleware has already run and set req.user
      if (!req.user) {
        console.log('❌ [StaffPermissions] No user found in request');
        return res.status(401).json({
          success: false,
          message: 'الوصول مرفوض. يجب تسجيل الدخول أولاً.'
        });
      }

      console.log('🔐 [StaffPermissions] Checking permission:', requiredPermission, 'for user:', req.user.email, 'role:', req.user.role);

      // Admins have all permissions
      if (req.user.role === 'admin') {
        console.log('✅ [StaffPermissions] Admin access granted');
        return next();
      }

      // Staff members need specific permissions
      if (req.user.role === 'staff') {
        const userPermissions = req.user.permissions || [];
        console.log('📋 [StaffPermissions] User permissions:', userPermissions);
        
        if (!requiredPermission) {
          // If no specific permission required, just check if staff
          console.log('✅ [StaffPermissions] Staff access granted (no specific permission required)');
          return next();
        }

        if (userPermissions.includes(requiredPermission)) {
          console.log('✅ [StaffPermissions] Staff permission granted for:', requiredPermission);
          return next();
        }

        console.log('❌ [StaffPermissions] Staff permission denied for:', requiredPermission);
        return res.status(403).json({
          success: false,
          message: 'ليس لديك الصلاحية المطلوبة لهذه العملية.',
          requiredPermission
        });
      }

      console.log('❌ [StaffPermissions] Access denied for role:', req.user.role);
      return res.status(403).json({
        success: false,
        message: 'الوصول مرفوض. هذه الصفحة للمسؤولين أو الموظفين فقط.'
      });
    } catch (error) {
      console.error('❌ [StaffPermissions] Error:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ في التحقق من الصلاحيات.'
      });
    }
  };
};

module.exports = verifyStaffPermission;