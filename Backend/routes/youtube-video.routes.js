const express = require('express');
const router = express.Router();
const youtubeVideoController = require('../controllers/youtube-video.controller');

// Get YouTube statistics
router.get('/stats', youtubeVideoController.getStats);

// Get all videos (with pagination & status filter)
router.get('/videos', youtubeVideoController.getVideos);

// Get a single video
router.get('/videos/:id', youtubeVideoController.getVideo);

// Create a new video
router.post('/videos', youtubeVideoController.createVideo);

// Update a video
router.patch('/videos/:id', youtubeVideoController.updateVideo);

// Delete a video
router.delete('/videos/:id', youtubeVideoController.deleteVideo);

// Publish a video immediately
router.post('/videos/:id/publish', youtubeVideoController.publishNow);

// Schedule a video
router.post('/videos/:id/schedule', youtubeVideoController.scheduleVideo);

// Retry a failed video
router.post('/videos/:id/retry', youtubeVideoController.retryVideo);

// n8n callback endpoint (to update video status after processing)
router.post('/videos/:id/callback', youtubeVideoController.videoCallback);

// Trigger n8n workflow manually
router.post('/trigger-workflow', youtubeVideoController.triggerWorkflow);

module.exports = router;
