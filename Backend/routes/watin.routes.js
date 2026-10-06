const express = require('express');
const router = express.Router();
const WatinCategory = require('../models/WatinCategory.model');
const WatinSpeaker = require('../models/WatinSpeaker.model');
const WatinLecture = require('../models/WatinLecture.model');
const WatinDailyVerse = require('../models/WatinDailyVerse.model');

// ============================================
// PUBLIC APIs (for Watin App)
// ============================================

// GET /api/watin/home - Home screen data
router.get('/home', async (req, res) => {
  try {
    // Get daily verse
    const today = new Date().toISOString().split('T')[0];
    let dailyVerse = await WatinDailyVerse.findOne({ date: today, status: 'published' });
    if (!dailyVerse) {
      // Fallback to evergreen pool
      const pool = await WatinDailyVerse.find({ isEvergreen: true, status: 'published' });
      if (pool.length > 0) {
        const hash = today.split('-').reduce((a, b) => a + parseInt(b), 0);
        dailyVerse = pool[hash % pool.length];
      }
    }

    // Get published categories
    const categories = await WatinCategory.find({ status: 'published' })
      .sort({ sortOrder: 1 })
      .lean();

    // Get latest lectures
    const latestLectures = await WatinLecture.find({ status: 'published' })
      .sort({ publishedAt: -1 })
      .limit(5)
      .populate('speakerId', 'name title')
      .populate('primaryCategoryId', 'name slug')
      .lean();

    res.json({
      success: true,
      data: {
        dailyVerse: dailyVerse || null,
        categories: categories.map(c => ({
          _id: c._id,
          slug: c.slug,
          name: c.name.ar,
          icon: c.icon,
          bgColor: c.bgColor,
          iconColor: c.iconColor,
          lectureCount: c.lectureCount
        })),
        latestLectures: latestLectures.map(formatLectureForPublic)
      }
    });
  } catch (err) {
    console.error('[Watin API] Home error:', err);
    res.status(500).json({ success: false, message: 'خطأ في جلب بيانات الصفحة الرئيسية' });
  }
});

// GET /api/watin/categories - All published categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await WatinCategory.find({ status: 'published' })
      .sort({ sortOrder: 1 })
      .lean();

    res.json({
      success: true,
      data: categories.map(c => ({
        _id: c._id,
        slug: c.slug,
        name: c.name.ar,
        description: c.description?.ar || '',
        icon: c.icon,
        bgColor: c.bgColor,
        iconColor: c.iconColor,
        lectureCount: c.lectureCount
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب الأقسام' });
  }
});

// GET /api/watin/lectures - Lectures list with filters
router.get('/lectures', async (req, res) => {
  try {
    const { category, speaker, q, status: transStatus, page = 1, limit = 20 } = req.query;
    const filter = { status: 'published' };

    if (category) filter.categoryIds = category;
    if (speaker) filter.speakerId = speaker;
    if (transStatus === 'transcribed') filter['transcription.status'] = 'completed';
    if (transStatus === 'processing') filter['transcription.status'] = 'processing';
    if (transStatus === 'none') filter['transcription.status'] = 'not_requested';

    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [lectures, total] = await Promise.all([
      WatinLecture.find(filter)
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('speakerId', 'name title')
        .populate('primaryCategoryId', 'name slug')
        .lean(),
      WatinLecture.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: lectures.map(formatLectureForPublic),
      meta: { total, page: parseInt(page), limit: parseInt(limit), hasMore: skip + lectures.length < total }
    });
  } catch (err) {
    console.error('[Watin API] Lectures error:', err);
    res.status(500).json({ success: false, message: 'خطأ في جلب المحاضرات' });
  }
});

// GET /api/watin/lectures/:slug - Lecture detail
router.get('/lectures/:slug', async (req, res) => {
  try {
    const lecture = await WatinLecture.findOne({ slug: req.params.slug, status: 'published' })
      .populate('speakerId', 'name title bio')
      .populate('categoryIds', 'name slug')
      .lean();

    if (!lecture) return res.status(404).json({ success: false, message: 'المحاضرة غير موجودة' });

    res.json({ success: true, data: formatLectureDetail(lecture) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب المحاضرة' });
  }
});

// GET /api/watin/daily-verse - Today's verse
router.get('/daily-verse', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    let verse = await WatinDailyVerse.findOne({ date: today, status: 'published' });
    if (!verse) {
      const pool = await WatinDailyVerse.find({ isEvergreen: true, status: 'published' });
      if (pool.length > 0) {
        const hash = today.split('-').reduce((a, b) => a + parseInt(b), 0);
        verse = pool[hash % pool.length];
      }
    }
    res.json({ success: true, data: verse || null });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب آية اليوم' });
  }
});

// GET /api/watin/speakers - Published speakers
router.get('/speakers', async (req, res) => {
  try {
    const speakers = await WatinSpeaker.find({ status: 'published' })
      .sort({ 'name.ar': 1 })
      .lean();
    res.json({
      success: true,
      data: speakers.map(s => ({
        _id: s._id,
        slug: s.slug,
        name: s.name.ar,
        title: s.title,
        lectureCount: s.lectureCount
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب المشايخ' });
  }
});


// ============================================
// PUBLIC: GET /api/watin/apps
// ============================================
router.get('/apps', async (req, res) => {
  try {
    const WatinApp = require('../models/WatinApp.model');
    const platform = req.query.platform || 'web'; // web, android, ios
    
    const apps = await WatinApp.find({ 
      status: 'published',
      'visibility.platforms': platform 
    }).sort({ sortOrder: 1 }).lean();

    res.json({
      success: true,
      data: apps
    });
  } catch (err) {
    console.error('[Watin API] Apps error:', err);
    res.status(500).json({ success: false, message: 'خطأ في جلب التطبيقات' });
  }
});


// ============================================
// HELPERS
// ============================================

function formatLectureForPublic(lecture) {
  const speaker = lecture.speakerId;
  const category = lecture.primaryCategoryId;
  return {
    _id: lecture._id,
    slug: lecture.slug,
    title: lecture.title,
    speaker: speaker ? { _id: speaker._id, name: speaker.name?.ar, title: speaker.title } : null,
    category: category ? { _id: category._id, slug: category.slug, name: category.name?.ar } : null,
    durationSec: lecture.audio?.durationSec || 0,
    duration: formatDuration(lecture.audio?.durationSec || 0),
    hasTranscript: lecture.transcription?.status === 'completed',
    transcriptionStatus: lecture.transcription?.status || 'not_requested',
    publishedAt: lecture.publishedAt,
    tags: lecture.tags || []
  };
}

function formatLectureDetail(lecture) {
  return {
    ...formatLectureForPublic(lecture),
    description: lecture.description,
    audioUrl: lecture.audio?.url,
    categories: (lecture.categoryIds || []).map(c => ({ _id: c._id, slug: c.slug, name: c.name?.ar })),
    series: lecture.series,
    transcript: lecture.transcription?.status === 'completed' ? {
      totalSegments: lecture.transcription.totalSegments,
      quranSegments: lecture.transcription.quranSegments,
      results: lecture.transcription.results
    } : null,
    stats: lecture.stats
  };
}

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ============================================
// PUBLIC: GET /api/watin/islamhouse/browse
// Browse IslamHouse audios via their API (proxy to avoid CORS)
// ============================================
router.get('/islamhouse/browse', async (req, res) => {
  try {
    const axios = require('axios');
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 25, 50);
    const lang = req.query.lang || 'ar';

    const apiUrl = `https://api.islamhouse.com/v3/paV29H2TZI6n55/main/audios/${lang}/${lang}/${page}/${limit}/json`;
    const response = await axios.get(apiUrl, { headers: { 'Accept-Encoding': 'gzip,deflate' }, timeout: 15000 });
    const data = response.data;

    if (!data || !data.data) {
      return res.json({ success: true, data: [], meta: { total: 0, page, hasMore: false } });
    }

    const lectures = data.data.map(item => ({
      externalId: item.id || item.source_id,
      title: item.title,
      description: item.description,
      speaker: (item.prepared_by || []).find(p => p.type === 'author')?.title || '',
      sourceName: (item.prepared_by || []).find(p => p.type === 'source')?.title || '',
      audioUrl: item.attachments?.[0]?.url || '',
      audioSize: item.attachments?.[0]?.size || '',
      audioFormat: item.attachments?.[0]?.extension_type || '',
      sourceUrl: `https://islamhouse.com/ar/audios/${item.id || item.source_id}/`,
      apiUrl: item.api_url,
      numAttachments: item.num_attachments,
      origin: 'islamhouse'
    }));

    res.json({
      success: true,
      data: lectures,
      meta: {
        total: data.links?.total_items || 0,
        page,
        totalPages: data.links?.pages_number || 1,
        hasMore: page < (data.links?.pages_number || 1)
      }
    });
  } catch (err) {
    console.error('[Watin API] IslamHouse browse error:', err);
    res.status(500).json({ success: false, message: 'خطأ في جلب الدروس من IslamHouse' });
  }
});

// ============================================
// PUBLIC: GET /api/watin/islamhouse/search
// Search IslamHouse by keyword
// ============================================
router.get('/islamhouse/search', async (req, res) => {
  try {
    const axios = require('axios');
    const q = req.query.q || '';
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 25, 50);

    if (!q) return res.json({ success: true, data: [], meta: { total: 0 } });

    const apiUrl = `https://api.islamhouse.com/v3/paV29H2TZI6n55/main/audios/ar/ar/${page}/${limit}/json?search=${encodeURIComponent(q)}`;
    const response = await axios.get(apiUrl, { headers: { 'Accept-Encoding': 'gzip,deflate' }, timeout: 15000 });
    const data = response.data;

    if (!data || !data.data) {
      return res.json({ success: true, data: [], meta: { total: 0, page, hasMore: false } });
    }

    const lectures = data.data.map(item => ({
      externalId: item.id || item.source_id,
      title: item.title,
      description: item.description,
      speaker: (item.prepared_by || []).find(p => p.type === 'author')?.title || '',
      sourceName: (item.prepared_by || []).find(p => p.type === 'source')?.title || '',
      audioUrl: item.attachments?.[0]?.url || '',
      audioSize: item.attachments?.[0]?.size || '',
      audioFormat: item.attachments?.[0]?.extension_type || '',
      sourceUrl: `https://islamhouse.com/ar/audios/${item.id || item.source_id}/`,
      origin: 'islamhouse'
    }));

    res.json({
      success: true,
      data: lectures,
      meta: {
        total: data.links?.total_items || 0,
        page,
        totalPages: data.links?.pages_number || 1,
        hasMore: page < (data.links?.pages_number || 1)
      }
    });
  } catch (err) {
    console.error('[Watin API] IslamHouse search error:', err);
    res.status(500).json({ success: false, message: 'خطأ في البحث في IslamHouse' });
  }
});

module.exports = router;
