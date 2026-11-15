import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/bootstrap/app.js';
import { loadConfig, type AppConfig } from '../../../src/platform/config/env.js';
import { connectMongo, closeMongo, getDb } from '../../../src/platform/database/connection.js';
import { geographyService } from '../../../src/modules/geography/geography.service.js';
import { taxonomyService } from '../../../src/modules/taxonomy/taxonomy.service.js';
import type { Express } from 'express';

let app: Express;
let config: AppConfig;

beforeAll(async () => {
  config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e11_commerce',
    MONGODB_DB_NAME: 'mihnati_test_e11_commerce',
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
    LOG_LEVEL: 'error',
  });

  await connectMongo(config);
  const db = getDb();
  await db.collection('users').deleteMany({});
  await db.collection('sessions').deleteMany({});
  await db.collection('user_role_assignments').deleteMany({});
  await db.collection('merchant_profiles').deleteMany({});
  await db.collection('stores').deleteMany({});
  await db.collection('products').deleteMany({});
  await db.collection('carts').deleteMany({});
  await db.collection('customer_addresses').deleteMany({});
  await db.collection('merchant_orders').deleteMany({});
  await db.collection('idempotency_claims').deleteMany({});
  await db.collection('admin_audit_logs').deleteMany({});
  await db.collection('governorates').deleteMany({});
  await db.collection('localities').deleteMany({});
  await db.collection('categories').deleteMany({});

  await geographyService.seedIfEmpty();
  await taxonomyService.seedIfEmpty();

  app = createApp(config);
});

afterAll(async () => {
  await closeMongo();
});

describe('E11 Cart & Checkout (One-Store-Per-Cart & COD)', () => {
  let customerToken: string;
  let customerId: string;
  let merchantAToken: string;
  let merchantBToken: string;

  let storeAId: string;
  let storeBId: string;
  let productA1Id: string;
  let productA2Id: string;
  let productB1Id: string;

  let deliveryAddressId: string;
  let cairoGovId: string;
  let productCatId: string;

  beforeAll(async () => {
    const db = getDb();

    // 1. Get Cairo governorate and product category
    const govs = await geographyService.listGovernorates();
    cairoGovId = govs.find((g) => g.code === 'CAI')!._id;

    const cats = await taxonomyService.listCategories({ type: 'product' });
    productCatId = cats[0].id;

    // 2. Create Merchant A with active store and products
    const mAReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01099990001',
      password: 'MerchantPass123!',
      name: 'تاجر الأدوات الكهربائية',
    });
    const mALogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01099990001',
      password: 'MerchantPass123!',
    });
    merchantAToken = mALogin.body.data.accessToken;
    await request(app)
      .post('/api/v1/me/roles/merchant/activate')
      .set('Authorization', `Bearer ${merchantAToken}`);
    await db.collection('merchant_profiles').updateOne(
      { userId: mAReg.body.data.id },
      { $set: { verificationStatus: 'verified' } }
    );

    const storeARes = await request(app)
      .post('/api/v1/stores/me')
      .set('Authorization', `Bearer ${merchantAToken}`)
      .send({
        nameAr: 'متجر النور للمعدات',
        nameEn: 'Al-Noor Hardware',
        slug: 'al-noor-hardware',
        governorateId: cairoGovId,
        categories: [productCatId],
      });
    storeAId = storeARes.body.data.id;
    // Set store active
    await db.collection('stores').updateOne({ _id: storeAId }, { $set: { status: 'active' } });

    // Products for Store A
    const pA1Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${merchantAToken}`)
      .send({
        titleAr: 'دريل بوش لاسلكي 18 فولت',
        titleEn: 'Bosch Cordless Drill 18V',
        slug: 'bosch-drill-18v',
        categoryId: productCatId,
        sku: 'DRILL-BOSCH-18V',
        price: 15000, // 150.00 EGP
        stockQuantity: 10,
      });
    productA1Id = pA1Res.body.data.id;
    await db.collection('products').updateOne({ _id: productA1Id }, { $set: { status: 'active' } });

    const pA2Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${merchantAToken}`)
      .send({
        titleAr: 'طقم بنط دريل أصلية 13 قطعة',
        titleEn: 'Drill Bits Set 13pcs',
        slug: 'drill-bits-13pcs',
        categoryId: productCatId,
        sku: 'BITS-SET-13',
        price: 25000, // 250.00 EGP
        stockQuantity: 5,
      });
    productA2Id = pA2Res.body.data.id;
    await db.collection('products').updateOne({ _id: productA2Id }, { $set: { status: 'active' } });

    // 3. Create Merchant B with active store and products
    const mBReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01099990002',
      password: 'MerchantPass123!',
      name: 'تاجر الدهانات والعدد',
    });
    const mBLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01099990002',
      password: 'MerchantPass123!',
    });
    merchantBToken = mBLogin.body.data.accessToken;
    await request(app)
      .post('/api/v1/me/roles/merchant/activate')
      .set('Authorization', `Bearer ${merchantBToken}`);
    await db.collection('merchant_profiles').updateOne(
      { userId: mBReg.body.data.id },
      { $set: { verificationStatus: 'verified' } }
    );

    const storeBRes = await request(app)
      .post('/api/v1/stores/me')
      .set('Authorization', `Bearer ${merchantBToken}`)
      .send({
        nameAr: 'متجر الأمل للدهانات',
        nameEn: 'Al-Amal Paints',
        slug: 'al-amal-paints',
        governorateId: cairoGovId,
        categories: [productCatId],
      });
    storeBId = storeBRes.body.data.id;
    await db.collection('stores').updateOne({ _id: storeBId }, { $set: { status: 'active' } });

    const pB1Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${merchantBToken}`)
      .send({
        titleAr: 'جالون دهان بلاستيك مط',
        titleEn: 'Plastic Matte Paint Gallon',
        slug: 'paint-gallon-matte',
        categoryId: productCatId,
        sku: 'PAINT-MATTE-GL',
        price: 30000, // 300.00 EGP
        stockQuantity: 8,
      });
    productB1Id = pB1Res.body.data.id;
    await db.collection('products').updateOne({ _id: productB1Id }, { $set: { status: 'active' } });

    // 4. Create Customer
    const custReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01099990003',
      password: 'CustomerPass123!',
      name: 'عميل المتجر',
    });
    customerId = custReg.body.data.id;
    const custLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01099990003',
      password: 'CustomerPass123!',
    });
    customerToken = custLogin.body.data.accessToken;
  });

  // ══════════════════════════════════════════════════════════════
  // ── Delivery Addresses ──
  // ══════════════════════════════════════════════════════════════

  describe('Customer Delivery Addresses', () => {
    it('should create a delivery address for customer', async () => {
      const res = await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          label: 'المنزل',
          governorateId: cairoGovId,
          addressText: 'شارع 9 المعادي، برج الياسمين',
          building: '14',
          floor: '3',
          apartment: '302',
          phone: '01099990003',
          isDefault: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.label).toBe('المنزل');
      deliveryAddressId = res.body.data.id;
    });

    it('should list customer addresses', async () => {
      const res = await request(app)
        .get('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── E11-T01: Cart Operations & Calculations ──
  // ══════════════════════════════════════════════════════════════

  describe('E11-T01: Cart Operations & Calculations', () => {
    it('should get or initialize empty cart for customer', async () => {
      const res = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.activeStoreId).toBeNull();
      expect(res.body.data.subtotalPiastres).toBe(0);
    });

    it('should add item from Store A to cart with server-side price', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          productId: productA1Id,
          quantity: 2,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.activeStoreId).toBe(storeAId);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].quantity).toBe(2);
      expect(res.body.data.items[0].pricePiastres).toBe(15000);
      expect(res.body.data.subtotalPiastres).toBe(30000); // 2 * 15000
    });

    it('should add second item from same Store A and recompute subtotal', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          productId: productA2Id,
          quantity: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.items.length).toBe(2);
      expect(res.body.data.subtotalPiastres).toBe(55000); // 30000 + 25000
    });

    it('should reject quantity exceeding available stock (409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          productId: productA2Id,
          quantity: 10, // Stock is only 5
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    });

    it('should update item quantity in cart', async () => {
      const res = await request(app)
        .patch(`/api/v1/cart/items/${productA1Id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ quantity: 1 });

      expect(res.status).toBe(200);
      // Now quantity of A1 is 1 (15000) + A2 is 1 (25000) = 40000
      expect(res.body.data.subtotalPiastres).toBe(40000);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── E11-T01: Store Mismatch & Switch-Store Flow ──
  // ══════════════════════════════════════════════════════════════

  describe('E11-T01: Cross-Store Mismatch & Confirmed Switch', () => {
    it('should reject adding product from Store B with CART_STORE_MISMATCH without mutating cart (AC-E11.1)', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          productId: productB1Id, // From Store B!
          quantity: 1,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CART_STORE_MISMATCH');
      expect(res.body.error.message).toContain('different stores');

      // Invariant: Verify cart was NOT mutated
      const cartCheck = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(cartCheck.body.data.activeStoreId).toBe(storeAId);
      expect(cartCheck.body.data.items.length).toBe(2);
      expect(cartCheck.body.data.subtotalPiastres).toBe(40000);
    });

    it('should reject store switch without explicit confirmation', async () => {
      const currentCart = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${customerToken}`);

      const res = await request(app)
        .post('/api/v1/cart/switch-store')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          newStoreId: storeBId,
          confirmSwitch: false, // unconfirmed
          expectedVersion: currentCart.body.data.version,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject store switch with stale cart version (STALE_VERSION)', async () => {
      const res = await request(app)
        .post('/api/v1/cart/switch-store')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          newStoreId: storeBId,
          confirmSwitch: true,
          expectedVersion: 999, // Stale version!
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('STALE_VERSION');
    });

    it('should clear old items and select Store B upon confirmed switch', async () => {
      const currentCart = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${customerToken}`);

      const res = await request(app)
        .post('/api/v1/cart/switch-store')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          newStoreId: storeBId,
          confirmSwitch: true,
          expectedVersion: currentCart.body.data.version,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.activeStoreId).toBe(storeBId);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.subtotalPiastres).toBe(0);

      // Now customer can add product from Store B cleanly
      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          productId: productB1Id,
          quantity: 2,
        });

      expect(addRes.status).toBe(201);
      expect(addRes.body.data.items.length).toBe(1);
      expect(addRes.body.data.subtotalPiastres).toBe(60000); // 2 * 30000
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── E11-T02: Checkout Quote & COD Order Creation ──
  // ══════════════════════════════════════════════════════════════

  describe('E11-T02: Checkout Quote & COD Order Creation', () => {
    it('should generate checkout quote with server-calculated delivery and total', async () => {
      const res = await request(app)
        .post('/api/v1/checkout/quote')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          deliveryAddressId,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.storeId).toBe(storeBId);
      expect(res.body.data.subtotalPiastres).toBe(60000);
      expect(res.body.data.deliveryFeePiastres).toBe(5000); // 50.00 EGP standard delivery
      expect(res.body.data.totalPiastres).toBe(65000); // 60000 + 5000
      expect(res.body.data.deliveryAddressSnapshot.addressId).toBe(deliveryAddressId);
    });

    it('should reject checkout without Idempotency-Key header', async () => {
      const res = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          deliveryAddressId,
          consentToShareDeliveryAddress: true,
          paymentMethod: 'cash_on_delivery',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Idempotency-Key');
    });

    it('should reject checkout without explicit address sharing consent', async () => {
      const res = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', 'test-key-no-consent')
        .send({
          deliveryAddressId,
          consentToShareDeliveryAddress: false, // Refused consent!
          paymentMethod: 'cash_on_delivery',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Explicit consent');
    });

    it('should create COD MerchantOrder transactionally with address snapshot and deduct stock', async () => {
      const idempotencyKey = 'checkout-key-cod-001';
      const res = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          deliveryAddressId,
          consentToShareDeliveryAddress: true,
          paymentMethod: 'cash_on_delivery',
          notes: 'الاتصال قبل التوصيل بنصف ساعة',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.orderNumber).toMatch(/^ORD-/);
      expect(res.body.data.status).toBe('created');
      expect(res.body.data.paymentMethod).toBe('cash_on_delivery');
      expect(res.body.data.paymentStatus).toBe('pending');
      expect(res.body.data.codExpectedPiastres).toBe(65000);
      expect(res.body.data.addressConsentGranted).toBe(true);
      expect(res.body.data.deliveryAddressSnapshot.addressText).toContain('المعادي');

      // Verify stock was deducted: Product B1 initial was 8, bought 2 -> now 6
      const db = getDb();
      const prodCheck = await db.collection('products').findOne({ _id: productB1Id });
      expect(prodCheck?.stockQuantity).toBe(6);

      // Verify customer cart was emptied
      const cartCheck = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(cartCheck.body.data.items).toEqual([]);
      expect(cartCheck.body.data.subtotalPiastres).toBe(0);
    });

    it('should safely return identical cached response on idempotent replay', async () => {
      const idempotencyKey = 'checkout-key-cod-001';
      const res = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          deliveryAddressId,
          consentToShareDeliveryAddress: true,
          paymentMethod: 'cash_on_delivery',
          notes: 'الاتصال قبل التوصيل بنصف ساعة',
        });

      expect(res.status).toBe(200); // 200 for idempotent replay
      expect(res.body.data.orderNumber).toMatch(/^ORD-/);

      // Invariant: Stock must NOT be deducted again (still 6)
      const db = getDb();
      const prodCheck = await db.collection('products').findOne({ _id: productB1Id });
      expect(prodCheck?.stockQuantity).toBe(6);
    });

    it('should reject reused idempotency key with different request payload (409 IDEMPOTENCY_KEY_REUSED)', async () => {
      const idempotencyKey = 'checkout-key-cod-001';
      const res = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          deliveryAddressId,
          consentToShareDeliveryAddress: true,
          paymentMethod: 'cash_on_delivery',
          notes: 'ملاحظة مختلفة تماماً', // Different payload!
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });
  });
});

