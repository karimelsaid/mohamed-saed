const { dbConnection } = require('../database/connection');
const { logger } = require('../logging/logger');

class ReportsEngineService {
  constructor(dbConn = dbConnection) {
    this.dbConn = dbConn;
  }

  // =========================================================================
  // 1. PROFIT & LOSS REPORT (تقرير الأرباح والخسائر الشامل P&L)
  // =========================================================================

  getProfitAndLoss({ startDate = null, endDate = null } = {}) {
    let dateFilterSales = '';
    let dateFilterReturns = '';
    let dateFilterPayments = '';
    let dateFilterExpenses = '';
    let dateFilterBookings = '';
    const paramsSales = [];
    const paramsReturns = [];
    const paramsPayments = [];
    const paramsExpenses = [];
    const paramsBookings = [];

    if (startDate && endDate) {
      dateFilterSales = ' WHERE date(created_at) BETWEEN date(?) AND date(?)';
      paramsSales.push(startDate, endDate);

      dateFilterReturns = ' WHERE date(created_at) BETWEEN date(?) AND date(?)';
      paramsReturns.push(startDate, endDate);

      dateFilterPayments = ' AND date(created_at) BETWEEN date(?) AND date(?)';
      paramsPayments.push(startDate, endDate);

      dateFilterExpenses = ' WHERE date(created_at) BETWEEN date(?) AND date(?)';
      paramsExpenses.push(startDate, endDate);

      dateFilterBookings = ' WHERE date(actual_return_date) BETWEEN date(?) AND date(?)';
      paramsBookings.push(startDate, endDate);
    } else if (startDate) {
      dateFilterSales = ' WHERE date(created_at) >= date(?)';
      paramsSales.push(startDate);

      dateFilterReturns = ' WHERE date(created_at) >= date(?)';
      paramsReturns.push(startDate);

      dateFilterPayments = ' AND date(created_at) >= date(?)';
      paramsPayments.push(startDate);

      dateFilterExpenses = ' WHERE date(created_at) >= date(?)';
      paramsExpenses.push(startDate);

      dateFilterBookings = ' WHERE date(actual_return_date) >= date(?)';
      paramsBookings.push(startDate);
    }

    // 1. POS Direct Sales & Returns
    const salesTotal = this.dbConn.get(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM sales ${dateFilterSales}`,
      paramsSales
    ).total;

    const returnsTotal = this.dbConn.get(
      `SELECT COALESCE(SUM(total_refund), 0) as total FROM sales_returns ${dateFilterReturns}`,
      paramsReturns
    ).total;

    const netSalesRevenue = Math.max(0, salesTotal - returnsTotal);

    // 2. Rental Revenue (Advances & Remainders paid)
    const rentalRevenue = this.dbConn.get(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_type IN ('RENTAL_ADVANCE', 'RENTAL_REMAINDER') ${dateFilterPayments}`,
      paramsPayments
    ).total;

    // 3. Late Fees & Damage Deductions
    const fees = this.dbConn.get(
      `SELECT COALESCE(SUM(late_fee), 0) as late_fees, COALESCE(SUM(damage_fee), 0) as damage_fees FROM bookings ${dateFilterBookings}`,
      paramsBookings
    );

    const lateFeesRevenue = fees ? fees.late_fees : 0;
    const damageFeesRevenue = fees ? fees.damage_fees : 0;

    // Gross Operating Revenue
    const grossOperatingRevenue = netSalesRevenue + rentalRevenue + lateFeesRevenue + damageFeesRevenue;

    // 4. Operating Expenses & Cleaning Breakdown
    const expenseBreakdown = this.dbConn.all(`
      SELECT ec.name as category_name,
             COALESCE(SUM(e.amount), 0) as total_amount,
             COUNT(e.id) as count
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      ${dateFilterExpenses}
      GROUP BY ec.id
      ORDER BY total_amount DESC
    `, paramsExpenses);

    const totalOperatingExpenses = expenseBreakdown.reduce((sum, item) => sum + item.total_amount, 0);

    // Direct COGS costs (تكلفة البضاعة المباعة للبضائع والقطع)
    let dateFilterSaleItems = '';
    const paramsSaleItems = [];
    if (startDate && endDate) {
      dateFilterSaleItems = ' WHERE date(s.created_at) BETWEEN date(?) AND date(?)';
      paramsSaleItems.push(startDate, endDate);
    } else if (startDate) {
      dateFilterSaleItems = ' WHERE date(s.created_at) >= date(?)';
      paramsSaleItems.push(startDate);
    }

    const cogsRow = this.dbConn.get(`
      SELECT COALESCE(SUM(
        CASE 
          WHEN si.product_variant_id IS NOT NULL THEN (COALESCE(p.cost_price, 0) * si.quantity)
          WHEN si.suit_unit_id IS NOT NULL THEN COALESCE(NULLIF(u.purchase_cost, 0), sm.cost_price, 0)
          ELSE 0
        END
      ), 0) as total_cogs
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN product_variants pv ON si.product_variant_id = pv.id
      LEFT JOIN products p ON pv.product_id = p.id
      LEFT JOIN suit_units u ON si.suit_unit_id = u.id
      LEFT JOIN suit_models sm ON u.suit_model_id = sm.id
      ${dateFilterSaleItems}
    `, paramsSaleItems);

    const cogsTotal = cogsRow ? cogsRow.total_cogs : 0;
    const grossProfit = Math.max(0, grossOperatingRevenue - cogsTotal);
    const grossMarginPercent = grossOperatingRevenue > 0
      ? Number(((grossProfit / grossOperatingRevenue) * 100).toFixed(1))
      : 0;

    // 5. Net Operating Profit & Margin
    const netOperatingProfit = grossProfit - totalOperatingExpenses;
    const profitMargin = grossOperatingRevenue > 0
      ? Number(((netOperatingProfit / grossOperatingRevenue) * 100).toFixed(1))
      : 0;

    // 6. Security Deposits Flow (Escrow - Isolated from Profit)
    const depositPayments = this.dbConn.get(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_type = 'SECURITY_DEPOSIT' ${dateFilterPayments}`,
      paramsPayments
    ).total;

    const depositRefunds = this.dbConn.get(
      `SELECT COALESCE(SUM(deposit_refunded), 0) as total FROM bookings ${dateFilterBookings}`,
      paramsBookings
    ).total;

    return {
      period: { startDate, endDate },
      revenue: {
        salesRevenue: netSalesRevenue,
        rentalRevenue,
        lateFeesRevenue,
        damageFeesRevenue,
        totalGrossRevenue: grossOperatingRevenue,
        discountsGiven: 0,
        totalNetRevenue: grossOperatingRevenue
      },
      revenues: {
        posSalesTotal: salesTotal,
        posReturnsTotal: returnsTotal,
        netSalesRevenue,
        rentalRevenue,
        lateFeesRevenue,
        damageFeesRevenue,
        grossOperatingRevenue
      },
      cogs: {
        salesCogs: cogsTotal,
        cleaningExpenses: 0,
        totalDirectCosts: cogsTotal
      },
      grossProfit,
      grossMarginPercent,
      operatingExpenses: {
        totalOperatingExpenses,
        byCategory: expenseBreakdown
      },
      expenses: {
        breakdown: expenseBreakdown,
        totalOperatingExpenses
      },
      profitability: {
        netOperatingProfit,
        profitMargin
      },
      netOperatingProfit,
      netMarginPercent: profitMargin,
      escrowFlow: {
        depositsCollected: depositPayments,
        depositsRefunded: depositRefunds,
        netEscrowChange: depositPayments - depositRefunds
      }
    };
  }

  // =========================================================================
  // 2. INVENTORY SUMMARY & VALUATION (جرد وتقييم وحركة المخزون)
  // =========================================================================

  getStockSummary() {
    // 1. Suit Fleet Breakdown
    const suitFleet = this.dbConn.all(`
      SELECT status, COUNT(*) as count
      FROM suit_units
      GROUP BY status
    `);

    const statusCounts = {
      AVAILABLE: 0,
      BOOKED: 0,
      IN_USE: 0,
      IN_CLEANING: 0,
      DAMAGED: 0,
      SOLD: 0,
      RETIRED: 0
    };
    let totalSuitUnits = 0;

    for (const row of suitFleet) {
      if (statusCounts[row.status] !== undefined) {
        statusCounts[row.status] = row.count;
      }
      totalSuitUnits += row.count;
    }

    const suitValuation = this.dbConn.get(`
      SELECT
        COALESCE(SUM(purchase_cost), 0) as total_capital_cost,
        COALESCE(SUM(m.rental_price), 0) as potential_rental_cycle
      FROM suit_units u
      JOIN suit_models m ON u.suit_model_id = m.id
      WHERE u.status != 'RETIRED'
    `);

    // 2. Quantity Inventory Breakdown (Shoes & Accessories)
    const qtyProducts = this.dbConn.get(`
      SELECT
        COUNT(DISTINCT p.id) as total_products,
        COUNT(DISTINCT pv.id) as total_variants,
        COALESCE(SUM(b.quantity_on_hand), 0) as total_on_hand,
        COALESCE(SUM(b.quantity_reserved), 0) as total_reserved,
        COALESCE(SUM(b.quantity_on_hand * p.cost_price), 0) as total_cost_valuation,
        COALESCE(SUM(b.quantity_on_hand * (p.sale_price + pv.additional_price)), 0) as total_retail_valuation
      FROM products p
      JOIN product_variants pv ON pv.product_id = p.id
      LEFT JOIN stock_balances b ON b.product_variant_id = pv.id
      WHERE p.is_active = 1 AND pv.is_active = 1
    `);

    // 3. Low Stock Items (At or below reorder level)
    const lowStockAlerts = this.getLowStockAlerts();

    return {
      suits: {
        totalUnits: totalSuitUnits,
        statusCounts,
        activeFleet: totalSuitUnits - statusCounts.SOLD - statusCounts.RETIRED,
        totalCapitalCost: suitValuation.total_capital_cost,
        potentialRentalCycle: suitValuation.potential_rental_cycle
      },
      quantityInventory: {
        totalProducts: qtyProducts.total_products,
        totalVariants: qtyProducts.total_variants,
        totalOnHand: qtyProducts.total_on_hand,
        totalReserved: qtyProducts.total_reserved,
        availableQuantity: qtyProducts.total_on_hand - qtyProducts.total_reserved,
        costValuation: qtyProducts.total_cost_valuation,
        retailValuation: qtyProducts.total_retail_valuation
      },
      lowStockAlerts
    };
  }

  getLowStockAlerts() {
    return this.dbConn.all(`
      SELECT p.id as product_id,
             p.code as product_code,
             p.name as product_name,
             c.name as category_name,
             s.name as size_name,
             col.name as color_name,
             pv.sku,
             pv.barcode,
             p.reorder_level,
             COALESCE(b.quantity_on_hand, 0) as quantity_on_hand,
             (p.reorder_level - COALESCE(b.quantity_on_hand, 0)) as deficit
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN sizes s ON pv.size_id = s.id
      LEFT JOIN colors col ON pv.color_id = col.id
      LEFT JOIN stock_balances b ON b.product_variant_id = pv.id AND b.warehouse_id = 1
      WHERE p.is_active = 1 AND pv.is_active = 1
        AND COALESCE(b.quantity_on_hand, 0) <= p.reorder_level
      ORDER BY quantity_on_hand ASC
    `);
  }

  // =========================================================================
  // 3. RENTAL OCCUPANCY & ASSET UTILIZATION (نسبة إشغال البدل ومعدل الدوران)
  // =========================================================================

  getRentalOccupancy() {
    // 1. Fleet status calculation
    const fleet = this.dbConn.get(`
      SELECT
        COUNT(*) as total_units,
        COALESCE(SUM(CASE WHEN status IN ('BOOKED', 'IN_USE') THEN 1 ELSE 0 END), 0) as occupied_units,
        COALESCE(SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END), 0) as available_units,
        COALESCE(SUM(CASE WHEN status = 'IN_CLEANING' THEN 1 ELSE 0 END), 0) as cleaning_units,
        COALESCE(SUM(CASE WHEN status = 'DAMAGED' THEN 1 ELSE 0 END), 0) as damaged_units
      FROM suit_units
      WHERE status NOT IN ('RETIRED', 'SOLD')
    `);

    const totalFleet = fleet.total_units || 0;
    const occupied = fleet.occupied_units || 0;
    const occupancyRate = totalFleet > 0 ? Number(((occupied / totalFleet) * 100).toFixed(1)) : 0;

    // 2. Top Rented Suit Models
    const topModels = this.dbConn.all(`
      SELECT m.id, m.code, m.name,
             COUNT(bi.id) as rental_count,
             COALESCE(SUM(bi.rental_price), 0) as total_revenue
      FROM suit_models m
      JOIN suit_units u ON u.suit_model_id = m.id
      JOIN booking_items bi ON bi.suit_unit_id = u.id
      GROUP BY m.id
      ORDER BY rental_count DESC
      LIMIT 5
    `);

    // 3. Popular Sizes
    const popularSizes = this.dbConn.all(`
      SELECT s.name as size_name, COUNT(bi.id) as count
      FROM booking_items bi
      JOIN suit_units u ON bi.suit_unit_id = u.id
      JOIN sizes s ON u.size_id = s.id
      GROUP BY s.id
      ORDER BY count DESC
      LIMIT 5
    `);

    const fleetSummary = {
      totalFleet,
      occupiedUnits: occupied,
      availableUnits: fleet.available_units || 0,
      cleaningUnits: fleet.cleaning_units || 0,
      damagedUnits: fleet.damaged_units || 0,
      occupancyRate
    };

    return {
      fleet: fleetSummary,
      fleetSummary,
      topRentedModels: topModels,
      popularSizes
    };
  }

  // =========================================================================
  // 4. TOP CUSTOMERS REPORT (سجل وكبار العملاء ومعدل الالتزام)
  // =========================================================================

  getTopCustomers({ limit = 10 } = {}) {
    return this.dbConn.all(`
      SELECT c.id, c.code, c.name, c.phone, c.address,
             COUNT(DISTINCT b.id) as total_bookings,
             COUNT(DISTINCT s.id) as total_sales,
             (
               COALESCE((SELECT SUM(paid_amount) FROM bookings WHERE customer_id = c.id), 0) +
               COALESCE((SELECT SUM(total_amount) FROM sales WHERE customer_id = c.id), 0)
             ) as total_spent,
             COALESCE((SELECT SUM(late_fee) FROM bookings WHERE customer_id = c.id), 0) as total_late_fees,
             c.is_blacklisted
      FROM customers c
      LEFT JOIN bookings b ON b.customer_id = c.id
      LEFT JOIN sales s ON s.customer_id = c.id
      GROUP BY c.id
      ORDER BY total_spent DESC
      LIMIT ?
    `, [limit]);
  }
}

const reportsEngineService = new ReportsEngineService();

module.exports = {
  ReportsEngineService,
  reportsEngineService
};

