const express = require('express');
const router = express.Router();
const {
  createAccount,
  login,
  addToFavorites,
  addToCart,
  removeFromFavorites, // تأكد من وجودها
  removeFromCart,      // تأكد من وجودها
  getUserData,
  getUserProfile,
  updateOrderShippingAddress,
  updateUserProfile,
  requestBook,
  getAllRequestedBooks,
  updateRequestedBookStatus,
  deleteRequestedBook,
  submitBookRating,
  getRatedBooks,
  getAverageRating,
  googleSignIn,
  getNotifications,
  markNotificationAsRead,
  deleteNotification,
  checkEmailExists,
  resetPassword,
  generateReferralLink,
  getReferralBalance,
  getReferrals,
  requestPayment
} = require('../controllers/users.controller');

// مسارات المستخدمين
router.post('/create-account', createAccount);
router.post('/login', login);
router.post('/google-signin', googleSignIn);
router.post('/add-to-favorites', addToFavorites);
router.post('/add-to-cart', addToCart);
router.delete('/remove-from-favorites/:userId/:bookId', removeFromFavorites);
router.delete('/remove-from-cart/:userId/:bookId', removeFromCart);
router.get('/user-data/:userId', getUserData);

// جلب بيانات الملف الشخصي للمستخدم
router.get('/profile/:userId', getUserProfile);

// تحديث بيانات الملف الشخصي للمستخدم (بما في ذلك تحديث عناوين الشحن في الطلبات)
router.put('/update-profile/:userId', updateUserProfile);

// تحديث عنوان الشحن لطلب معين
router.put('/:userId/orders/:orderId/shipping-address', updateOrderShippingAddress);

// إضافة مسار طلب كتاب جديد
router.post('/request-book', requestBook);

// مسار جديد لجلب جميع اقتراحات الكتب
router.get('/requested-books', getAllRequestedBooks);

// تحديث حالة اقتراح الكتاب (added true/false)
router.patch('/requested-books/:userId/:bookId', updateRequestedBookStatus);

router.delete('/requested-books/:userId/:suggestionId', deleteRequestedBook);

// Add route for submitting book rating
router.post('/submit-rating', submitBookRating);

// Add route for getting rated books for a user
router.get('/rated-books/:userId', getRatedBooks);

// Add route for getting average rating for a book
router.get('/average-rating/:bookId', getAverageRating);

// Add routes for notifications
router.get('/notifications/:userId', getNotifications);
router.patch('/notifications/:userId/:notificationId', markNotificationAsRead);

router.delete('/notifications/:userId/:notificationId', deleteNotification);

router.post('/check-email', checkEmailExists);
router.put('/reset-password', resetPassword);

// Referral routes
router.post('/generate-referral-link', generateReferralLink);
router.get('/referral-balance/:userId', getReferralBalance);
router.get('/referrals/:userId', getReferrals);
router.post('/request-payment', requestPayment);

module.exports = router;
