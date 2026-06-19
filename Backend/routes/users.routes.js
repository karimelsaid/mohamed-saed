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
  getUserPrintOrders,
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
  deleteReferral,
  submitUrgencyRequest,
  getAllUrgencyRequests,
  updateUrgencyRequestStatus,
  requestPayment,
  getPublicProfile
} = require('../controllers/users.controller'); // Removed getPaymentRequests

const verifyToken = require('../middleware/auth.middleware');
const userMediaController = require('../controllers/user-media.controller'); // Import media controller

router.post('/register', createAccount);
router.post('/login', login);
router.post('/google-signin', googleSignIn);

// Static routes first to avoid collision with :userId
router.get('/requested-books', getAllRequestedBooks);
router.get('/urgency-requests', getAllUrgencyRequests);

router.get('/:userId', getUserData);
router.get('/profile/:userId', getUserProfile); // This serves general profile data
router.get('/public-profile/:userId', getPublicProfile); // New public profile route
// Note: /profile-image (below) handles the image upload via multer

router.put('/profile/:userId', updateUserProfile);
router.put('/update-profile/:userId', updateUserProfile);

router.post('/favorites', addToFavorites);
router.delete('/favorites/:userId/:bookId', removeFromFavorites);

router.post('/cart', addToCart);
router.delete('/cart/:userId/:bookId', removeFromCart);

router.get('/:userId/print-orders', getUserPrintOrders);


// مسار رفع الصورة الشخصية
router.post('/profile-image', verifyToken, userMediaController.uploadProfileImage);

// مسار رفع صورة الغلاف
router.post('/cover-image', verifyToken, userMediaController.uploadCoverImage);

// تحديث عنوان الشحن لطلب معين
router.put('/:userId/orders/:orderId/shipping-address', updateOrderShippingAddress);

// إضافة مسار طلب كتاب جديد
router.post('/request-book', requestBook);

// تحديث حالة اقتراح الكتاب (added true/false)
router.patch('/requested-books/:userId/:bookId', updateRequestedBookStatus);

router.delete('/requested-books/:userId/:suggestionId', deleteRequestedBook);

// Add route for submitting book rating
router.post('/submit-rating', submitBookRating);

// Add route for getting rated books for a user
router.get('/rated-books/:userId', getRatedBooks);

// Add route for getting average rating for a book
router.get('/average-rating/:bookId', getAverageRating);

// Bulk version for list views
router.post('/bulk-average-ratings', (req, res, next) => {
  // Use a dynamic import or lazy require if needed, but since it's already in the users.controller, just use it
  const { getBulkAverageRatings } = require('../controllers/users.controller');
  return getBulkAverageRatings(req, res, next);
});

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
router.delete('/referrals/:userId/:referralId', deleteReferral);
router.post('/urgency-requests', submitUrgencyRequest);
router.patch('/urgency-requests/:userId/:requestId', updateUrgencyRequestStatus);

router.post('/request-payment', requestPayment);

module.exports = router;
