const express = require('express');
const router = express.Router();
const adminPartnershipController = require('../controllers/adminPartnershipController');
const authenticateAdmin = require('../middleware/admin.auth');

router.use(authenticateAdmin);

router.get('/settings', adminPartnershipController.getSettings);
router.patch('/settings', adminPartnershipController.updateSettings);

router.get('/applications', adminPartnershipController.getApplications);
router.patch('/applications/:id', adminPartnershipController.updateApplicationStatus);

router.post('/partners/:id/approve', adminPartnershipController.approvePartnership);

router.get('/cap-table', adminPartnershipController.getCapTable);

module.exports = router;
