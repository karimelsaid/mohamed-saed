const path = require('path');
const fs = require('fs');

/**
 * Get publisher logo image
 * Supports multiple image formats: .webp, .jpg, .jpeg, .png
 */
async function getPublisherLogo(req, res) {
  try {
    const { publisherName } = req.params;
    
    if (!publisherName) {
      return res.status(400).json({ success: false, message: 'Publisher name is required' });
    }

    const publishersDir = path.join(__dirname, '..', 'uploads', 'books', 'publishers');
    
    // Try different image formats in order of preference
    const extensions = ['.webp', '.jpg', '.jpeg', '.png'];
    let foundFile = null;
    
    for (const ext of extensions) {
      const filePath = path.join(publishersDir, publisherName + ext);
      if (fs.existsSync(filePath)) {
        foundFile = filePath;
        break;
      }
    }

    if (!foundFile) {
      // Return placeholder image if not found
      const placeholderPath = path.join(__dirname, '..', 'uploads', 'books', 'publishers', 'placeholder.png');
      if (fs.existsSync(placeholderPath)) {
        return res.sendFile(placeholderPath);
      }
      return res.status(404).json({ success: false, message: 'Publisher logo not found' });
    }

    // Determine content type based on file extension
    const ext = path.extname(foundFile).toLowerCase();
    const contentTypes = {
      '.webp': 'image/webp',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png'
    };
    
    const contentType = contentTypes[ext] || 'image/jpeg';
    
    res.setHeader('Content-Type', contentType);
    res.sendFile(foundFile);
  } catch (error) {
    console.error('Error getting publisher logo:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = { getPublisherLogo };
