const User = require('../models/User.model');
const Referral = require('../models/Referral.model');

exports.requestPayment = async (req, res) => {
  const { userId } = req.body;
  let amountToRequest = 0;
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.referralBalance <= 0) {
      return res.status(400).json({ message: 'لا يوجد رصيد لطلب دفعه.' });
    }

    if (!user.phone) {
      return res.status(400).json({ message: 'يجب إكمال بيانات ملفك الشخصي وإضافة رقم هاتف قبل طلب الدفع.' });
    }

    const existingRequest = user.paymentRequests.find(req => req.status === 'pending');
    if (existingRequest) {
      return res.status(400).json({ message: 'لديك بالفعل طلب دفع معلق.' });
    }

    amountToRequest = user.referralBalance;

    user.paymentRequests.push({ amount: amountToRequest, status: 'pending' });

    user.referralBalance = 0;

    user.notifications.push({
      message: `تم إرسال طلب دفع للرصيد: ${amountToRequest.toFixed(2)} جنيه`,
      type: 'payment_request',
      read: false,
      createdAt: new Date()
    });

    await user.save();

    res.json({ message: 'تم إرسال طلب الدفع بنجاح' });
  } catch (error) {
    console.error('Error requesting payment:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء طلب الدفع', error: error.message });
  }
};


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

      // Update all referrals to 'paid' status when payment is approved
      const updateResult = await Referral.updateMany(
        { referrerId: user._id.toString() },
        { status: 'paid' }
      );
      console.log(`Updated ${updateResult.modifiedCount} referrals to 'paid' for user ${user._id}`);
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
}


// Get all payment requests for admin
exports.getAllPaymentRequests = async (req, res) => {
  try {
    const users = await User.find({ 'paymentRequests.0': { $exists: true } }).lean();

    const allRequests = users.flatMap(user =>
      user.paymentRequests.map(request => ({
        requestId: request._id,
        userId: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        amount: request.amount,
        status: request.status,
        createdAt: request.createdAt,
        processedAt: request.processedAt
      }))
    );

    // Sort by date (newest first)
    allRequests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(allRequests);
  } catch (error) {
    console.error('Error fetching all payment requests:', error);
    res.status(500).json({ message: 'Error fetching payment requests', error: error.message });
  }
};
