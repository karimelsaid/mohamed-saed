const Category = require('../models/Category.model');

// Get all categories
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });
    res.json({ success: true, categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ success: false, message: 'فشل في جلب التصنيفات' });
  }
};

// Create a new category
exports.createCategory = async (req, res) => {
  try {
    const { name, type, isActive } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'اسم التصنيف مطلوب' });
    }

    const newCategory = new Category({ name, type, isActive });
    await newCategory.save();
    
    res.status(201).json({ success: true, category: newCategory, message: 'تم إضافة التصنيف بنجاح' });
  } catch (error) {
    console.error('Error creating category:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'هذا التصنيف موجود مسبقاً' });
    }
    res.status(500).json({ success: false, message: 'فشل في إضافة التصنيف' });
  }
};

// Update a category
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, isActive } = req.body;

    const category = await Category.findByIdAndUpdate(
      id,
      { name, type, isActive },
      { new: true, runValidators: true }
    );

    if (!category) {
      return res.status(404).json({ success: false, message: 'التصنيف غير موجود' });
    }

    res.json({ success: true, category, message: 'تم تحديث التصنيف بنجاح' });
  } catch (error) {
    console.error('Error updating category:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'هذا التصنيف موجود مسبقاً' });
    }
    res.status(500).json({ success: false, message: 'فشل في تحديث التصنيف' });
  }
};

// Delete a category
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    
    const category = await Category.findByIdAndDelete(id);
    
    if (!category) {
      return res.status(404).json({ success: false, message: 'التصنيف غير موجود' });
    }

    res.json({ success: true, message: 'تم حذف التصنيف بنجاح' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ success: false, message: 'فشل في حذف التصنيف' });
  }
};
