const express = require('express');
const router = express.Router();

// قائمة المصاحف المتاحة
const AVAILABLE_MUSHAFS = [
  {
    id: 'hafs_v1',
    name: 'مصحف المدينة (الإصدار الأول)',
    description: 'رواية حفص عن عاصم بالخط القديم لمصحف المدينة المنورة',
    folder: 'hafs_v1',
    totalFiles: 638, // 604 pages + 30 juz chunks + 1 basmalah + 3 metadata JSONs
    active: true,
    isDefault: true
  },
  {
    id: 'hafs_v2',
    name: 'مصحف المدينة (الإصدار الثاني)',
    description: 'رواية حفص عن عاصم بالخط الجديد عالي الجودة لمصحف المدينة المنورة',
    folder: 'hafs_v2',
    totalFiles: 638,
    active: true,
    isDefault: false
  },
  {
    id: 'tajweed',
    name: 'مصحف التجويد الملون',
    description: 'مصحف التجويد الملون لتسهيل معرفة أحكام التجويد أثناء القراءة',
    folder: 'tajweed',
    totalFiles: 638,
    active: true,
    isDefault: false
  },
  {
    id: 'warsh',
    name: 'مصحف المدينة - رواية ورش',
    description: 'مصحف المدينة المنورة برواية ورش عن نافع بالرسم العثماني',
    folder: 'warsh',
    totalFiles: 638,
    active: true,
    isDefault: false
  }
];

// جلب قائمة المصاحف المتاحة
router.get('/', (req, res) => {
  try {
    res.json(AVAILABLE_MUSHAFS);
  } catch (error) {
    console.error('Error fetching available mushafs:', error);
    res.status(500).json({ error: 'Failed to retrieve available mushafs' });
  }
});

module.exports = router;
