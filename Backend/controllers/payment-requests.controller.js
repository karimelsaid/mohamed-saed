const User = require('../models/User.model');

exports.updatePaymentRequestStatus = async (req, res) => {
  const { requestId } = req.params;
  const { status } = req.body;

  if (!['completed', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'حالة غير صالحة' });
  }

  try {
    const user = await User.findOne({ 'paymentRequests._id': requestId });

    if (!user) {
      return res.status(404).json({ message: 'طلب الدفع غير موجود' });
    }

    const request = user.paymentRequests.id(requestId);
    if (!request) {
      return res.status(404).json({ message: 'طلب الدفع غير موجود لدى المستخدم' });
    }

    // Prevent updating an already processed request
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'تمت معالجة هذا الطلب بالفعل' });
    }

    request.status = status;
    request.processedAt = new Date();

    // Notify the user and update balance if rejected
    let message = '';
    if (status === 'completed') {
      message = `تمت الموافقة على طلب الدفع الخاص بك بمبلغ ${request.amount.toFixed(2)} جنيه.`;
    } else { // status === 'rejected'
      message = `تم رفض طلب الدفع الخاص بك بمبلغ ${request.amount.toFixed(2)} جنيه.`;
      // Restore balance if rejected
      user.referralBalance += request.amount;
    }

    user.notifications.push({
      message,
      type: 'payment_status',
      read: false,
      createdAt: new Date(),
    });

    await user.save();

    res.status(200).json({ message: 'تم تحديث حالة طلب الدفع بنجاح', request: request });
  } catch (error) {
    console.error('Error updating payment request status:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء تحديث حالة الطلب' });
  }
};
