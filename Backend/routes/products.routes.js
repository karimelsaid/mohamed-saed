const express = require('express');
const router = express.Router();
const { getExcelData } = require('../controllers/books.controller');

// مسارات المنتجات
router.get('/get-excel-data', getExcelData);

module.exports = router;
