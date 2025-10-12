const bcrypt = require('bcrypt');
const User = require('../models/User.model');
const Referral = require('../models/Referral.model');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client('933338292435-c9bk3oo6i1oe3qkhkvp8crflmthhg0kc.apps.googleusercontent.com');

// Function to update user profile and sync orders' shippingAddress
async function updateUserProfile(req, res) {
  const { userId } = req.params;
  const { username, email, phone, governorate, city, village } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }

    // Update main user fields
    if (username) user.username = username;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (governorate) user.governorate = governorate;
    if (city) user.city = city;
    if (village) user.village = village;

    // Update all orders' shippingAddress fields to keep in sync
    user.orders.forEach(order => {
      order.shippingAddress.governorate = governorate || order.shippingAddress.governorate;
      order.shippingAddress.city = city || order.shippingAddress.city;
      order.shippingAddress.village = village || order.shippingAddress.village;
      order.shippingAddress.phone = phone || order.shippingAddress.phone;
    });

    await user.save();

    res.status(200).json({ message: 'تم تحديث بيانات الملف الشخصي وعناوين الشحن بنجاح' });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء تحديث بيانات الملف الشخصي', error });
  }
}


async function createAccount(req, res) {
  const { username, email, password, phone, governorate, city, village, referralCode, bookId } = req.body;

  try {
    // التحقق من البريد الإلكتروني
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'هذا البريد الإلكتروني مسجل من قبل.' });
    }

    // التحقق من رقم الهاتف المصري
    const egyptPhoneRegex = /^(010|011|012|015)[0-9]{8}$/;
    if (!egyptPhoneRegex.test(phone)) {
      return res.status(400).json({
        message: 'رقم الهاتف غير صالح، يجب أن يبدأ بـ 010 أو 011 أو 012 أو 015 ويحتوي على 11 رقمًا.'
      });
    }

    // تشفير كلمة المرور وإنشاء الحساب
    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      phone,
      governorate,
      city,
      village
    });
    await newUser.save();

    // Generate referral code if not present
    if (!newUser.referralCode) {
      newUser.referralCode = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      await newUser.save();
    }

    // Handle referral if referralCode is provided
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer && referrer._id.toString() !== newUser._id.toString()) {
        const existingReferral = await Referral.findOne({ referrerId: referrer._id, referredId: newUser._id });
        if (!existingReferral) {
          const referral = new Referral({
            referrerId: referrer._id,
            referredId: newUser._id,
            status: 'completed', // Since signup is completed
            earned: 2
          });
          await referral.save();

          // Update referrer's balance
          referrer.referralBalance += 2;
          await referrer.save();

          // Set referredBy on new user
          newUser.referredBy = referrer._id;
          await newUser.save();
        }
      }
    }

    // Return user data for auto-login (similar to login response)
    const responsePayload = {
      message: 'تم إنشاء الحساب بنجاح',
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        bookId: bookId // إعادة bookId للواجهة الأمامية
      }
    };
    res.status(201).json(responsePayload);
  } catch (error) {
    res.status(500).json({ message: 'حدث خطأ أثناء إنشاء الحساب', error });
  }
}

async function login(req, res) {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'البريد الإلكتروني غير مسجل' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'كلمة المرور غير صحيحة' });
    }

    // Generate JWT token for admin users
    let token = null;
    if (user.role === 'admin') {
      const jwt = require('jsonwebtoken');
      token = jwt.sign(
        { userId: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );
    }

    res.status(200).json({
      message: 'تم تسجيل الدخول بنجاح',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role, // Add address fields to the login response
        governorate: user.governorate,
        city: user.city,
        village: user.village,
        referralCode: user.referralCode,
        token: token // Include token for admin users
      }
    });
  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء تسجيل الدخول', error: error.message });
  }
}

async function addToFavorites(req, res) {
  const { userId, bookId } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    user.favorites.push(bookId);
    await user.save();
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: 'حدث خطأ أثناء إضافة الكتاب إلى المفضلة', error });
  }
}

async function addToCart(req, res) {
  const { userId, bookId } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    user.cart.push(bookId);
    await user.save();
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: 'حدث خطأ أثناء إضافة الكتاب إلى السلة', error });
  }
}

const removeFromFavorites = async (req, res) => {
  try {
    const { userId, bookId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    user.favorites.pull(bookId);
    await user.save();
    res.status(200).json({ message: 'تم الحذف من المفضلة' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const { userId, bookId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    user.cart.pull(bookId);
    await user.save();
    res.status(200).json({ message: 'تم الحذف من السلة' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

async function getUserData(req, res) {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    res.status(200).json({
      favorites: user.favorites,
      cart: user.cart
    });
  } catch (error) {
    res.status(500).json({ message: 'حدث خطأ أثناء جلب البيانات', error });
  }
}

async function getUserProfile(req, res) {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    res.status(200).json({
      id: user._id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      governorate: user.governorate,
      city: user.city,
      village: user.village
    });
  } catch (error) {
    res.status(500).json({ message: 'حدث خطأ أثناء جلب بيانات الملف الشخصي', error });
  }
}

async function updateOrderShippingAddress(req, res) {
  const { userId, orderId } = req.params;
  const { governorate, city, village, phone } = req.body;

  try {
    // Removed console logs to prevent output in node console
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({ message: 'معرف الطلب غير صالح' });
    }
    const orderObjectId = orderId;

    const order = user.orders.id(orderObjectId);
    if (!order) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }

    order.shippingAddress.governorate = governorate || order.shippingAddress.governorate;
    order.shippingAddress.city = city || order.shippingAddress.city;
    order.shippingAddress.village = village || order.shippingAddress.village;
    order.shippingAddress.phone = phone || order.shippingAddress.phone;

    await user.save();
    res.status(200).json({ message: 'تم تحديث عنوان الشحن بنجاح' });
  } catch (error) {
    console.error('Error updating shipping address:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء تحديث عنوان الشحن', error });
  }
}

async function requestBook(req, res) {
  const { userId, bookName, authorName } = req.body;

  if (!userId || !bookName) {
    return res.status(400).json({ message: 'userId و bookName مطلوبان' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    user.requestedBooks.push({
      bookName,
      authorName: authorName || '',
      dateRequested: new Date(),
      added: false
    });

    await user.save();
    res.status(200).json({ message: 'تم استلام طلب الكتاب وسيتم توفيره خلال بضعة أيام' });
  } catch (error) {
    console.error('Error requesting book:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء طلب الكتاب', error });
  }
}

// New controller to get all requested books from all users
async function getAllRequestedBooks(req, res) {
  try {
    const users = await User.find({}, 'requestedBooks username');
    let allRequestedBooks = [];
    users.forEach(user => {
      if (user.requestedBooks && user.requestedBooks.length > 0) {
        allRequestedBooks = allRequestedBooks.concat(user.requestedBooks.map(rb => ({
          _id: rb._id,
          userId: user._id,
          username: user.username,
          bookName: rb.bookName,
          authorName: rb.authorName,
          dateRequested: rb.dateRequested,
          added: rb.added
        })));
      }
    });
    res.status(200).json(allRequestedBooks);
  } catch (error) {
    console.error('Error fetching requested books:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء جلب اقتراحات الكتب', error });
  }
}

// Controller to update the 'added' status of a requested book
async function updateRequestedBookStatus(req, res) {
  const { userId, bookId } = req.params;
  const { added } = req.body;

  if (typeof added !== 'boolean') {
    return res.status(400).json({ message: 'قيمة الحالة يجب أن تكون true أو false' });
  }

  try {
    // console.log(`updateRequestedBookStatus called with userId: ${userId}, bookId: ${bookId}, added: ${added}`);
    const user = await User.findById(userId);
    if (!user) {
      console.log(`User not found with id: ${userId}`);
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }

    const requestedBook = user.requestedBooks.id(bookId);
    if (!requestedBook) {
      console.log(`Requested book not found with id: ${bookId} for user: ${userId}`);
      return res.status(404).json({ message: 'اقتراح الكتاب غير موجود' });
    }

    requestedBook.added = added;

    // Create notification message based on added status
    const notificationMessage = added
      ? `تمت إضافة اقتراح الكتاب "${requestedBook.bookName}"`
      : `تمت إزالة اقتراح الكتاب "${requestedBook.bookName}"`;

    // Add notification to user
    user.notifications.push({
      message: notificationMessage,
      type: 'suggestion',
      read: false,
      createdAt: new Date(),
      relatedId: bookId
    });

    await user.save();
    // console.log(`Notification added and user saved successfully for userId: ${userId}`);

    res.status(200).json({ message: 'تم تحديث حالة اقتراح الكتاب بنجاح' });
  } catch (error) {
    console.error('Error updating requested book status:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء تحديث حالة اقتراح الكتاب', error });
  }
}

async function deleteRequestedBook(req, res) {
  const { userId, suggestionId } = req.params;

  try {
    const user = await User.findById(userId);
    if (!user) {
      console.log(`User not found with id: ${userId}`);
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }

    const requestedBook = user.requestedBooks.id(suggestionId);
    if (!requestedBook) {
      console.log(`Requested book not found with id: ${suggestionId} for user: ${userId}`);
      return res.status(404).json({ message: 'اقتراح الكتاب غير موجود' });
    }

    user.requestedBooks.pull(suggestionId);
    await user.save();

    res.status(200).json({ message: 'تم حذف اقتراح الكتاب بنجاح' });
  } catch (error) {
    console.error('Error deleting requested book:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء حذف اقتراح الكتاب', error });
  }
}

async function submitBookRating(req, res) {
  const { userId, bookId, rating } = req.body;

  if (!userId || !bookId || rating === undefined) {
    return res.status(400).json({ message: 'userId, bookId, and rating are required' });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Check if the user has an order with this book and status "تم التسليم" (delivered)
    const hasDeliveredBook = user.orders.some(order =>
      order.status === 'تم التسليم' &&
      order.products.some(product => product.bookId === bookId)
    );

    if (!hasDeliveredBook) {
      return res.status(403).json({ message: 'Cannot rate a book that has not been delivered' });
    }

    // Check if the book is already rated by the user
    const existingRatingIndex = user.ratedBooks.findIndex(rb => rb.bookId === bookId);
    if (existingRatingIndex !== -1) {
      // Update existing rating
      user.ratedBooks[existingRatingIndex].rating = rating;
      user.ratedBooks[existingRatingIndex].dateRated = new Date();
    } else {
      // Add new rating
      user.ratedBooks.push({ bookId, rating, dateRated: new Date() });
    }

    await user.save();
    res.status(200).json({ message: 'Rating submitted successfully' });
  } catch (error) {
    console.error('Error submitting book rating:', error);
    res.status(500).json({ message: 'Error submitting book rating', error });
  }
}

async function getRatedBooks(req, res) {
  const { userId } = req.params;
  try {
    const user = await User.findById(userId, 'ratedBooks');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(user.ratedBooks || []);
  } catch (error) {
    console.error('Error fetching rated books:', error);
    res.status(500).json({ message: 'Error fetching rated books', error });
  }
}

async function googleSignIn(req, res) {
  const { idToken, referralCode } = req.body;

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: '933338292435-c9bk3oo6i1oe3qkhkvp8crflmthhg0kc.apps.googleusercontent.com'
    });
    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(400).json({ message: 'Invalid Google token' });
    }

    const { sub: googleId, email, name } = payload;

    let user = await User.findOne({ email });

    if (!user) {
      // Create new user with googleId, no password, and default values for required fields
      user = new User({
        username: name || email,
        email,
        password: '', // no password for Google users
        phone: '',
        governorate: '',
        city: '',
        village: '',
        googleId
      });
      await user.save();

      // Generate referral code if not present
      if (!user.referralCode) {
        user.referralCode = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        await user.save();
      }

      // Handle referral if referralCode is provided
      if (referralCode) {
        const referrer = await User.findOne({ referralCode });
        if (referrer && referrer._id.toString() !== user._id.toString()) {
          const existingReferral = await Referral.findOne({ referrerId: referrer._id, referredId: user._id });
          if (!existingReferral) {
            const referral = new Referral({
              referrerId: referrer._id,
              referredId: user._id,
              status: 'completed', // Set to completed for rewards
              earned: 2
            });
            await referral.save();

            // Update referrer's balance
            referrer.referralBalance += 2;
            await referrer.save();

            // Set referredBy on new user
            user.referredBy = referrer._id;
            await user.save();
          }
        }
      }
    } else if (!user.googleId) {
      // Update existing user to add googleId if not present
      user.googleId = googleId;
      await user.save();
    }

    res.status(200).json({
      id: user._id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      role: user.role,
      governorate: user.governorate,
      city: user.city,
      village: user.village,
      referralCode: user.referralCode
    });
  } catch (error) {
    console.error('Error during Google sign-in:', error);
    res.status(500).json({ message: 'Error during Google sign-in', error });
  }
}

async function getNotifications(req, res) {
  const { userId } = req.params;
  try {
    const user = await User.findById(userId).select('notifications');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    // Convert notifications to plain objects and format createdAt as ISO string
    const notifications = (user.notifications || []).map(n => ({
      _id: n._id,
      message: n.message,
      type: n.type,
      read: n.read,
      createdAt: n.createdAt ? n.createdAt.toISOString() : null,
      relatedId: n.relatedId
    }));
    res.status(200).json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Error fetching notifications', error });
  }
}

async function markNotificationAsRead(req, res) {
  const { userId, notificationId } = req.params;
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const notification = user.notifications.id(notificationId);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    notification.read = true;
    await user.save();
    res.status(200).json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: 'Error marking notification as read', error });
  }
}

async function deleteNotification(req, res) {
  const { userId, notificationId } = req.params;
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }
    const notification = user.notifications.id(notificationId);
    if (!notification) {
      return res.status(404).json({ message: 'الإشعار غير موجود' });
    }
    user.notifications.pull(notificationId);
    await user.save();
    res.status(200).json({ message: 'تم حذف الإشعار بنجاح' });
  } catch (error) {
    console.error('Error deleting notification:', error.stack || error);
    res.status(500).json({ message: 'حدث خطأ أثناء حذف الإشعار', error });
  }
}

async function checkEmailExists(req, res) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'البريد الإلكتروني مطلوب' });
  }
  try {
    const user = await User.findOne({ email });
    if (user) {
      return res.status(200).json({ exists: true });
    } else {
      return res.status(404).json({ exists: false, message: 'البريد الإلكتروني غير موجود' });
    }
  } catch (error) {
    console.error('Error checking email existence:', error);
    return res.status(500).json({ message: 'حدث خطأ أثناء التحقق من البريد الإلكتروني' });
  }
}

async function resetPassword(req, res) {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) {
    return res.status(400).json({ message: 'البريد الإلكتروني وكلمة المرور الجديدة مطلوبان' });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    await user.save();
    return res.status(200).json({ message: 'تم تحديث كلمة المرور بنجاح' });
  } catch (error) {
    console.error('Error resetting password:', error);
    return res.status(500).json({ message: 'حدث خطأ أثناء إعادة تعيين كلمة المرور' });
  }
}

async function generateReferralLink(req, res) {
  const { userId, bookId, bookName } = req.body;
  if (!userId || !bookId || !bookName) {
    return res.status(400).json({ message: 'User ID, Book ID, and Book Name are required' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.referralCode) {
      user.referralCode = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      await user.save();
    }

    const baseUrl = process.env.NODE_ENV === 'production' ? 'https://kenouz.org' : 'http://localhost:4200';
    const bookSlug = getBookSlug(bookName);
    const link = `${baseUrl}/book/${bookId}/${bookSlug}?ref=${user.referralCode}`;
    res.json({ link });
  } catch (error) {
    console.error('Error generating referral link:', error);
    res.status(500).json({ message: 'Error generating link' });
  }
}

async function getReferralBalance(req, res) {
  const { userId } = req.params;
  try {
    const user = await User.findById(userId).select('referralBalance referralCode');
    if (!user.referralCode) {
      user.referralCode = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      await user.save();
    }
    res.json({ balance: user.referralBalance, referralCode: user.referralCode });
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
}

function getBookSlug(bookName) {
  if (!bookName) return '';
  return bookName
    .toString()
    .toLowerCase() // Convert to lowercase
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w\u0621-\u064A\u0660-\u0669\u06F0-\u06F9\-]+/g, '') // Keep Arabic, numbers, and hyphen
    .replace(/\-\-+/g, '-'); // Replace multiple - with single -
}

async function getReferrals(req, res) {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: 'معرف مستخدم غير صالح' });
  }

  // Load all products from output.json into a map for quick lookup
  const productsData = fs.readFileSync(path.join(__dirname, '..', 'output.json'), 'utf-8');
  const allProducts = JSON.parse(productsData);
  const productMap = new Map(
    allProducts.filter(p => p.products_id != null).map(p => [p.products_id.toString(), p])
  );

  try {
    const referrals = await Referral.find({ referrerId: userId })
      .sort({ createdAt: -1 }) // Sort by most recent
      .populate('referredId', 'username'); // جلب اسم المستخدم المُحال

    const formattedReferrals = referrals.map(ref => {
      const book = ref.bookId ? productMap.get(ref.bookId.toString()) : null;

      return {
        _id: ref._id,
        referredId: ref.referredId,
        bookName: book ? book.product_name : 'منتج غير معروف',
        bookLink: book ? `/book/${book.products_id}/${getBookSlug(book.product_name)}` : '#',
        status: ref.status,
        earned: ref.earned,
        createdAt: ref.createdAt,
      };
    });

    res.json({ referrals: formattedReferrals });
  } catch (error) {
    console.error('خطأ في جلب الإحالات:', error);
    res.status(500).json({ message: 'خطأ في الخادم أثناء جلب الإحالات' });
  }
}

async function deleteReferral(req, res) {
  const { userId, referralId } = req.params;

  try {
    // First, check if the referral exists and belongs to the user
    const referral = await Referral.findOne({ _id: referralId, referrerId: userId });
    if (!referral) {
      return res.status(404).json({ message: 'Referral not found' });
    }

    // Delete the referral from the Referral collection
    await Referral.findByIdAndDelete(referralId);

    res.json({ message: 'Referral deleted successfully' });
  } catch (error) {
    console.error('Error deleting referral:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء حذف الإحالة' });
  }
}

/**
 * @deprecated This function has been moved to payment-requests.controller.js and will be removed in a future version.
 * It is kept here temporarily to prevent the server from crashing due to old route references.
 * Please update your routes in `users.routes.js` to remove any calls to this function.
 */
async function requestPayment(req, res) {
  res.status(410).json({ message: 'This endpoint is deprecated. Please use /api/payment-requests/request instead.' });
}

module.exports = {
  createAccount,
  login,
  addToFavorites,
  addToCart,
  removeFromFavorites,
  removeFromCart,
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
  googleSignIn,
  getNotifications,
  markNotificationAsRead,
  deleteNotification,
  // Add new method to get average rating for a book
  getAverageRating: async (req, res) => {
    try {
      const bookId = req.params.bookId;
      if (!bookId) {
        return res.status(400).json({ message: 'Book ID is required' });
      }
      // Aggregate ratings for the book from all users
      const result = await User.aggregate([
        { $unwind: '$ratedBooks' },
        { $match: { 'ratedBooks.bookId': bookId } },
        {
          $group: {
            _id: '$ratedBooks.bookId',
            averageRating: { $avg: '$ratedBooks.rating' },
            ratingCount: { $sum: 1 }
          }
        }
      ]);
      if (result.length === 0) {
        return res.json({ bookId, averageRating: 0, ratingCount: 0 });
      }
      const { averageRating, ratingCount } = result[0];
      return res.json({ bookId, averageRating, ratingCount });
    } catch (error) {
      console.error('Error getting average rating:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
  checkEmailExists,
  resetPassword,
  generateReferralLink,
  getReferralBalance,
  getReferrals,
  deleteReferral,
  requestPayment, // Re-add temporarily to avoid crash
};
