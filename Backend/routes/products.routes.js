const express = require('express');
const router = express.Router();
const { getExcelData } = require('../controllers/books.controller');
const { verifyN8nToken, authMiddleware } = require('../middleware/auth.middleware');
const Product = require('../models/Product.model');

// مسارات المنتجات
router.get('/get-excel-data', getExcelData);

// Admin product management endpoints
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50, status, search } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { product_name: { $regex: search, $options: 'i' } },
        { _id: { $regex: search, $options: 'i' } },
        { amazonSku: { $regex: search, $options: 'i' } },
        { amazonAsin: { $regex: search, $options: 'i' } }
      ];
    }

    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Product.countDocuments(query);

    res.json({
      success: true,
      products,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message
    });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const updateData = {};
    
    if (req.body.product_name) updateData.product_name = req.body.product_name;
    if (req.body.product_quantity) updateData.product_quantity = parseInt(req.body.product_quantity);
    if (req.body.product_price) updateData.product_price = parseFloat(req.body.product_price);
    if (req.body.product_description) updateData.product_description = req.body.product_description;
    if (req.body.weight) updateData.weight = parseFloat(req.body.weight);
    if (req.body.length) updateData.length = parseFloat(req.body.length);
    if (req.body.width) updateData.width = parseFloat(req.body.width);
    if (req.body.height) updateData.height = parseFloat(req.body.height);

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
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
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating product',
      error: error.message
    });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting product',
      error: error.message
    });
  }
});

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
