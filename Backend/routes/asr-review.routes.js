const express = require('express');
const router = express.Router();
const multer = require('multer');
const FormData = require('form-data');
const axios = require('axios');
const authenticateToken = require('../middleware/auth.middleware');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// ASR Service URL - should be configured via environment variable
const ASR_SERVICE_URL = process.env.ASR_SERVICE_URL || 'http://localhost:8000';

// Debug Route
router.get('/ping', (req, res) => {
  console.log('🎤 ASR Review Ping hit!');
  res.json({ message: 'ASR Review service is running', asrServiceUrl: ASR_SERVICE_URL });
});

// All routes require authentication
router.use(authenticateToken);

/**
 * POST /api/asr-review/review
 * Proxy route to ASR microservice for Quranic recitation review
 */
router.post('/review', upload.single('audio_file'), async (req, res) => {
  try {
    console.log('🎤 [ASR Review] Received review request');
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No audio file provided' });
    }

    const { expected_surah, expected_ayah_start, expected_ayah_end } = req.body;

    // Validate required parameters
    if (!expected_surah || !expected_ayah_start || !expected_ayah_end) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters: expected_surah, expected_ayah_start, expected_ayah_end' 
      });
    }

    // Create FormData for ASR service
    const formData = new FormData();
    formData.append('audio_file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });
    formData.append('expected_surah', expected_surah);
    formData.append('expected_ayah_start', expected_ayah_start);
    formData.append('expected_ayah_end', expected_ayah_end);

    console.log(`🎤 [ASR Review] Forwarding to ASR service: ${ASR_SERVICE_URL}/api/v1/review`);
    console.log(`🎤 [ASR Review] Surah: ${expected_surah}, Ayahs: ${expected_ayah_start}-${expected_ayah_end}`);

    // Forward request to ASR microservice
    const asrResponse = await axios.post(
      `${ASR_SERVICE_URL}/api/v1/review`,
      formData,
      {
        headers: {
          ...formData.getHeaders()
        },
        timeout: 600000 // 10 minute timeout for ASR processing (transformers with Quran model is slower)
      }
    );

    console.log(`🎤 [ASR Review] ASR service responded successfully`);
    
    // Return ASR service response
    res.json({
      success: true,
      ...asrResponse.data
    });

  } catch (error) {
    console.error('🎤 [ASR Review] Error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ 
        success: false, 
        message: 'ASR service is unavailable. Please ensure the service is running.' 
      });
    }
    
    if (error.code === 'ETIMEDOUT') {
      return res.status(504).json({ 
        success: false, 
        message: 'ASR service timeout. The recitation may be too long.' 
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Failed to process recitation review',
      error: error.message 
    });
  }
});

/**
 * GET /api/asr-review/health
 * Health check for ASR service
 */
router.get('/health', async (req, res) => {
  try {
    const response = await axios.get(`${ASR_SERVICE_URL}/health`, {
      timeout: 5000
    });
    res.json(response.data);
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy',
      message: 'ASR service is unavailable',
      error: error.message 
    });
  }
});

module.exports = router;
