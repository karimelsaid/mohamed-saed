const express = require('express');
const router = express.Router();
const { getExcelData } = require('../controllers/books.controller');
const { verifyN8nToken } = require('../middleware/auth.middleware');
const Product = require('../models/Product.model');

// مسارات المنتجات
router.get('/get-excel-data', getExcelData);

// Internal endpoints for Amazon integration
router.get('/pending-amazon', verifyN8nToken, async (req, res) => {
  try {
    const products = await Product.find({
      amazonListingStatus: 'pending',
      status: 'approved'
    }).select('product_name product_description product_price amazonPrice product_quantity product_category images weight length width height publisher author pages coverType language publishYear').lean();

    res.json({
      success: true,
      count: products.length,
      products
    });
  } catch (error) {
    console.error('Error fetching pending Amazon products:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pending Amazon products',
      error: error.message
    });
  }
});

router.patch('/:id/quantity', verifyN8nToken, async (req, res) => {
  try {
    const { quantity } = req.body;
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { product_quantity: quantity, lastStockUpdate: new Date() },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      product
    });
  } catch (error) {
    console.error('Error updating product quantity:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating product quantity',
      error: error.message
    });
  }
});

// Endpoint for n8n to update Amazon listing status after upload
router.patch('/:id/amazon-status', verifyN8nToken, async (req, res) => {
  try {
    const { amazonListingStatus, amazonAsin, amazonRejectionReason } = req.body;

    const updateData = {
      amazonListingStatus,
      lastSyncedToAmazon: new Date()
    };

    if (amazonAsin) {
      updateData.amazonAsin = amazonAsin;
    }

    if (amazonRejectionReason) {
      updateData.amazonRejectionReason = amazonRejectionReason;
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    console.log(`✅ [Amazon Status] Updated product ${req.params.id} to ${amazonListingStatus}`);
    res.json({
      success: true,
      product
    });
  } catch (error) {
    console.error('Error updating Amazon listing status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating Amazon listing status',
      error: error.message
    });
  }
});

module.exports = router;
