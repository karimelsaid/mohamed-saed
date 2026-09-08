const bcrypt = require('bcrypt');
const User = require('../models/User.model');
const Referral = require('../models/Referral.model');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client('933338292435-c9bk3oo6i1oe3qkhkvp8crflmthhg0kc.apps.googleusercontent.com');
const SystemSettings = require('../models/SystemSettings');
const googleSheetsService = require('../services/google-sheets.service');

// Helper to filter active/unexpired coupons
const filterActiveCoupons = (coupons) => {
  const now = new Date();
  return (coupons || []).filter(c => {
    // 1. Must have a valid populated couponId
    if (!c.couponId || typeof c.couponId !== 'object') return false;

    // 2. Must not be used
    if (c.isUsed) return false;

    // 3. Check expiry based on duration
    const earnedAt = new Date(c.earnedAt || c.createdAt || now);
    const durationValue = c.couponId.durationValue;
    const durationUnit = c.couponId.durationUnit || 'days';

    if (!durationValue) return true; // No explicit expiry duration set, keep it

    const expiryDate = new Date(earnedAt);
    if (durationUnit === 'hours') {
      expiryDate.setHours(expiryDate.getHours() + durationValue);
    } else {
      expiryDate.setDate(expiryDate.getDate() + durationValue);
    }

    return expiryDate > now;
  });
};

// Function to update user profile and sync orders' shippingAddress
async function updateUserProfile(req, res) {
  const { userId } = req.params;
  const { username, email, phone, governorate, city, village, gender, postOffice, bio, preparationTime, merchantShippingMethod, merchantName, taxNumber, logo, coverPhoto, shippingRates } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }

    // Update main user fields
    if (username) user.username = username;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (gender) user.gender = gender;
    if (governorate) user.governorate = governorate;
    if (city) user.city = city;
    if (village) user.village = village;
    if (postOffice) {
      user.postOffice = postOffice;
    }
    if (bio !== undefined) user.bio = bio;
    if (preparationTime !== undefined) user.preparationTime = preparationTime;
    if (merchantShippingMethod !== undefined) user.merchantShippingMethod = merchantShippingMethod;
    if (merchantName !== undefined) user.merchantName = merchantName;
    if (taxNumber !== undefined) user.taxNumber = taxNumber;
    if (logo !== undefined) user.logo = logo;
    if (coverPhoto !== undefined) user.coverPhoto = coverPhoto;
    if (shippingRates !== undefined) user.shippingRates = shippingRates;

    // Update all orders' shippingAddress fields to keep in sync
    user.orders.forEach(order => {
      order.shippingAddress.governorate = governorate || order.shippingAddress.governorate;
      order.shippingAddress.city = city || order.shippingAddress.city;
      order.shippingAddress.village = village || order.shippingAddress.village;
      order.shippingAddress.phone = phone || order.shippingAddress.phone;
    });

    await user.save();

    // Real-time Sync to Google Sheets
    googleSheetsService.syncSingleUser(user).catch(err => console.error('Google Sheet Sync Error on profile update:', err));

    res.status(200).json({ message: 'تم تحديث بيانات الملف الشخصي وعناوين الشحن بنجاح' });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء تحديث بيانات الملف الشخصي', error });
  }
}


async function createAccount(req, res) {
  const { username, email, password, phone, governorate, city, village, gender, referralCode, bookId } = req.body;

  try {
    // التحقق من البريد الإلكتروني (Case Insensitive)
    const normalizedEmail = email ? email.trim() : '';
    const existingUser = await User.findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } });
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
      village,
      gender
    });
    await newUser.save();

    // Real-time Sync to Google Sheets
    googleSheetsService.syncSingleUser(newUser).catch(err => console.error('Sheet Sync Error:', err));

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
          const settings = await SystemSettings.getInstance();
          const referralPoints = settings.gamification.referralPoints || 50;

          const referral = new Referral({
            referrerId: referrer._id,
            referredId: newUser._id,
            status: 'completed', // Since signup is completed
            earned: referralPoints // Dynamic value
          });
          await referral.save();

          // Award Coins via Gamification Service
          const gamificationService = require('../services/gamification.service');
          await gamificationService.processReferral(referrer._id, newUser._id);

          // Set referredBy on new user
          newUser.referredBy = referrer._id;
          await newUser.save();
        }
      }
    }

    // Generate JWT token
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email, role: newUser.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '30d' }
    );

    // Return user data for auto-login (similar to login response)
    const responsePayload = {
      message: 'تم إنشاء الحساب بنجاح',
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        gender: newUser.gender,
        bookId: bookId,
        profileImage: newUser.profileImage,
        token: token
      }
    };
    res.status(201).json(responsePayload);

    // Push Notification to Admins - New Reader Registration
    try {
      const pushService = require('../services/push-notification.service');
      pushService.sendToAdmins({
        title: 'مستخدم جديد 🎉',
        body: `انضم قارئ جديد: ${newUser.username} (${newUser.governorate || 'غير محدد'})`,
        url: '/admin',
        data: { type: 'new_reader_registration' }
      }).catch(err => console.error('Admin Push Error:', err));
    } catch (pushErr) {
      console.error('Push Service Error:', pushErr);
    }
  } catch (error) {
    res.status(500).json({ message: 'حدث خطأ أثناء إنشاء الحساب', error });
  }
}

async function login(req, res) {
  const { email, password } = req.body;

  try {
    const normalizedEmail = email ? email.trim() : '';
    console.log(`🔑 [Login] Attempt for: ${normalizedEmail}`);

    const user = await User.findOne({
      email: { $regex: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    }).populate('earnedCoupons.couponId').maxTimeMS(5000);

    if (!user) {
      console.warn(`❌ [Login] User not found: ${normalizedEmail}`);
      return res.status(401).json({
        message: 'البريد الإلكتروني غير مسجل',
        debugInfo: {
          receivedEmail: email,
          normalizedEmail: normalizedEmail,
          version: '1.2-fix-casing'
        }
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.warn(`❌ [Login] Password mismatch for: ${normalizedEmail}`);
      return res.status(401).json({ message: 'كلمة المرور غير صحيحة' });
    }

    console.log(`✅ [Login] Success for: ${normalizedEmail} (${user.role})`);

    // Generate JWT token for all users
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '30d' }
    );

    // Process Login Reward (Background)
    const gamificationService = require('../services/gamification.service');
    gamificationService.processLogin(user._id).catch(err => console.error('Login Reward Error:', err));

    res.status(200).json({
      message: 'تم تسجيل الدخول بنجاح',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: (user.marketer && user.marketer.applicationStatus === 'approved') ? 'marketer' : user.role,
        gender: user.gender,
        governorate: user.governorate,
        city: user.city,
        village: user.village,
        referralCode: user.referralCode,
        profileImage: user.profileImage,
        quranProgress: user.quranProgress,
        gamification: user.gamification,
        earnedCoupons: filterActiveCoupons(user.earnedCoupons),
        permissions: (user.role === 'staff') 
          ? (user.permissions || []) 
          : ((user.marketer && user.marketer.applicationStatus === 'approved' && !(user.permissions || []).includes('marketing')) 
            ? [...(user.permissions || []), 'marketing'] 
            : (user.permissions || [])),
        marketer: user.marketer ? {
          isMarketer: user.marketer.isMarketer || false,
          applicationStatus: user.marketer.applicationStatus || 'none',
          commissionRate: user.marketer.commissionRate || 10,
          balance: user.marketer.balance || 0,
          totalEarnings: user.marketer.totalEarnings || 0,
          level: user.marketer.level || 1,
          levelLabel: user.marketer.levelLabel || 'مسوق مبتدئ',
          points: user.marketer.points || 0,
          ordersCount: user.marketer.ordersCount || 0,
          clicksCount: user.marketer.clicksCount || 0,
          tasks: user.marketer.tasks || [],
          prizes: user.marketer.prizes || [],
          referralLinks: user.marketer.referralLinks || []
        } : {
          isMarketer: false,
          applicationStatus: 'none',
          commissionRate: 10,
          balance: 0,
          totalEarnings: 0,
          level: 1,
          levelLabel: 'مسوق مبتدئ',
          points: 0,
          ordersCount: 0,
          clicksCount: 0,
          tasks: [],
          prizes: [],
          referralLinks: []
        },
        token: token
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
    const user = await User.findById(req.params.userId).populate('earnedCoupons.couponId');
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    console.log('📋 [getUserData] User:', user.email, 'role:', user.role, 'permissions:', user.permissions);

    res.status(200).json({
      favorites: user.favorites,
      cart: user.cart,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: (user.marketer && user.marketer.applicationStatus === 'approved') ? 'marketer' : user.role,
        gender: user.gender,
        governorate: user.governorate,
        city: user.city,
        village: user.village,
        referralCode: user.referralCode,
        merchantShippingMethod: user.merchantShippingMethod || 'knoozbook',
        preparationTime: user.preparationTime || 1,
        merchantName: user.merchantName,
        taxNumber: user.taxNumber,
        logo: user.logo,
        shippingRates: user.shippingRates || [],
        profileImage: user.profileImage,
        coverPhoto: user.coverPhoto,
        quranProgress: user.quranProgress,
        gamification: user.gamification,
        earnedCoupons: filterActiveCoupons(user.earnedCoupons),
        isMarketer: (user.marketer && user.marketer.applicationStatus === 'approved') || user.role === 'admin' || user.role === 'staff',
        permissions: (user.role === 'staff') 
          ? (user.permissions || []) 
          : ((user.marketer && user.marketer.applicationStatus === 'approved' && !(user.permissions || []).includes('marketing')) 
            ? [...(user.permissions || []), 'marketing'] 
            : (user.permissions || [])),
        marketer: user.marketer ? {
          isMarketer: user.marketer.isMarketer || false,
          applicationStatus: user.marketer.applicationStatus || 'none',
          commissionRate: user.marketer.commissionRate || 10,
          balance: user.marketer.balance || 0,
          totalEarnings: user.marketer.totalEarnings || 0,
          level: user.marketer.level || 1,
          levelLabel: user.marketer.levelLabel || 'مسوق مبتدئ',
          points: user.marketer.points || 0,
          ordersCount: user.marketer.ordersCount || 0,
          clicksCount: user.marketer.clicksCount || 0,
          tasks: user.marketer.tasks || [],
          prizes: user.marketer.prizes || [],
          referralLinks: user.marketer.referralLinks || []
        } : {
          isMarketer: false,
          applicationStatus: 'none',
          commissionRate: 10,
          balance: 0,
          totalEarnings: 0,
          level: 1,
          levelLabel: 'مسوق مبتدئ',
          points: 0,
          ordersCount: 0,
          clicksCount: 0,
          tasks: [],
          prizes: [],
          referralLinks: []
        }
      }
    });
  } catch (error) {
    console.error('GetUserData Error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء جلب البيانات', error: error.message });
  }
}

async function getUserProfile(req, res) {
  try {
    const user = await User.findById(req.params.userId).populate('earnedCoupons.couponId');
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    res.status(200).json({
      id: user._id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      governorate: user.governorate,
      city: user.city,
      village: user.village,
      role: user.role,
      postOffice: user.postOffice,
      referralBalance: user.referralBalance || 0,
      merchantShippingMethod: user.merchantShippingMethod || 'knoozbook',
      preparationTime: user.preparationTime || 1,
      merchantName: user.merchantName,
      taxNumber: user.taxNumber,
      logo: user.logo,
      shippingRates: user.shippingRates || [],
      profileImage: user.profileImage,
      coverPhoto: user.coverPhoto,
      quranProgress: user.quranProgress,
      gamification: user.gamification,
      role: (user.marketer && user.marketer.applicationStatus === 'approved') ? 'marketer' : user.role,
      permissions: (user.marketer && user.marketer.applicationStatus === 'approved' && !(user.permissions || []).includes('marketing')) 
        ? [...(user.permissions || []), 'marketing'] 
        : (user.permissions || []),
      earnedCoupons: filterActiveCoupons(user.earnedCoupons),
      marketer: user.marketer ? {
        isMarketer: user.marketer.isMarketer || false,
        applicationStatus: user.marketer.applicationStatus || 'none',
        commissionRate: user.marketer.commissionRate || 10,
        balance: user.marketer.balance || 0,
        totalEarnings: user.marketer.totalEarnings || 0,
        level: user.marketer.level || 1,
        levelLabel: user.marketer.levelLabel || 'مسوق مبتدئ',
        points: user.marketer.points || 0,
        ordersCount: user.marketer.ordersCount || 0,
        clicksCount: user.marketer.clicksCount || 0,
        tasks: user.marketer.tasks || [],
        prizes: user.marketer.prizes || [],
        referralLinks: user.marketer.referralLinks || []
      } : {
        isMarketer: false,
        applicationStatus: 'none',
        commissionRate: 10,
        balance: 0,
        totalEarnings: 0,
        level: 1,
        levelLabel: 'مسوق مبتدئ',
        points: 0,
        ordersCount: 0,
        clicksCount: 0,
        tasks: [],
        prizes: [],
        referralLinks: []
      }
    });
  } catch (error) {
    console.error('GetUserProfile Error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء جلب بيانات الملف الشخصي', error: error.message });
  }
}

async function getPublicProfile(req, res) {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    res.status(200).json({
      id: user._id,
      username: user.username,
      profileImage: user.profileImage,
      gender: user.gender,
      isSheikh: user.isSheikh,
      role: user.role,
      bio: user.bio,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('GetPublicProfile Error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء جلب بيانات الملف الشخصي', error: error.message });
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
  const { userId, bookName, authorName, phoneNumber } = req.body;

  if (!userId || !bookName) {
    return res.status(400).json({ message: 'userId و bookName مطلوبان' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    // If phoneNumber is provided and user doesn't have a phone, update user's phone
    if (phoneNumber && !user.phone) {
      user.phone = phoneNumber;
    }

    user.requestedBooks.push({
      bookName,
      authorName: authorName || '',
      phoneNumber: phoneNumber || user.phone || '',
      dateRequested: new Date(),
      added: false
    });

    await user.save();
    res.status(200).json({ message: 'تم استلام طلب الكتاب وسيتم توفيره خلال بضعة أيام' });

    // Push Notification to Admins
    const pushService = require('../services/push-notification.service');
    pushService.sendToAdmins({
      title: 'اقتراح كتاب جديد 📚',
      body: `المستخدم ${user.username} يقترح كتاب: ${bookName}`,
      url: '/admin/requested-books',
      data: { type: 'book_suggestion' }
    }).catch(err => console.error('Admin Push Error:', err));
  } catch (error) {
    console.error('Error requesting book:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء طلب الكتاب', error });
  }
}

// New controller to get all requested books from all users
async function getAllRequestedBooks(req, res) {
  try {
    // Optimization: Only find users that have at least one requested book
    const users = await User.find({ "requestedBooks.0": { $exists: true } }, 'requestedBooks username phone');
    let allRequestedBooks = [];

    users.forEach(user => {
      if (user.requestedBooks && user.requestedBooks.length > 0) {
        allRequestedBooks = allRequestedBooks.concat(user.requestedBooks.map(rb => ({
          _id: rb._id,
          userId: user._id,
          username: user.username,
          phoneNumber: rb.phoneNumber || user.phone || '',
          bookName: rb.bookName,
          authorName: rb.authorName,
          dateRequested: rb.dateRequested,
          added: rb.added
        })));
      }
    });

    // Sort by date requested descending
    allRequestedBooks.sort((a, b) => new Date(b.dateRequested) - new Date(a.dateRequested));

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

    // Push Notification to User
    const pushService = require('../services/push-notification.service');
    pushService.sendToUser(user._id, {
      title: added ? 'تم توفير كتابك المقترح! 📚' : 'تحديث بخصوص اقتراح الكتاب',
      body: added 
        ? `خبر سار! تمت إضافة الكتاب الذي اقترحته "${requestedBook.bookName}" إلى مكتبتنا. تفحصه الآن.`
        : `نعتذر، تمت إزالة اقتراح الكتاب "${requestedBook.bookName}" من قائمة الاهتمام حالياً.`,
      url: added ? `/product-details/${bookId}` : '/my-suggestions',
      data: { type: 'suggestion_update', bookId: String(bookId), added: String(added) }
    }).catch(err => console.error('User Push Error:', err));
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

async function getUserPrintOrders(req, res) {
  try {
    const user = await User.findById(req.params.userId).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const printOrders = user.orders
      .filter(order =>
        order.printProjects &&
        order.printProjects.length > 0 &&
        order.status === 'تم التسليم')
      .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by most recent

    res.status(200).json(printOrders);
  } catch (error) {
    console.error('Error fetching user print orders:', error);
    res.status(500).json({ message: 'Server error' });
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
    // Verify ID Token
    // console.log('🔐 Verifying Google Token...');
    const ticket = await client.verifyIdToken({
      idToken,
      audience: [
        '933338292435-c9bk3oo6i1oe3qkhkvp8crflmthhg0kc.apps.googleusercontent.com', // Web Client ID
        '933338292435-br4gba7k8tu2518q5dghkkj9meilirb6.apps.googleusercontent.com', // Android Client ID 1
        '933338292435-mdpbppoua97gt3vt2bidpip89q0rjjue.apps.googleusercontent.com'  // Android Client ID 2
      ]
    });
    const payload = ticket.getPayload();
    // console.log('✅ Google Token Verified. Payload:', payload);

    if (!payload) {
      return res.status(400).json({ message: 'Invalid Google token' });
    }

    const { sub: googleId, email, name } = payload;
    let user = await User.findOne({ email }).populate('earnedCoupons.couponId');

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

      // Real-time Sync to Google Sheets (for new Google users)
      googleSheetsService.syncSingleUser(user).catch(err => console.error('Google Sheet Sync Error:', err));

      // Push Notification to Admins - New Google Sign-In User
      try {
        const pushService = require('../services/push-notification.service');
        pushService.sendToAdmins({
          title: 'مستخدم جديد (Google) 🎉',
          body: `انضم قارئ جديد عبر Google: ${user.username}`,
          url: '/admin',
          data: { type: 'new_google_registration' }
        }).catch(err => console.error('Admin Push Error:', err));
      } catch (pushErr) {
        console.error('Push Service Error:', pushErr);
      }

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
            const settings = await SystemSettings.getInstance();
            const referralPoints = settings.gamification.referralPoints || 50;

            const referral = new Referral({
              referrerId: referrer._id,
              referredId: user._id,
              status: 'completed', // Set to completed for rewards
              earned: referralPoints // Dynamic value
            });
            await referral.save();

            // Award Coins via Gamification Service
            const gamificationService = require('../services/gamification.service');
            await gamificationService.processReferral(referrer._id, user._id);

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

    // Generate JWT token
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '30d' }
    );

    // Process Login Reward (Background)
    const gamificationService = require('../services/gamification.service');
    gamificationService.processLogin(user._id).catch(err => console.error('Login Reward Error:', err));


    // Convert user to object and remove password
    const userObject = user.toObject();
    delete userObject.password;

    // CRITICAL FIX: Map _id to id for frontend compatibility
    userObject.id = user._id;

    // Add token to the response
    userObject.token = token;

    res.status(200).json({
      message: 'تم تسجيل الدخول بنجاح',
      user: {
        ...userObject,
        earnedCoupons: filterActiveCoupons(userObject.earnedCoupons)
      }
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
    res.status(500).json({ message: 'Error fetching notifications', error: error.message });
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
  const { userId, productId, productName, productCategory } = req.body;
  // Fallback for backward compatibility
  const pId = productId || req.body.bookId;
  const pName = productName || req.body.bookName;

  if (!userId || !pId || !pName) {
    return res.status(400).json({ message: 'User ID, Product ID, and Product Name are required' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.referralCode) {
      user.referralCode = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      await user.save();
    }

    const baseUrl = process.env.NODE_ENV === 'production' ? 'https://knoozbook.com' : 'http://localhost:4200';
    const productSlug = getBookSlug(pName);
    const routePrefix = getRoutePrefix(productCategory);

    const link = `${baseUrl}/${routePrefix}/${pId}/${productSlug}?ref=${user.referralCode}`;
    res.json({ link });
  } catch (error) {
    console.error('Error generating referral link:', error);
    res.status(500).json({ message: 'Error generating link' });
  }
}

function getRoutePrefix(category) {
  const categoryRoutes = {
    'أدوات مكتبية': 'office-supplies',
    'إلكترونيات': 'electronics',
    'ملابس': 'clothing',
    'التجميل والعناية الشخصية': 'cosmetics',
    'الأحذية': 'shoes',
    'أثاث': 'furniture',
    'ألعاب': 'games',
    'أقمشة': 'fabrics',
    'كتب': 'book',
    'روايات وقصص': 'book',
    'تطوير الذات وعلم النفس': 'book',
    'كتب دينية': 'book',
    'أعمال وتسويق ومالية': 'book',
    'صحة وطب وعلوم': 'book',
    'تاريخ وسير ذاتية': 'book',
    'تربية وأطفال': 'book',
    'فنون وحرف': 'book',
    'قواميس ومراجع': 'book'
  };
  return categoryRoutes[category] || 'others';
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
    console.error('Error fetching referral balance:', error);
    res.status(500).json({ message: 'Error fetching referral balance', error: error.message });
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
      const product = ref.bookId ? productMap.get(ref.bookId.toString()) : null;
      let productLink = '#';
      let productName = 'منتج غير معروف';

      if (product) {
        productName = product.product_name;
        const routePrefix = getRoutePrefix(product.product_category);
        productLink = `/${routePrefix}/${product.products_id}/${getBookSlug(product.product_name)}`;
      }

      return {
        _id: ref._id,
        referredId: ref.referredId,
        productName: productName, // Renamed from bookName
        productLink: productLink, // Renamed from bookLink
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

async function submitUrgencyRequest(req, res) {
  const { userId, bookId, bookName, merchantId, merchantName } = req.body;

  if (!userId || !bookId || !bookName) {
    return res.status(400).json({ message: 'userId, bookId, and bookName are required' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    // Check if urgency request already exists for this book
    const existingRequest = user.urgencyRequests.find(req => req.bookId === bookId && req.status === 'pending');
    if (existingRequest) {
      return res.status(400).json({ message: 'لقد قمت بطلب استعجال لهذا الكتاب من قبل' });
    }

    user.urgencyRequests.push({
      bookId,
      bookName,
      merchantId,
      merchantName,
      requestedAt: new Date(),
      status: 'pending'
    });

    await user.save();
    res.status(200).json({ message: 'تم إرسال طلب الاستعجال بنجاح' });

    // Push Notification to Admins
    const pushService = require('../services/push-notification.service');
    pushService.sendToAdmins({
      title: 'طلب استعجال جديد ⚡',
      body: `المستخدم ${user.username} يطلب استعجال كتاب: ${bookName}`,
      url: '/admin/urgency-requests',
      data: { type: 'urgency_request' }
    }).catch(err => console.error('Admin Push Error:', err));
  } catch (error) {
    console.error('Error submitting urgency request:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء إرسال طلب الاستعجال', error });
  }
}

// New controller to get all urgency requests from all users
async function getAllUrgencyRequests(req, res) {
  try {
    const users = await User.find({}, 'urgencyRequests username');
    let allUrgencyRequests = [];
    users.forEach(user => {
      if (user.urgencyRequests && user.urgencyRequests.length > 0) {
        allUrgencyRequests = allUrgencyRequests.concat(user.urgencyRequests.map(req => ({
          _id: req._id,
          userId: user._id,
          username: user.username,
          bookId: req.bookId,
          bookName: req.bookName,
          merchantId: req.merchantId,
          merchantName: req.merchantName,
          requestedAt: req.requestedAt,
          status: req.status
        })));
      }
    });
    res.status(200).json(allUrgencyRequests);
  } catch (error) {
    console.error('Error fetching urgency requests:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء جلب طلبات الاستعجال', error });
  }
}

// Controller to update the status of an urgency request
async function updateUrgencyRequestStatus(req, res) {
  const { userId, requestId } = req.params;
  const { status } = req.body;

  if (!['pending', 'fulfilled'].includes(status)) {
    return res.status(400).json({ message: 'الحالة يجب أن تكون pending أو fulfilled' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }

    const urgencyRequest = user.urgencyRequests.id(requestId);
    if (!urgencyRequest) {
      return res.status(404).json({ message: 'طلب الاستعجال غير موجود' });
    }

    urgencyRequest.status = status;

    // Add notification to user
    user.notifications.push({
      message: status === 'fulfilled' ? `تم توفير الكتاب "${urgencyRequest.bookName}"` : `تم تحديث حالة طلب الاستعجال للكتاب "${urgencyRequest.bookName}"`,
      type: 'urgency',
      read: false,
      createdAt: new Date(),
      relatedId: requestId
    });

    await user.save();

    res.status(200).json({ message: 'تم تحديث حالة طلب الاستعجال بنجاح' });
  } catch (error) {
    console.error('Error updating urgency request status:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء تحديث حالة طلب الاستعجال', error });
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
  getPublicProfile,
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

  // Optimized: Get average ratings for multiple books in a single query
  getBulkAverageRatings: async (req, res) => {
    try {
      const { bookIds } = req.body;
      if (!bookIds || !Array.isArray(bookIds) || bookIds.length === 0) {
        return res.status(400).json({ message: 'bookIds array is required' });
      }

      // Aggregate ratings for all requested books in one pass
      const results = await User.aggregate([
        { $unwind: '$ratedBooks' },
        { $match: { 'ratedBooks.bookId': { $in: bookIds } } },
        {
          $group: {
            _id: '$ratedBooks.bookId',
            averageRating: { $avg: '$ratedBooks.rating' },
            ratingCount: { $sum: 1 }
          }
        }
      ]);

      // Create a map for easy frontend consumption: { bookId: { averageRating, ratingCount } }
      const ratingsMap = {};

      // Initialize with zeros for all requested IDs to avoid missing keys
      bookIds.forEach(id => {
        ratingsMap[id] = { averageRating: 0, ratingCount: 0 };
      });

      // Fill with actual data
      results.forEach(item => {
        ratingsMap[item._id] = {
          averageRating: item.averageRating || 0,
          ratingCount: item.ratingCount || 0
        };
      });

      return res.json(ratingsMap);
    } catch (error) {
      console.error('Error getting bulk average ratings:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  checkEmailExists,
  resetPassword,
  generateReferralLink,
  getReferralBalance,
  getReferrals,
  deleteReferral,
  submitUrgencyRequest,
  getAllUrgencyRequests,
  updateUrgencyRequestStatus,
  requestPayment, // Re-add temporarily to avoid crash
  getUserPrintOrders,
};
