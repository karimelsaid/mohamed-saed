const express = require('express');
const router = express.Router();
const { getExcelData, getRecentBooks } = require('../controllers/books.controller');

// مسارات الكتب
router.get('/get-excel-data', getExcelData);
router.get('/get-recent-books', getRecentBooks);

module.exports = router;
