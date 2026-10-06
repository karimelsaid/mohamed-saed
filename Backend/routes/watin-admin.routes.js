const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const verifyAdmin = require('../middleware/admin.middleware');
const WatinCategory = require('../models/WatinCategory.model');
const WatinSpeaker = require('../models/WatinSpeaker.model');
const WatinLecture = require('../models/WatinLecture.model');
const WatinApp = require('../models/WatinApp.model');
const WatinAuditLog = require('../models/WatinAuditLog.model');
const WatinDailyVerse = require('../models/WatinDailyVerse.model');

// ============================================
// MIDDLEWARE: Auth + Admin on all routes
// ============================================
router.use(verifyToken);
router.use(verifyAdmin);

// ============================================
// HELPER: Audit logger
// ============================================
async function auditLog(req, action, entity, entityId, entityTitle, changes, meta) {
  try {
    await WatinAuditLog.create({
      actorId: req.user._id,
      actorName: req.user.username || req.user.email,
      action,
      entity,
      entityId,
      entityTitle,
      changes,
      meta,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
  } catch (err) {
    console.error('[Watin Admin] Audit log error:', err.message);
  }
}

// ============================================
// HELPER: Paginate query params
// ============================================
function getPagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize) || 20));
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

function getSortParam(query, allowedFields) {
  const sort = query.sort || '-updatedAt';
  const dir = sort.startsWith('-') ? -1 : 1;
  const field = sort.replace(/^-/, '');
  if (!allowedFields.includes(field)) return { updatedAt: -1 };
  return { [field]: dir };
}

// ============================================
// STATS: GET /api/admin/watin/stats
// ============================================
router.get('/stats', async (req, res) => {
  try {
    const [lectureAgg] = await WatinLecture.aggregate([{ $facet: {
      byPublish:       [{ $group: { _id: '$status', n: { $sum: 1 } } }],
      byTranscription: [{ $match: { status: { $ne: 'archived' } } }, { $group: { _id: '$transcription.status', n: { $sum: 1 } } }],
      byReview:        [{ $match: { 'transcription.status': 'completed' } }, { $group: { _id: '$transcription.reviewStatus', n: { $sum: 1 } } }],
      totals:          [{ $match: { status: { $ne: 'archived' } } }, { $group: { _id: null,
                         lectures: { $sum: 1 },
                         segments: { $sum: { $ifNull: ['$transcription.totalSegments', 0] } },
                         audioSec: { $sum: { $ifNull: ['$audio.durationSec', 0] } },
                         audioBytes: { $sum: { $ifNull: ['$audio.sizeBytes', 0] } } } }],
    } }]);

    const [speakers, categories, apps] = await Promise.all([
      WatinSpeaker.countDocuments({ status: { $ne: 'archived' } }),
      WatinCategory.countDocuments({ status: { $ne: 'archived' } }),
      WatinApp.countDocuments({ status: 'published' }),
    ]);

    // Flatten aggregation results
    const mapAgg = (arr) => {
      const result = {};
      (arr || []).forEach(item => { result[item._id || 'unknown'] = item.n; });
      return result;
    };

    const totals = lectureAgg.totals[0] || { lectures: 0, segments: 0, audioSec: 0, audioBytes: 0 };

    res.json({
      success: true,
      data: {
        lectures: { total: totals.lectures, ...mapAgg(lectureAgg.byPublish) },
        speakers,
        categories,
        apps,
        segments: totals.segments,
        transcription: mapAgg(lectureAgg.byTranscription),
        review: mapAgg(lectureAgg.byReview),
        audio: { totalSeconds: totals.audioSec, totalBytes: totals.audioBytes },
        generatedAt: new Date().toISOString(),
      }
    });
  } catch (err) {
    console.error('[Watin Admin] Stats error:', err);
    res.status(500).json({ success: false, message: 'خطأ في جلب الإحصائيات' });
  }
});

// ============================================
// ACTIVITY: GET /api/admin/watin/activity
// ============================================
router.get('/activity', async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const entries = await WatinAuditLog.find()
      .sort({ at: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, data: entries });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب سجل النشاط' });
  }
});

// ============================================
// SPEAKERS CRUD
// ============================================
const speakerSortFields = ['name.ar', 'createdAt', 'updatedAt', 'lectureCount'];

router.get('/speakers', async (req, res) => {
  try {
    const { page, pageSize, skip } = getPagination(req.query);
    const sort = getSortParam(req.query, speakerSortFields);
    const filter = {};

    if (req.query.status) filter.status = req.query.status;
    if (req.query.q) {
      const escaped = req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { 'name.ar': { $regex: escaped, $options: 'i' } },
        { 'name.en': { $regex: escaped, $options: 'i' } },
      ];
    }

    const [speakers, total] = await Promise.all([
      WatinSpeaker.find(filter).sort(sort).skip(skip).limit(pageSize).lean(),
      WatinSpeaker.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: speakers,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب المشايخ' });
  }
});

router.get('/speakers/:id', async (req, res) => {
  try {
    const speaker = await WatinSpeaker.findById(req.params.id).lean();
    if (!speaker) return res.status(404).json({ success: false, message: 'الشيخ غير موجود' });
    res.json({ success: true, data: speaker });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب بيانات الشيخ' });
  }
});

router.post('/speakers', async (req, res) => {
  try {
    const { name, title, bio, avatarUrl, status } = req.body;
    if (!name?.ar) return res.status(422).json({ success: false, message: 'الاسم بالعربية مطلوب', errors: [{ field: 'name.ar', code: 'REQUIRED' }] });

    // Auto-generate slug
    const slug = (name.en || name.ar).toLowerCase()
      .replace(/\s+/g, '-').replace(/[^\w\u0621-\u064A-]/g, '').replace(/-+/g, '-')
      || `speaker-${Date.now()}`;

    // Ensure unique slug
    const existing = await WatinSpeaker.findOne({ slug });
    const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

    const speaker = await WatinSpeaker.create({
      slug: finalSlug, name, title, bio, avatarUrl,
      status: status || 'draft',
      createdBy: req.user._id,
    });

    await auditLog(req, 'speaker.create', 'speaker', speaker._id, name.ar);

    res.status(201).json({ success: true, data: speaker });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'هذا الشيخ موجود بالفعل' });
    console.error('[Watin Admin] Create speaker error:', err);
    res.status(500).json({ success: false, message: 'خطأ في إنشاء الشيخ' });
  }
});

router.put('/speakers/:id', async (req, res) => {
  try {
    const { name, title, bio, avatarUrl, status } = req.body;
    if (!name?.ar) return res.status(422).json({ success: false, message: 'الاسم بالعربية مطلوب', errors: [{ field: 'name.ar', code: 'REQUIRED' }] });

    const speaker = await WatinSpeaker.findById(req.params.id);
    if (!speaker) return res.status(404).json({ success: false, message: 'الشيخ غير موجود' });

    const oldName = speaker.name?.ar;
    Object.assign(speaker, { name, title, bio, avatarUrl, status });
    await speaker.save();

    await auditLog(req, 'speaker.update', 'speaker', speaker._id, name.ar, { name: { from: oldName, to: name.ar } });

    res.json({ success: true, data: speaker });
  } catch (err) {
    console.error('[Watin Admin] Update speaker error:', err);
    res.status(500).json({ success: false, message: 'خطأ في تحديث بيانات الشيخ' });
  }
});

router.delete('/speakers/:id', async (req, res) => {
  try {
    const speaker = await WatinSpeaker.findById(req.params.id);
    if (!speaker) return res.status(404).json({ success: false, message: 'الشيخ غير موجود' });

    // Check if speaker has lectures
    const lectureCount = await WatinLecture.countDocuments({ speakerId: speaker._id, status: { $ne: 'archived' } });
    if (lectureCount > 0 && !req.query.reassignTo) {
      return res.status(409).json({
        success: false,
        code: 'SPEAKER_HAS_LECTURES',
        message: `هذا الشيخ مرتبط بـ ${lectureCount} محاضرة. أرسل reassignTo لنقل المحاضرات.`,
        count: lectureCount,
      });
    }

    // Reassign if requested
    if (req.query.reassignTo && lectureCount > 0) {
      await WatinLecture.updateMany(
        { speakerId: speaker._id },
        { $set: { speakerId: req.query.reassignTo } }
      );
    }

    speaker.status = 'archived';
    await speaker.save();

    await auditLog(req, 'speaker.archive', 'speaker', speaker._id, speaker.name?.ar);

    res.json({ success: true, message: 'تم أرشفة الشيخ بنجاح' });
  } catch (err) {
    console.error('[Watin Admin] Delete speaker error:', err);
    res.status(500).json({ success: false, message: 'خطأ في أرشفة الشيخ' });
  }
});

// ============================================
// CATEGORIES CRUD
// ============================================
const categorySortFields = ['name.ar', 'sortOrder', 'createdAt', 'updatedAt', 'lectureCount'];

router.get('/categories', async (req, res) => {
  try {
    const { page, pageSize, skip } = getPagination(req.query);
    const sort = getSortParam(req.query, categorySortFields);
    const filter = {};

    if (req.query.status) filter.status = req.query.status;
    if (req.query.q) {
      const escaped = req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { 'name.ar': { $regex: escaped, $options: 'i' } },
        { 'name.en': { $regex: escaped, $options: 'i' } },
      ];
    }

    const [categories, total] = await Promise.all([
      WatinCategory.find(filter).sort(sort).skip(skip).limit(pageSize).lean(),
      WatinCategory.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: categories,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب الأقسام' });
  }
});

router.get('/categories/:id', async (req, res) => {
  try {
    const category = await WatinCategory.findById(req.params.id).lean();
    if (!category) return res.status(404).json({ success: false, message: 'القسم غير موجود' });
    res.json({ success: true, data: category });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب بيانات القسم' });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const { name, description, icon, colorToken, bgColor, iconColor, sortOrder, status } = req.body;
    if (!name?.ar) return res.status(422).json({ success: false, message: 'الاسم بالعربية مطلوب', errors: [{ field: 'name.ar', code: 'REQUIRED' }] });

    // Auto-generate slug
    const slug = (name.en || name.ar).toLowerCase()
      .replace(/\s+/g, '-').replace(/[^\w\u0621-\u064A-]/g, '').replace(/-+/g, '-')
      || `category-${Date.now()}`;

    const existing = await WatinCategory.findOne({ slug });
    const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

    const category = await WatinCategory.create({
      slug: finalSlug, name, description, icon, colorToken, bgColor, iconColor,
      sortOrder: sortOrder || 0,
      status: status || 'draft',
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    await auditLog(req, 'category.create', 'category', category._id, name.ar);

    res.status(201).json({ success: true, data: category });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'هذا القسم موجود بالفعل' });
    console.error('[Watin Admin] Create category error:', err);
    res.status(500).json({ success: false, message: 'خطأ في إنشاء القسم' });
  }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const { name, description, icon, colorToken, bgColor, iconColor, sortOrder, status } = req.body;
    if (!name?.ar) return res.status(422).json({ success: false, message: 'الاسم بالعربية مطلوب', errors: [{ field: 'name.ar', code: 'REQUIRED' }] });

    const category = await WatinCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'القسم غير موجود' });

    const oldName = category.name?.ar;
    Object.assign(category, { name, description, icon, colorToken, bgColor, iconColor, sortOrder, status, updatedBy: req.user._id });
    await category.save();

    await auditLog(req, 'category.update', 'category', category._id, name.ar, { name: { from: oldName, to: name.ar } });

    res.json({ success: true, data: category });
  } catch (err) {
    console.error('[Watin Admin] Update category error:', err);
    res.status(500).json({ success: false, message: 'خطأ في تحديث القسم' });
  }
});

router.post('/categories/reorder', async (req, res) => {
  try {
    const items = req.body; // [{ id, sortOrder }]
    if (!Array.isArray(items)) return res.status(422).json({ success: false, message: 'يجب إرسال مصفوفة' });

    const ops = items.map(item => ({
      updateOne: { filter: { _id: item.id }, update: { $set: { sortOrder: item.sortOrder } } }
    }));
    await WatinCategory.bulkWrite(ops);

    res.json({ success: true, message: 'تم إعادة الترتيب بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في إعادة ترتيب الأقسام' });
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    const category = await WatinCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'القسم غير موجود' });

    const lectureCount = await WatinLecture.countDocuments({ categoryIds: category._id, status: { $ne: 'archived' } });
    if (lectureCount > 0 && !req.query.reassignTo) {
      return res.status(409).json({
        success: false,
        code: 'CATEGORY_HAS_LECTURES',
        message: `هذا القسم مرتبط بـ ${lectureCount} محاضرة. أرسل reassignTo لنقل المحاضرات.`,
        count: lectureCount,
      });
    }

    if (req.query.reassignTo && lectureCount > 0) {
      await WatinLecture.updateMany(
        { categoryIds: category._id },
        { $pull: { categoryIds: category._id }, $addToSet: { categoryIds: req.query.reassignTo } }
      );
    }

    category.status = 'archived';
    await category.save();

    await auditLog(req, 'category.archive', 'category', category._id, category.name?.ar);

    res.json({ success: true, message: 'تم أرشفة القسم بنجاح' });
  } catch (err) {
    console.error('[Watin Admin] Delete category error:', err);
    res.status(500).json({ success: false, message: 'خطأ في أرشفة القسم' });
  }
});

// ============================================
// LECTURES CRUD
// ============================================
const lectureSortFields = ['title', 'createdAt', 'updatedAt', 'publishedAt', 'audio.durationSec'];

router.get('/lectures', async (req, res) => {
  try {
    const { page, pageSize, skip } = getPagination(req.query);
    const sort = getSortParam(req.query, lectureSortFields);
    const filter = {};

    if (req.query.status) filter.status = req.query.status;
    if (req.query.transcriptionStatus) filter['transcription.status'] = req.query.transcriptionStatus;
    if (req.query.reviewStatus) filter['transcription.reviewStatus'] = req.query.reviewStatus;
    if (req.query.categoryId) filter.categoryIds = req.query.categoryId;
    if (req.query.speakerId) filter.speakerId = req.query.speakerId;
    if (req.query.hasAudio === 'true') filter['audio.url'] = { $exists: true, $ne: null };
    if (req.query.hasAudio === 'false') filter['audio.url'] = { $in: [null, undefined] };
    if (req.query.q) {
      const escaped = req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.title = { $regex: escaped, $options: 'i' };
    }

    const [lectures, total] = await Promise.all([
      WatinLecture.find(filter)
        .sort(sort).skip(skip).limit(pageSize)
        .populate('speakerId', 'name title')
        .populate('primaryCategoryId', 'name slug')
        .select('-transcription.results')  // Don't send huge transcript data in list
        .lean(),
      WatinLecture.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: lectures,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    });
  } catch (err) {
    console.error('[Watin Admin] Lectures list error:', err);
    res.status(500).json({ success: false, message: 'خطأ في جلب المحاضرات' });
  }
});

router.post('/lectures/import-islamhouse', async (req, res) => {
  try {
    const { itemId } = req.body;
    if (!itemId) return res.status(400).json({ success: false, message: 'مطلوب معرف المادة (itemId)' });

    // Fetch from IslamHouse API
    const fetch = require('node-fetch');
    // URL Format: https://api.islamhouse.com/v3/paV29H2TZI6n55/main/get-item/[ITEM_ID]/ar/json
    const response = await fetch(`https://api.islamhouse.com/v3/paV29H2TZI6n55/main/get-item/${itemId}/ar/json`);
    const data = await response.json();

    if (!data || !data.attachments || data.attachments.length === 0) {
      return res.status(400).json({ success: false, message: 'لم يتم العثور على ملفات صوتية لهذه المادة في IslamHouse' });
    }

    const audioUrl = data.attachments[0].url;
    
    // Create new Lecture
    const lecture = new WatinLecture({
      title: data.title,
      description: data.description,
      slug: `ih-${itemId}-${Date.now()}`,
      status: 'draft',
      audio: {
        url: audioUrl,
        originalFilename: audioUrl.split('/').pop(),
        mimeType: 'audio/mpeg'
      },
      source: {
        origin: 'islamhouse',
        externalId: itemId.toString(),
        sourceUrl: `https://islamhouse.com/ar/audios/${itemId}/`,
        rightsStatus: 'api_licensed',
        sourceName: 'IslamHouse.com'
      },
      createdBy: req.user._id
    });

    await lecture.save();
    await auditLog(req, 'lecture.import', 'lecture', lecture._id, lecture.title, { source: 'islamhouse', itemId });

    res.json({ success: true, message: 'تم استيراد المادة بنجاح عبر API بدون تحميل الملف', data: lecture });
  } catch (err) {
    console.error('[Watin Admin] Import IslamHouse error:', err);
    res.status(500).json({ success: false, message: 'خطأ أثناء استيراد المادة من IslamHouse' });
  }
});

router.get('/lectures/:id', async (req, res) => {
  try {
    const lecture = await WatinLecture.findById(req.params.id)
      .populate('speakerId', 'name title bio avatarUrl')
      .populate('categoryIds', 'name slug')
      .populate('primaryCategoryId', 'name slug')
      .lean();
    if (!lecture) return res.status(404).json({ success: false, message: 'المحاضرة غير موجودة' });
    res.json({ success: true, data: lecture });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب بيانات المحاضرة' });
  }
});

router.post('/lectures', async (req, res) => {
  try {
    const { title, description, speakerId, categoryIds, primaryCategoryId, tags, series } = req.body;
    if (!title) return res.status(422).json({ success: false, message: 'عنوان المحاضرة مطلوب', errors: [{ field: 'title', code: 'REQUIRED' }] });

    const slug = title.toLowerCase()
      .replace(/\s+/g, '-').replace(/[^\w\u0621-\u064A-]/g, '').replace(/-+/g, '-')
      || `lecture-${Date.now()}`;

    const existing = await WatinLecture.findOne({ slug });
    const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

    const lecture = await WatinLecture.create({
      slug: finalSlug, title, description,
      speakerId, categoryIds, primaryCategoryId, tags, series,
      status: 'draft',
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    await auditLog(req, 'lecture.create', 'lecture', lecture._id, title);

    res.status(201).json({ success: true, data: lecture });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'محاضرة بهذا العنوان موجودة بالفعل' });
    console.error('[Watin Admin] Create lecture error:', err);
    res.status(500).json({ success: false, message: 'خطأ في إنشاء المحاضرة' });
  }
});

router.put('/lectures/:id', async (req, res) => {
  try {
    const { title, description, speakerId, categoryIds, primaryCategoryId, tags, series } = req.body;
    if (!title) return res.status(422).json({ success: false, message: 'عنوان المحاضرة مطلوب', errors: [{ field: 'title', code: 'REQUIRED' }] });

    const lecture = await WatinLecture.findById(req.params.id);
    if (!lecture) return res.status(404).json({ success: false, message: 'المحاضرة غير موجودة' });

    const oldTitle = lecture.title;
    Object.assign(lecture, { title, description, speakerId, categoryIds, primaryCategoryId, tags, series, updatedBy: req.user._id });
    await lecture.save();

    await auditLog(req, 'lecture.update', 'lecture', lecture._id, title, { title: { from: oldTitle, to: title } });

    res.json({ success: true, data: lecture });
  } catch (err) {
    console.error('[Watin Admin] Update lecture error:', err);
    res.status(500).json({ success: false, message: 'خطأ في تحديث المحاضرة' });
  }
});

// PATCH: Partial update (used by Review Editor, transcription status updates, etc.)
router.patch('/lectures/:id', async (req, res) => {
  try {
    const lecture = await WatinLecture.findById(req.params.id);
    if (!lecture) return res.status(404).json({ success: false, message: 'المحاضرة غير موجودة' });

    // Handle dot-notation keys for nested updates (e.g., 'transcription.results')
    const body = req.body;
    for (const key of Object.keys(body)) {
      const parts = key.split('.');
      if (parts.length === 2) {
        // e.g., transcription.results, transcription.reviewStatus
        if (!lecture[parts[0]]) lecture[parts[0]] = {};
        lecture[parts[0]][parts[1]] = body[key];
      } else {
        lecture[key] = body[key];
      }
    }

    // Track who updated and when for review
    if (body['transcription.reviewStatus'] === 'reviewed') {
      lecture.transcription.reviewedBy = req.user._id;
      lecture.transcription.reviewedAt = new Date();
    }

    lecture.updatedBy = req.user._id;
    await lecture.save();

    await auditLog(req, 'lecture.patch', 'lecture', lecture._id, lecture.title, body);

    res.json({ success: true, data: lecture });
  } catch (err) {
    console.error('[Watin Admin] Patch lecture error:', err);
    res.status(500).json({ success: false, message: 'خطأ في تحديث المحاضرة' });
  }
});

router.post('/lectures/:id/publish', async (req, res) => {
  try {
    const lecture = await WatinLecture.findById(req.params.id);
    if (!lecture) return res.status(404).json({ success: false, message: 'المحاضرة غير موجودة' });

    lecture.status = 'published';
    lecture.publishedAt = new Date();
    await lecture.save();

    // Update speaker and category lecture counts
    if (lecture.speakerId) {
      const count = await WatinLecture.countDocuments({ speakerId: lecture.speakerId, status: 'published' });
      await WatinSpeaker.updateOne({ _id: lecture.speakerId }, { $set: { lectureCount: count } });
    }
    if (lecture.categoryIds?.length) {
      for (const catId of lecture.categoryIds) {
        const count = await WatinLecture.countDocuments({ categoryIds: catId, status: 'published' });
        await WatinCategory.updateOne({ _id: catId }, { $set: { lectureCount: count } });
      }
    }

    await auditLog(req, 'lecture.publish', 'lecture', lecture._id, lecture.title);

    res.json({ success: true, data: lecture });
  } catch (err) {
    console.error('[Watin Admin] Publish lecture error:', err);
    res.status(500).json({ success: false, message: 'خطأ في نشر المحاضرة' });
  }
});

router.post('/lectures/:id/unpublish', async (req, res) => {
  try {
    const lecture = await WatinLecture.findById(req.params.id);
    if (!lecture) return res.status(404).json({ success: false, message: 'المحاضرة غير موجودة' });

    lecture.status = 'draft';
    await lecture.save();

    // Recalculate counts
    if (lecture.speakerId) {
      const count = await WatinLecture.countDocuments({ speakerId: lecture.speakerId, status: 'published' });
      await WatinSpeaker.updateOne({ _id: lecture.speakerId }, { $set: { lectureCount: count } });
    }
    if (lecture.categoryIds?.length) {
      for (const catId of lecture.categoryIds) {
        const count = await WatinLecture.countDocuments({ categoryIds: catId, status: 'published' });
        await WatinCategory.updateOne({ _id: catId }, { $set: { lectureCount: count } });
      }
    }

    await auditLog(req, 'lecture.unpublish', 'lecture', lecture._id, lecture.title);

    res.json({ success: true, data: lecture });
  } catch (err) {
    console.error('[Watin Admin] Unpublish lecture error:', err);
    res.status(500).json({ success: false, message: 'خطأ في إلغاء نشر المحاضرة' });
  }
});

router.delete('/lectures/:id', async (req, res) => {
  try {
    const lecture = await WatinLecture.findById(req.params.id);
    if (!lecture) return res.status(404).json({ success: false, message: 'المحاضرة غير موجودة' });

    lecture.status = 'archived';
    await lecture.save();

    await auditLog(req, 'lecture.archive', 'lecture', lecture._id, lecture.title);

    res.json({ success: true, message: 'تم أرشفة المحاضرة بنجاح' });
  } catch (err) {
    console.error('[Watin Admin] Archive lecture error:', err);
    res.status(500).json({ success: false, message: 'خطأ في أرشفة المحاضرة' });
  }
});

// ============================================
// APPS CRUD
// ============================================

router.get('/apps', async (req, res) => {
  try {
    const { page, pageSize, skip } = getPagination(req.query);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const [apps, total] = await Promise.all([
      WatinApp.find(filter).sort({ sortOrder: 1 }).skip(skip).limit(pageSize).lean(),
      WatinApp.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: apps,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب التطبيقات' });
  }
});

router.get('/apps/:id', async (req, res) => {
  try {
    const app = await WatinApp.findById(req.params.id).lean();
    if (!app) return res.status(404).json({ success: false, message: 'التطبيق غير موجود' });
    res.json({ success: true, data: app });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب بيانات التطبيق' });
  }
});

router.post('/apps', async (req, res) => {
  try {
    const { key, name, tagline, icon, links, openMode, visibility, sortOrder, status } = req.body;
    if (!key) return res.status(422).json({ success: false, message: 'مفتاح التطبيق مطلوب', errors: [{ field: 'key', code: 'REQUIRED' }] });
    if (!name?.ar) return res.status(422).json({ success: false, message: 'اسم التطبيق بالعربية مطلوب', errors: [{ field: 'name.ar', code: 'REQUIRED' }] });

    const app = await WatinApp.create({
      key, name, tagline, icon, links, openMode, visibility,
      sortOrder: sortOrder || 0,
      status: status || 'draft',
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    await auditLog(req, 'app.create', 'app', app._id, name.ar);

    res.status(201).json({ success: true, data: app });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'تطبيق بهذا المفتاح موجود بالفعل' });
    if (err.name === 'ValidationError') {
      const errors = Object.keys(err.errors).map(field => ({ field, message: err.errors[field].message }));
      return res.status(422).json({ success: false, message: 'بيانات غير صالحة', errors });
    }
    console.error('[Watin Admin] Create app error:', err);
    res.status(500).json({ success: false, message: 'خطأ في إنشاء التطبيق' });
  }
});

router.put('/apps/:id', async (req, res) => {
  try {
    const { name, tagline, icon, links, openMode, visibility, sortOrder, status } = req.body;
    if (!name?.ar) return res.status(422).json({ success: false, message: 'اسم التطبيق بالعربية مطلوب' });

    const app = await WatinApp.findById(req.params.id);
    if (!app) return res.status(404).json({ success: false, message: 'التطبيق غير موجود' });

    // key is immutable, don't assign it
    Object.assign(app, { name, tagline, icon, links, openMode, visibility, sortOrder, status, updatedBy: req.user._id });
    await app.save();

    await auditLog(req, 'app.update', 'app', app._id, name.ar);

    res.json({ success: true, data: app });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const errors = Object.keys(err.errors).map(field => ({ field, message: err.errors[field].message }));
      return res.status(422).json({ success: false, message: 'بيانات غير صالحة', errors });
    }
    console.error('[Watin Admin] Update app error:', err);
    res.status(500).json({ success: false, message: 'خطأ في تحديث التطبيق' });
  }
});

router.patch('/apps/:id', async (req, res) => {
  try {
    const app = await WatinApp.findById(req.params.id);
    if (!app) return res.status(404).json({ success: false, message: 'التطبيق غير موجود' });

    // Partial update (status toggle, visibility, etc.)
    const allowedFields = ['status', 'visibility', 'sortOrder'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    updates.updatedBy = req.user._id;

    Object.assign(app, updates);
    await app.save();

    await auditLog(req, 'app.toggle', 'app', app._id, app.name?.ar, updates);

    res.json({ success: true, data: app });
  } catch (err) {
    console.error('[Watin Admin] Patch app error:', err);
    res.status(500).json({ success: false, message: 'خطأ في تحديث التطبيق' });
  }
});

router.post('/apps/reorder', async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items)) return res.status(422).json({ success: false, message: 'يجب إرسال مصفوفة' });

    const ops = items.map(item => ({
      updateOne: { filter: { _id: item.id }, update: { $set: { sortOrder: item.sortOrder } } }
    }));
    await WatinApp.bulkWrite(ops);

    res.json({ success: true, message: 'تم إعادة ترتيب التطبيقات بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في إعادة ترتيب التطبيقات' });
  }
});

router.delete('/apps/:id', async (req, res) => {
  try {
    const app = await WatinApp.findById(req.params.id);
    if (!app) return res.status(404).json({ success: false, message: 'التطبيق غير موجود' });

    app.status = 'archived';
    await app.save();

    await auditLog(req, 'app.archive', 'app', app._id, app.name?.ar);

    res.json({ success: true, message: 'تم أرشفة التطبيق بنجاح' });
  } catch (err) {
    console.error('[Watin Admin] Archive app error:', err);
    res.status(500).json({ success: false, message: 'خطأ في أرشفة التطبيق' });
  }
});

// ============================================
// DAILY VERSES CRUD
// ============================================

router.get('/daily-verses', async (req, res) => {
  try {
    const { page, pageSize, skip } = getPagination(req.query);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const [verses, total] = await Promise.all([
      WatinDailyVerse.find(filter).sort({ date: -1 }).skip(skip).limit(pageSize).lean(),
      WatinDailyVerse.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: verses,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب الآيات اليومية' });
  }
});

router.post('/daily-verses', async (req, res) => {
  try {
    const { date, text, surah, ayah, tafseer, isEvergreen, status } = req.body;
    if (!text) return res.status(422).json({ success: false, message: 'نص الآية مطلوب' });

    const verse = await WatinDailyVerse.create({
      date, text, surah, ayah, tafseer,
      isEvergreen: isEvergreen || false,
      status: status || 'published',
      createdBy: req.user._id,
    });

    await auditLog(req, 'daily_verse.create', 'daily_verse', verse._id, text.substring(0, 50));

    res.status(201).json({ success: true, data: verse });
  } catch (err) {
    console.error('[Watin Admin] Create daily verse error:', err);
    res.status(500).json({ success: false, message: 'خطأ في إنشاء الآية اليومية' });
  }
});

router.put('/daily-verses/:id', async (req, res) => {
  try {
    const verse = await WatinDailyVerse.findById(req.params.id);
    if (!verse) return res.status(404).json({ success: false, message: 'الآية غير موجودة' });

    const { date, text, surah, ayah, tafseer, isEvergreen, status } = req.body;
    Object.assign(verse, { date, text, surah, ayah, tafseer, isEvergreen, status });
    await verse.save();

    await auditLog(req, 'daily_verse.update', 'daily_verse', verse._id, (text || '').substring(0, 50));

    res.json({ success: true, data: verse });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في تحديث الآية اليومية' });
  }
});

router.delete('/daily-verses/:id', async (req, res) => {
  try {
    const verse = await WatinDailyVerse.findById(req.params.id);
    if (!verse) return res.status(404).json({ success: false, message: 'الآية غير موجودة' });

    verse.status = 'archived';
    await verse.save();

    await auditLog(req, 'daily_verse.archive', 'daily_verse', verse._id);

    res.json({ success: true, message: 'تم أرشفة الآية بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في أرشفة الآية' });
  }
});

// ============================================
// AUDIT LOG: GET /api/admin/watin/audit-log
// ============================================
router.get('/audit-log', async (req, res) => {
  try {
    const { page, pageSize, skip } = getPagination(req.query);
    const filter = {};
    if (req.query.entity) filter.entity = req.query.entity;
    if (req.query.action) filter.action = req.query.action;

    const [entries, total] = await Promise.all([
      WatinAuditLog.find(filter).sort({ at: -1 }).skip(skip).limit(pageSize).lean(),
      WatinAuditLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: entries,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب سجل النشاطات' });
  }
});

module.exports = router;
