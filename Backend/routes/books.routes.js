const express = require('express');
const router = express.Router();
const { getExcelData, getRecentBooks, searchBooks, getCategories } = require('../controllers/books.controller');

// مسارات الكتب
router.get('/get-excel-data', getExcelData);
router.get('/get-recent-books', getRecentBooks);
router.get('/search', searchBooks);
router.get('/categories', getCategories);

module.exports = router;
