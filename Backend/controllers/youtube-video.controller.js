const YouTubeVideo = require('../models/YouTubeVideo.model');
const AutomationSetting = require('../models/AutomationSetting.model');
const axios = require('axios');

/**
 * Get YouTube video statistics
 */
exports.getStats = async (req, res) => {
  try {
    const [total, published, scheduled, processing, failed, draft] = await Promise.all([
      YouTubeVideo.countDocuments(),
      YouTubeVideo.countDocuments({ status: 'published' }),
      YouTubeVideo.countDocuments({ status: 'scheduled' }),
      YouTubeVideo.countDocuments({ status: { $in: ['processing', 'uploading'] } }),
      YouTubeVideo.countDocuments({ status: 'failed' }),
      YouTubeVideo.countDocuments({ status: 'draft' })
    ]);

    res.json({
      success: true,
      stats: { total, published, scheduled, processing, failed, draft }
    });
  } catch (error) {
    console.error('[YouTube] Error fetching stats:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في جلب الإحصائيات' });
  }
};

/**
 * Get all YouTube videos with pagination
 */
exports.getVideos = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;
    const skip = (page - 1) * limit;

    const filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }

    const [videos, total] = await Promise.all([
      YouTubeVideo.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      YouTubeVideo.countDocuments(filter)
    ]);

    res.json({
      success: true,
      videos,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[YouTube] Error fetching videos:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في جلب الفيديوهات' });
  }
};

/**
 * Get a single YouTube video
 */
exports.getVideo = async (req, res) => {
  try {
    const video = await YouTubeVideo.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ success: false, message: 'الفيديو غير موجود' });
    }
    res.json({ success: true, video });
  } catch (error) {
    console.error('[YouTube] Error fetching video:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في جلب الفيديو' });
  }
};

/**
 * Create a new YouTube video entry
 */
exports.createVideo = async (req, res) => {
  try {
    const { title, description, contentType, sourceContent, tags, category, privacy, scheduledAt } = req.body;

    if (!title || !contentType || !sourceContent) {
      return res.status(400).json({ success: false, message: 'العنوان ونوع المحتوى والمحتوى المصدري مطلوبين' });
    }

    const video = new YouTubeVideo({
      title,
      description: description || '',
      contentType,
      sourceContent,
      tags: tags || [],
      category: category || 'Education',
      privacy: privacy || 'public',
      scheduledAt: scheduledAt || null,
      status: scheduledAt ? 'scheduled' : 'draft'
    });

    await video.save();

    res.status(201).json({ success: true, video, message: 'تم إنشاء الفيديو بنجاح' });
  } catch (error) {
    console.error('[YouTube] Error creating video:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في إنشاء الفيديو' });
  }
};

/**
 * Update a YouTube video
 */
exports.updateVideo = async (req, res) => {
  try {
    const { title, description, contentType, sourceContent, tags, category, privacy, scheduledAt, status } = req.body;

    const video = await YouTubeVideo.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ success: false, message: 'الفيديو غير موجود' });
    }

    // Only allow editing if not currently processing
    if (['processing', 'uploading'].includes(video.status)) {
      return res.status(400).json({ success: false, message: 'لا يمكن تعديل الفيديو أثناء المعالجة' });
    }

    if (title) video.title = title;
    if (description !== undefined) video.description = description;
    if (contentType) video.contentType = contentType;
    if (sourceContent) video.sourceContent = sourceContent;
    if (tags) video.tags = tags;
    if (category) video.category = category;
    if (privacy) video.privacy = privacy;
    if (scheduledAt !== undefined) video.scheduledAt = scheduledAt;
    if (status) video.status = status;

    await video.save();

    res.json({ success: true, video, message: 'تم تحديث الفيديو بنجاح' });
  } catch (error) {
    console.error('[YouTube] Error updating video:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في تحديث الفيديو' });
  }
};

/**
 * Delete a YouTube video
 */
exports.deleteVideo = async (req, res) => {
  try {
    const video = await YouTubeVideo.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ success: false, message: 'الفيديو غير موجود' });
    }

    // Don't delete while processing
    if (['processing', 'uploading'].includes(video.status)) {
      return res.status(400).json({ success: false, message: 'لا يمكن حذف الفيديو أثناء المعالجة' });
    }

    await YouTubeVideo.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'تم حذف الفيديو بنجاح' });
  } catch (error) {
    console.error('[YouTube] Error deleting video:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في حذف الفيديو' });
  }
};

/**
 * Publish a video immediately via n8n workflow
 */
exports.publishNow = async (req, res) => {
  try {
    const video = await YouTubeVideo.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ success: false, message: 'الفيديو غير موجود' });
    }

    if (video.status === 'published') {
      return res.status(400).json({ success: false, message: 'الفيديو منشور بالفعل' });
    }

    // Update status to processing
    video.status = 'processing';
    video.errorMessage = null;
    await video.save();

    // Trigger n8n workflow
    try {
      const settings = await AutomationSetting.getInstance();
      const n8nBaseUrl = settings.n8nConfig?.apiUrl || process.env.N8N_API_URL || 'https://n8n.knoozbook.com';
      const webhookUrl = `${n8nBaseUrl}/webhook/youtube-video-create`;

      await axios.post(webhookUrl, {
        videoId: video._id.toString(),
        title: video.title,
        description: video.description,
        contentType: video.contentType,
        sourceContent: video.sourceContent,
        tags: video.tags,
        category: video.category,
        privacy: video.privacy,
        action: 'publish_now',
        callbackUrl: `${process.env.BACKEND_URL || 'https://knoozbook.com'}/api/youtube/videos/${video._id}/callback`
      }, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      });

      res.json({ success: true, video, message: 'تم تفعيل عملية النشر' });
    } catch (n8nError) {
      console.error('[YouTube] n8n webhook error:', n8nError.message);
      video.status = 'failed';
      video.errorMessage = `فشل الاتصال بـ n8n: ${n8nError.message}`;
      await video.save();
      res.status(500).json({ success: false, message: 'فشل الاتصال بـ n8n workflow', video });
    }
  } catch (error) {
    console.error('[YouTube] Error publishing video:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في نشر الفيديو' });
  }
};

/**
 * Schedule a video for future publishing
 */
exports.scheduleVideo = async (req, res) => {
  try {
    const { scheduledAt } = req.body;
    if (!scheduledAt) {
      return res.status(400).json({ success: false, message: 'تاريخ الجدولة مطلوب' });
    }

    const scheduleDate = new Date(scheduledAt);
    if (scheduleDate <= new Date()) {
      return res.status(400).json({ success: false, message: 'تاريخ الجدولة يجب أن يكون في المستقبل' });
    }

    const video = await YouTubeVideo.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ success: false, message: 'الفيديو غير موجود' });
    }

    if (video.status === 'published') {
      return res.status(400).json({ success: false, message: 'الفيديو منشور بالفعل' });
    }

    video.scheduledAt = scheduleDate;
    video.status = 'scheduled';
    video.errorMessage = null;
    await video.save();

    res.json({ success: true, video, message: `تم جدولة الفيديو للنشر في ${scheduleDate.toLocaleString('ar-EG')}` });
  } catch (error) {
    console.error('[YouTube] Error scheduling video:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في جدولة الفيديو' });
  }
};

/**
 * Trigger n8n workflow manually
 */
exports.triggerWorkflow = async (req, res) => {
  try {
    const { videoId, action } = req.body;

    let video = null;
    if (videoId) {
      video = await YouTubeVideo.findById(videoId);
      if (!video) {
        return res.status(404).json({ success: false, message: 'الفيديو غير موجود' });
      }
    }

    const settings = await AutomationSetting.getInstance();
    const n8nBaseUrl = settings.n8nConfig?.apiUrl || process.env.N8N_API_URL || 'https://n8n.knoozbook.com';
    const webhookUrl = `${n8nBaseUrl}/webhook/youtube-video-create`;

    const payload = {
      action: action || 'process',
      callbackUrl: `${process.env.BACKEND_URL || 'https://knoozbook.com'}/api/youtube/videos/${videoId}/callback`
    };

    if (video) {
      payload.videoId = video._id.toString();
      payload.title = video.title;
      payload.description = video.description;
      payload.contentType = video.contentType;
      payload.sourceContent = video.sourceContent;
      payload.tags = video.tags;
      payload.category = video.category;
      payload.privacy = video.privacy;

      video.status = 'processing';
      video.errorMessage = null;
      await video.save();
    }

    const response = await axios.post(webhookUrl, payload, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });

    res.json({
      success: true,
      message: 'تم تفعيل الـ workflow بنجاح',
      n8nResponse: response.data,
      video
    });
  } catch (error) {
    console.error('[YouTube] Error triggering workflow:', error.message);
    res.status(500).json({ success: false, message: `خطأ في تفعيل الـ workflow: ${error.message}` });
  }
};

/**
 * Callback endpoint for n8n to update video status
 */
exports.videoCallback = async (req, res) => {
  try {
    const { status, youtubeVideoId, youtubeUrl, thumbnailUrl, errorMessage, n8nExecutionId } = req.body;

    const video = await YouTubeVideo.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ success: false, message: 'الفيديو غير موجود' });
    }

    if (status) video.status = status;
    if (youtubeVideoId) video.youtubeVideoId = youtubeVideoId;
    if (youtubeUrl) video.youtubeUrl = youtubeUrl;
    if (thumbnailUrl) video.thumbnailUrl = thumbnailUrl;
    if (errorMessage) video.errorMessage = errorMessage;
    if (n8nExecutionId) video.n8nExecutionId = n8nExecutionId;
    if (status === 'published') video.publishedAt = new Date();

    await video.save();

    console.log(`[YouTube] Video ${video._id} status updated to: ${status}`);
    res.json({ success: true, message: 'تم تحديث حالة الفيديو' });
  } catch (error) {
    console.error('[YouTube] Callback error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في تحديث حالة الفيديو' });
  }
};

/**
 * Retry a failed video
 */
exports.retryVideo = async (req, res) => {
  try {
    const video = await YouTubeVideo.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ success: false, message: 'الفيديو غير موجود' });
    }

    if (video.status !== 'failed') {
      return res.status(400).json({ success: false, message: 'يمكن إعادة المحاولة فقط للفيديوهات الفاشلة' });
    }

    video.status = 'processing';
    video.errorMessage = null;
    await video.save();

    // Trigger n8n again
    try {
      const settings = await AutomationSetting.getInstance();
      const n8nBaseUrl = settings.n8nConfig?.apiUrl || process.env.N8N_API_URL || 'https://n8n.knoozbook.com';
      const webhookUrl = `${n8nBaseUrl}/webhook/youtube-video-create`;

      await axios.post(webhookUrl, {
        videoId: video._id.toString(),
        title: video.title,
        description: video.description,
        contentType: video.contentType,
        sourceContent: video.sourceContent,
        tags: video.tags,
        category: video.category,
        privacy: video.privacy,
        action: 'retry',
        callbackUrl: `${process.env.BACKEND_URL || 'https://knoozbook.com'}/api/youtube/videos/${video._id}/callback`
      }, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      });

      res.json({ success: true, video, message: 'تم إعادة تفعيل عملية النشر' });
    } catch (n8nError) {
      video.status = 'failed';
      video.errorMessage = `فشل الاتصال بـ n8n: ${n8nError.message}`;
      await video.save();
      res.status(500).json({ success: false, message: 'فشل إعادة الاتصال بـ n8n workflow' });
    }
  } catch (error) {
    console.error('[YouTube] Error retrying video:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في إعادة المحاولة' });
  }
};
