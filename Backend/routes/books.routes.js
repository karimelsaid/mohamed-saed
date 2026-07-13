const express = require('express');
const router = express.Router();
const { getExcelData, getRecentBooks, searchBooks, getCategories, getBookById, getSimilarBooks } = require('../controllers/books.controller');

// مسارات الكتب
router.get('/get-excel-data', getExcelData);
router.get('/get-recent-books', getRecentBooks);
router.get('/search', searchBooks);
router.get('/categories', getCategories);
router.get('/details/:id', getBookById);
router.get('/similar', getSimilarBooks);

module.exports = router;
