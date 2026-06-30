const BookRequest = require('../models/BookRequest.model');

/**
 * Book Request Controller
 * للتعامل مع طلبات إضافة الكتب المطلوبة من المستخدمين
 */

/**
 * إنشاء طلب كتاب جديد أو تحديث طلب موجود
 * POST /api/book-requests
 */
exports.createBookRequest = async (req, res) => {
  try {
    const { bookName, category, conversationId, userId, sessionId } = req.body;
    
    // التحقق من البيانات المطلوبة
    if (!bookName || !conversationId) {
      return res.status(400).json({
        success: false,
        message: 'bookName و conversationId مطلوبان'
      });
    }
    
    // إنشاء أو تحديث الطلب
    const bookRequest = await BookRequest.findOrCreate({
      bookName,
      category,
      conversationId,
      userId,
      sessionId
    });
    
    res.status(200).json({
      success: true,
      message: 'تم تسجيل طلبك بنجاح',
      data: {
        bookName: bookRequest.bookName,
        requestCount: bookRequest.requestCount,
        status: bookRequest.status
      }
    });
  } catch (error) {
    console.error('Error creating book request:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تسجيل طلبك'
    });
  }
};

/**
 * الحصول على إحصائيات طلبات الكتب (للأدمن فقط)
 * GET /api/book-requests/admin/statistics
 */
exports.getStatistics = async (req, res) => {
  try {
    // التحقق من صلاحيات الأدمن
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بالوصول إلى هذه البيانات'
      });
    }
    
    const statistics = await BookRequest.getStatistics();
    
    res.status(200).json({
      success: true,
      data: statistics
    });
  } catch (error) {
    console.error('Error getting statistics:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب الإحصائيات'
    });
  }
};

/**
 * الحصول على قائمة طلبات الكتب (للأدمن فقط)
 * GET /api/book-requests/admin
 */
exports.getAllBookRequests = async (req, res) => {
  try {
    // التحقق من صلاحيات الأدمن
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بالوصول إلى هذه البيانات'
      });
    }
    
    const { status, limit = 50, page = 1 } = req.query;
    
    const query = {};
    if (status) {
      query.status = status;
    }
    
    const bookRequests = await BookRequest
      .find(query)
      .sort({ requestCount: -1, lastRequestedAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    
    const total = await BookRequest.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: {
        requests: bookRequests,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error getting book requests:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب الطلبات'
    });
  }
};

/**
 * تحديث حالة طلب كتاب (للأدمن فقط)
 * PUT /api/book-requests/admin/:id/status
 */
exports.updateRequestStatus = async (req, res) => {
  try {
    // التحقق من صلاحيات الأدمن
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بتعديل هذه البيانات'
      });
    }
    
    const { id } = req.params;
    const { status, adminNotes } = req.body;
    
    const bookRequest = await BookRequest.findByIdAndUpdate(
      id,
      { 
        status,
        adminNotes,
        updatedAt: new Date()
      },
      { new: true }
    );
    
    if (!bookRequest) {
      return res.status(404).json({
        success: false,
        message: 'الطلب غير موجود'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'تم تحديث حالة الطلب بنجاح',
      data: bookRequest
    });
  } catch (error) {
    console.error('Error updating request status:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تحديث الحالة'
    });
  }
};

/**
 * حذف طلب كتاب (للأدمن فقط)
 * DELETE /api/book-requests/admin/:id
 */
exports.deleteRequest = async (req, res) => {
  try {
    // التحقق من صلاحيات الأدمن
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بحذف هذه البيانات'
      });
    }
    
    const { id } = req.params;
    
    const bookRequest = await BookRequest.findByIdAndDelete(id);
    
    if (!bookRequest) {
      return res.status(404).json({
        success: false,
        message: 'الطلب غير موجود'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'تم حذف الطلب بنجاح'
    });
  } catch (error) {
    console.error('Error deleting request:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء حذف الطلب'
    });
  }
};
