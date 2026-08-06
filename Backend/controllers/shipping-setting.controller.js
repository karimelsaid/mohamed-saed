const ShippingSetting = require('../models/ShippingSetting.model');

exports.getSettings = async (req, res) => {
  try {
    let settings = await ShippingSetting.findOne();
    if (!settings) {
      settings = await ShippingSetting.create({});
    }
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    let settings = await ShippingSetting.findOne();
    if (!settings) {
      settings = new ShippingSetting(req.body);
    } else {
      Object.assign(settings, req.body);
    }
    await settings.save();
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
