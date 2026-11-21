const amazonOrdersService = require('../services/amazon/amazon-orders.service');

class AmazonOrdersController {
  /**
   * GET /api/amazon/orders
   * List all Amazon orders with filters & KPIs
   */
  async getOrders(req, res) {
    try {
      const filters = {
        status: req.query.status || 'all',
        search: req.query.search || '',
        page: req.query.page || 1,
        limit: req.query.limit || 20
      };

      const result = await amazonOrdersService.getAmazonOrders(filters);
      res.json(result);
    } catch (err) {
      console.error('Error in getOrders controller:', err);
      res.status(500).json({
        success: false,
        message: 'فشل استرجاع طلبات أمازون',
        error: err.message
      });
    }
  }

  /**
   * POST /api/amazon/orders/sync
   * Trigger live sync from Amazon SP-API
   */
  async syncOrders(req, res) {
    try {
      const options = {
        createdAfter: req.body?.createdAfter,
        orderStatuses: req.body?.orderStatuses
      };

      const result = await amazonOrdersService.syncOrdersFromAmazon(options);
      res.json(result);
    } catch (err) {
      console.error('Error in syncOrders controller:', err);
      res.status(500).json({
        success: false,
        message: 'فشل مزامنة الطلبات من أمازون',
        error: err.message
      });
    }
  }

  /**
   * GET /api/amazon/orders/:id
   * Get single order details
   */
  async getOrderDetails(req, res) {
    try {
      const order = await amazonOrdersService.getOrderById(req.params.id);
      res.json({
        success: true,
        order
      });
    } catch (err) {
      console.error('Error in getOrderDetails controller:', err);
      res.status(404).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/amazon/orders/:id/handover-slots
   * Retrieve available Easy Ship pickup slots
   */
  async getHandoverSlots(req, res) {
    try {
      const order = await amazonOrdersService.getOrderById(req.params.id);
      const packageDetails = req.body?.packageDetails || order.packageDetails;

      const result = await amazonOrdersService.getHandoverSlots(order.amazonOrderId, packageDetails);
      res.json(result);
    } catch (err) {
      console.error('Error in getHandoverSlots controller:', err);
      res.status(500).json({
        success: false,
        message: 'فشل جلب مواعيد استلام الشحنة',
        error: err.message
      });
    }
  }

  /**
   * POST /api/amazon/orders/:id/schedule
   * Schedule Easy Ship pickup with chosen slot and dimensions
   */
  async scheduleOrder(req, res) {
    try {
      const order = await amazonOrdersService.getOrderById(req.params.id);
      const scheduleData = {
        slotId: req.body?.slotId,
        startTime: req.body?.startTime,
        endTime: req.body?.endTime,
        handoverMethod: req.body?.handoverMethod || 'Pickup',
        packageDetails: req.body?.packageDetails || order.packageDetails
      };

      const result = await amazonOrdersService.scheduleEasyShip(order.amazonOrderId, scheduleData);
      res.json(result);
    } catch (err) {
      console.error('Error in scheduleOrder controller:', err);
      res.status(500).json({
        success: false,
        message: 'فشل جدولة استلام الشحنة مع أمازون',
        error: err.message
      });
    }
  }

  /**
   * POST /api/amazon/orders/:id/confirm-shipment
   * Confirm manual shipment
   */
  async confirmShipment(req, res) {
    try {
      const order = await amazonOrdersService.getOrderById(req.params.id);
      const shipmentData = req.body;

      const result = await amazonOrdersService.confirmShipment(order.amazonOrderId, shipmentData);
      res.json(result);
    } catch (err) {
      console.error('Error in confirmShipment controller:', err);
      res.status(500).json({
        success: false,
        message: 'فشل تأكيد شحن الطلب',
        error: err.message
      });
    }
  }

  /**
   * GET /api/amazon/orders/:id/label
   * Get printable label & packing slip payload
   */
  async getLabel(req, res) {
    try {
      const result = await amazonOrdersService.getOrderLabelData(req.params.id);
      res.json(result);
    } catch (err) {
      console.error('Error in getLabel controller:', err);
      res.status(500).json({
        success: false,
        message: 'فشل تحضير ملصق الشحن للطباعة',
        error: err.message
      });
    }
  }
}

module.exports = new AmazonOrdersController();
