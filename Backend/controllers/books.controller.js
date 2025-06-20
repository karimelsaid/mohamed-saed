const { downloadAndConvertExcel } = require('../services/excel.service');
const fs = require('fs');
const FILE_ID = '1N6rRpXCZRnmw4Os9HK9X-tKS9ZWKOI9M';

// جلب بيانات الكتب من ملف Excel
async function getExcelData(req, res) {
  try {
    fs.readFile('output.json', 'utf8', (err, data) => {
      if (err) {
        return res.status(500).json({ 
          message: 'حدث خطأ أثناء قراءة الملف', 
          error: err 
        });
      }
      
      try {
        const jsonData = JSON.parse(data);
        res.json(jsonData);
      } catch (error) {
        res.status(500).json({ 
          message: 'حدث خطأ أثناء تحويل بيانات JSON', 
          error 
        });
      }
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'حدث خطأ أثناء جلب بيانات الكتب', 
      error 
    });
  }
}

// دالة جديدة لإرجاع آخر 50 كتابًا مضافًا
async function getRecentBooks(req, res) {
  try {
    fs.readFile('output.json', 'utf8', (err, data) => {
      if (err) {
        return res.status(500).json({ 
          message: 'حدث خطأ أثناء قراءة الملف', 
          error: err 
        });
      }
      
      try {
        const jsonData = JSON.parse(data);
        // افتراض أن ترتيب الكتب يعكس ترتيب الإضافة
        const recentBooks = jsonData.slice(-50).reverse(); // آخر 50 كتابًا مع عكس الترتيب لعرض الأحدث أولاً
        res.json(recentBooks);
      } catch (error) {
        res.status(500).json({ 
          message: 'حدث خطأ أثناء تحويل بيانات JSON', 
          error 
        });
      }
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'حدث خطأ أثناء جلب بيانات الكتب', 
      error 
    });
  }
}

// تنزيل وتحويل بيانات Excel من Google Drive
async function updateBooksData() {
  try {
    console.log('جاري تحديث بيانات الكتب من Google Drive...');
    await downloadAndConvertExcel(FILE_ID);
    console.log('✅ تم تحديث بيانات الكتب بنجاح');
  } catch (error) {
    console.error('❌ فشل في تحديث بيانات الكتب:', error);
    throw error;
  }
}

module.exports = {
  getExcelData,
  getRecentBooks,
  updateBooksData
};
