const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User.model');
const mongoose = require('mongoose');

// Delete print order and associated files
exports.deletePrintOrder = async (req, res) => {
  const { userId, orderId } = req.params;
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const order = user.orders.id(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Print order not found' });
    }
    // Delete associated files
    if (order.printProjects && order.printProjects.length > 0) {
      for (const printProject of order.printProjects) {
        if (printProject.filepath) {
          fs.unlink(printProject.filepath, (err) => {
            if (err) {
              console.error('Error deleting file:', err);
            }
          });
        }
      }
    }
    // Remove order from user's orders
    order.remove();
    await user.save();
    res.status(200).json({ success: true, message: 'Print order deleted successfully' });
  } catch (error) {
    console.error('Error deleting print order:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads/');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8'); // تحويل الاسم إلى UTF-8
    cb(null, `${uniqueSuffix}-${originalName}`);
  }
});

// File filter to accept only PDFs
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed!'), false);
  }
};

const upload = multer({ storage: storage, fileFilter: fileFilter }).array('files', 10);

// Price calculation function
function calculatePrice({ pages, copies, coverType, printColor, size, paperColor }) {
  let basePricePerPage = 0.25; // base price per page in currency units
  if (printColor === 'أبيض وأسود') {
    basePricePerPage = 0.40;
  } else if (printColor === 'ألوان') {
    basePricePerPage = 0.90;
  }

  let coverPrice = 0;
  if (coverType === 'غلاف ورقي') {
    coverPrice = 25;
  } else if (coverType === 'غلاف كرتوني') {
    coverPrice = 60;
  }else if (coverType === 'غلاف جلد فاخر') {
    coverPrice = 100;
  }

  let sizeMultiplier = 1;
  if (size === 'A4') {
    sizeMultiplier = 1;
  } else if (size === 'A5') {
    sizeMultiplier = 0.8;
  }else if (size === 'B5') {
    sizeMultiplier = 0.95;
  }

  let paperColorPrice = 0;
  if (paperColor === '#DED5AF') { // yellow paper
    paperColorPrice = 0.10;
  } else if (paperColor === '#FFFFFF') { // white paper default
    paperColorPrice = 0;
  }

  const price = ((pages * basePricePerPage) + coverPrice + paperColorPrice) * copies * sizeMultiplier;
  return Math.round(price * 100) / 100; // round to 2 decimals
}

exports.uploadPrintProjects = async (req, res) => {
  upload(req, res, async function (err) {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ success: false, message: err.message });
    }

    try {
      let userId = req.body.userId;
      if (!userId) {
        const user = await User.findOne({});
        if (!user) {
          return res.status(400).json({ success: false, message: 'No users found in database for testing' });
        }
        userId = user._id.toString();
      }

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ success: false, message: 'Invalid User ID format' });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const projectsData = JSON.parse(req.body.projectsData); // expecting JSON string of array of project metadata

      if (!projectsData || !Array.isArray(projectsData) || projectsData.length !== req.files.length) {
        return res.status(400).json({ success: false, message: 'بيانات المشروع غير صالحة' });
      }

      let totalEstimatedPrice = 0;
      const printProjects = [];

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const data = projectsData[i];

        const estimatedPrice = calculatePrice({
          pages: data.pages,
          copies: data.copies,
          coverType: data.coverType,
          printColor: data.printColor,
          size: data.size,
          paperColor: data.paperColor
        });

        totalEstimatedPrice += estimatedPrice;

        printProjects.push({
          filename: file.filename,
          filepath: file.path,
          size: data.size,
          coverType: data.coverType,
          printColor: data.printColor,
          paperColor: data.paperColor,
          pages: data.pages,
          copies: data.copies,
          notes: data.notes || '',
          projectTitle: data.projectTitle,
          estimatedPrice: estimatedPrice,
          createdAt: new Date()
        });
      }

      // Parse shippingAddress from the request body
      const shippingDetails = JSON.parse(req.body.shippingAddress || '{}');

      // Build shipping address object for the order
      const shippingAddress = { ...shippingDetails }; // Copy all details initially
      shippingAddress.phone = shippingDetails.phone || user.phone;

      if (shippingDetails.deliveryType === 'pickup') {
        shippingAddress.pickupLocation = shippingDetails.pickupLocation || 'https://maps.app.goo.gl/Ms3sHBp6EDgjAb3G6'; // Set default if not provided
      } else if (shippingDetails.deliveryType === 'postOffice') {
        shippingAddress.governorate = shippingDetails.governorate || user.governorate;
        shippingAddress.city = shippingDetails.city || user.city;
        shippingAddress.postOffice = user.postOffice; // Include user's postOffice details
        shippingAddress.name = user.postOffice?.name || shippingDetails.name;
        shippingAddress.address = user.postOffice?.address || shippingDetails.address;

        // Save postOffice details to user profile for reuse
        user.postOffice = {
          governorate: shippingDetails.governorate,
          city: shippingDetails.city,
          address: shippingDetails.address,
          name: shippingDetails.name
        };
        await user.save(); // Save the user profile with postOffice details
      } else {
        // Home delivery
        shippingAddress.governorate = shippingDetails.governorate || user.governorate;
        shippingAddress.city = shippingDetails.city || user.city;
        shippingAddress.village = shippingDetails.village || user.village;
      }

      // Save order in user.orders with embedded print projects info
      const newOrder = {
        date: new Date(),
        products: [], // no book products in this order
        printProjects: printProjects,
        shippingCost: shippingDetails.shippingCost || 0,
        totalAmount: shippingDetails.totalAmount || totalEstimatedPrice,
        status: 'قيد الإنتظار',
        shippingAddress: shippingAddress
      };

      user.orders.push(newOrder);
      user.markModified('orders');
      await user.save();

      res.status(201).json({
        success: true,
        message: 'Print projects uploaded successfully',
        numberOfFiles: req.files.length,
        totalEstimatedPrice: totalEstimatedPrice,
        projects: printProjects
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
  });
};

// New API endpoint to get all print orders with user info
function sanitizeFilename(filename) {
  // Remove Unicode control characters and invisible characters
  return filename.replace(/[\u200B-\u200D\u2060-\u206F\uFEFF]/g, '');
}

exports.getAllPrintOrders = async (req, res) => {
    try {
        console.log('Backend: Fetching all print orders...');
        // Find all users and select necessary fields
        const users = await User.find({
            "orders": {
                "$elemMatch": { "printProjects": { "$exists": true, "$ne": [] } }
            }
        })
            .select('username email phone orders')
            .lean();

        console.log(`Backend: Found ${users.length} users with potential print orders.`);
        // Flatten the print orders from all users into a single array
        const allPrintOrders = users.flatMap(user =>
            user.orders
                .filter(order => order.printProjects && order.printProjects.length > 0) // Filter for print orders
                .map(order => ({
                    orderId: order._id,
                    userId: user._id,
                    username: user.username,
                    email: user.email,
                    phone: order.shippingAddress?.phone || user.phone,
                    shippingAddress: order.shippingAddress, // Pass the full shipping address object
                    status: order.status,
                    orderDate: order.date,
                    totalAmount: order.totalAmount,
                    printProjects: order.printProjects.map(p => ({ ...p, filename: sanitizeFilename(p.filename) }))
                }))
        );

        allPrintOrders.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));

        console.log(`Backend: Total print orders found: ${allPrintOrders.length}`);

        res.json({ success: true, printOrders: allPrintOrders });
    } catch (error) {
        console.error('Error fetching all print orders:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// New controller method to download a file associated with a print order
exports.downloadPrintFile = async (req, res) => {
  const { userId, orderId, fileIndex } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(orderId)) {
    return res.status(400).json({ success: false, message: 'Invalid user ID or order ID' });
  }
  const fileIdx = parseInt(fileIndex, 10);
  if (isNaN(fileIdx)) {
    return res.status(400).json({ success: false, message: 'Invalid file index' });
  }
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const order = user.orders.id(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Print order not found' });
    }
    if (!order.printProjects || order.printProjects.length <= fileIdx) {
      return res.status(404).json({ success: false, message: 'يجب عليك تحميل ملف الطباعة' });
    }
    const printProject = order.printProjects[fileIdx];
    const filePath = printProject.filepath;
    if (!filePath) {
      return res.status(404).json({ success: false, message: 'File path not found' });
    }
    // Serve the file
    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        return res.status(404).json({ success: false, message: 'File not found on server' });
      }
      const filename = path.basename(filePath);
      const ext = path.extname(filename).toLowerCase();
      let contentType = 'application/octet-stream';
      if (ext === '.pdf') {
        contentType = 'application/pdf';
      } else if (ext === '.rar') {
        contentType = 'application/x-rar-compressed';
      } else if (ext === '.zip') {
        contentType = 'application/zip';
      }
      res.setHeader('Content-Type', contentType);
      const encodedFilename = encodeURIComponent(filename);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
      res.sendFile(filePath, (err) => {
        if (err) {
          res.status(500).json({ success: false, message: 'Error sending file' });
        }
      });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


// New method to update print order status
exports.updatePrintOrderStatus = async (req, res) => {
  try {
    const { userId, orderId } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: 'Invalid user ID or order ID' });
    }

    // Find the user who has this print order
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find the order by ID
    const order = user.orders.id(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Print order not found' });
    }

    // Validate status value
    const validStatuses = ['قيد الإنتظار', 'تم الإلغاء', 'تم الشحن', 'تم التسليم'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    // Update the order status
    order.status = status;

    // Create notification message based on status
    let notificationMessage = '';
    switch (status) {
      case 'تم الشحن':
        notificationMessage = `تم شحن طلب الطباعة رقم ${orderId}`;
        break;
      case 'تم التسليم':
        notificationMessage = `تم تسليم طلب الطباعة رقم ${orderId}`;
        break;
      case 'تم الإلغاء':
        notificationMessage = `تم إلغاء طلب الطباعة رقم ${orderId}`;
        break;
      default:
        notificationMessage = `تم تحديث حالة طلب الطباعة رقم ${orderId} إلى ${status}`;
    }

    // Add notification to user
    user.notifications.push({
      message: notificationMessage,
      type: 'printOrder',
      read: false,
      createdAt: new Date(),
      relatedId: orderId
    });

    await user.save({ validateBeforeSave: false });

    res.status(200).json({ message: 'Print order status updated successfully' });
  } catch (error) {
    console.error('Error updating print order status:', error);
    res.status(500).json({ message: 'Error updating print order status', error: error.message });
  }
};
