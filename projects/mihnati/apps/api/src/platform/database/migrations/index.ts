import { getDb } from '../connection.js';
import { logger } from '../../logging/logger.js';

/**
 * Migration registry — each migration has a unique version key and an up() function.
 * Migrations are applied in order and recorded in a `_migrations` collection.
 */
export interface Migration {
  version: string;
  description: string;
  up: () => Promise<void>;
}

const migrations: Migration[] = [
  {
    version: '001',
    description: 'Create foundation collections and indexes',
    up: async () => {
      const db = getDb();

      // Domain events — append-only lifecycle history
      const domainEvents = db.collection('domain_events');
      await domainEvents.createIndex(
        { aggregateType: 1, aggregateId: 1, version: 1 },
        { unique: true, name: 'idx_domain_events_aggregate_version' }
      );
      await domainEvents.createIndex(
        { correlationId: 1 },
        { name: 'idx_domain_events_correlation' }
      );
      await domainEvents.createIndex(
        { occurredAt: 1 },
        { name: 'idx_domain_events_occurred' }
      );

      // Idempotency records — 30-day TTL response cache
      const idempotencyRecords = db.collection('idempotency_records');
      await idempotencyRecords.createIndex(
        { principalId: 1, operationKey: 1, operationName: 1 },
        { unique: true, name: 'idx_idempotency_records_scope' }
      );
      await idempotencyRecords.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, name: 'idx_idempotency_records_ttl' }
      );

      // Idempotency claims — durable uniqueness beyond 30-day window
      const idempotencyClaims = db.collection('idempotency_claims');
      await idempotencyClaims.createIndex(
        { principalSurrogate: 1, operationName: 1, apiVersion: 1, keyDigest: 1 },
        { unique: true, name: 'idx_idempotency_claims_scope' }
      );

      // Outbox events — transactional event delivery
      const outboxEvents = db.collection('outbox_events');
      await outboxEvents.createIndex(
        { deliveryState: 1, nextAttemptAt: 1 },
        { name: 'idx_outbox_delivery' }
      );
      await outboxEvents.createIndex(
        { aggregateType: 1, aggregateId: 1 },
        { name: 'idx_outbox_aggregate' }
      );

      // Admin audit logs — append-only
      const auditLogs = db.collection('admin_audit_logs');
      await auditLogs.createIndex(
        { targetType: 1, targetId: 1, createdAt: 1 },
        { name: 'idx_audit_target' }
      );
      await auditLogs.createIndex(
        { actorId: 1, createdAt: 1 },
        { name: 'idx_audit_actor' }
      );

      logger.info('Migration 001: Foundation collections and indexes created', {
        action: 'migration:applied',
        version: '001',
      });
    },
  },
  {
    version: '002',
    description: 'Create users, sessions, and otp_challenges indexes',
    up: async () => {
      const db = getDb();

      // Users — unique normalized phone, partial unique email
      const users = db.collection('users');
      await users.createIndex(
        { phone: 1 },
        { unique: true, name: 'idx_users_phone_unique' }
      );
      await users.createIndex(
        { email: 1 },
        {
          unique: true,
          partialFilterExpression: { email: { $exists: true, $type: 'string' } },
          name: 'idx_users_email_partial_unique',
        }
      );
      await users.createIndex({ status: 1 }, { name: 'idx_users_status' });

      // Sessions — user lookup, family, and TTL
      const sessions = db.collection('sessions');
      await sessions.createIndex({ userId: 1, isRevoked: 1 }, { name: 'idx_sessions_user' });
      await sessions.createIndex({ tokenFamily: 1 }, { name: 'idx_sessions_family' });
      await sessions.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, name: 'idx_sessions_ttl' }
      );

      // OTP Challenges — phone lookup, TTL
      const otpChallenges = db.collection('otp_challenges');
      await otpChallenges.createIndex(
        { phone: 1, createdAt: -1 },
        { name: 'idx_otp_phone_created' }
      );
      await otpChallenges.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, name: 'idx_otp_ttl' }
      );

      logger.info('Migration 002: Users, sessions, and OTP indexes created', {
        action: 'migration:applied',
        version: '002',
      });
    },
  },
  {
    version: '003',
    description: 'Create user_role_assignments and profile collections and indexes',
    up: async () => {
      const db = getDb();

      // user_role_assignments — sole source of truth for roles. Unique (userId, roleKey)
      const roleAssignments = db.collection('user_role_assignments');
      await roleAssignments.createIndex(
        { userId: 1, roleKey: 1 },
        { unique: true, name: 'idx_user_role_unique' }
      );
      await roleAssignments.createIndex(
        { userId: 1, status: 1 },
        { name: 'idx_user_role_status' }
      );

      // customer_profiles — unique userId
      const customerProfiles = db.collection('customer_profiles');
      await customerProfiles.createIndex(
        { userId: 1 },
        { unique: true, name: 'idx_customer_profile_user_unique' }
      );

      // professional_profiles — unique userId, unique slug
      const proProfiles = db.collection('professional_profiles');
      await proProfiles.createIndex(
        { userId: 1 },
        { unique: true, name: 'idx_pro_profile_user_unique' }
      );
      await proProfiles.createIndex(
        { slug: 1 },
        { unique: true, sparse: true, name: 'idx_pro_profile_slug_unique' }
      );
      await proProfiles.createIndex(
        { verificationStatus: 1 },
        { name: 'idx_pro_verification_status' }
      );

      // merchant_profiles — unique userId
      const merchantProfiles = db.collection('merchant_profiles');
      await merchantProfiles.createIndex(
        { userId: 1 },
        { unique: true, name: 'idx_merchant_profile_user_unique' }
      );
      await merchantProfiles.createIndex(
        { verificationStatus: 1 },
        { name: 'idx_merchant_verification_status' }
      );

      logger.info('Migration 003: user_role_assignments and profile indexes created', {
        action: 'migration:applied',
        version: '003',
      });
    },
  },
  {
    version: '004',
    description: 'Create geography, addresses, and taxonomy collections and indexes',
    up: async () => {
      const db = getDb();

      // Governorates
      const governorates = db.collection('governorates');
      await governorates.createIndex({ code: 1 }, { unique: true, name: 'idx_gov_code_unique' });

      // Localities
      const localities = db.collection('localities');
      await localities.createIndex(
        { governorateId: 1, parentId: 1 },
        { name: 'idx_loc_gov_parent' }
      );
      await localities.createIndex({ normalizedSlug: 1 }, { name: 'idx_loc_slug' });

      // Addresses (private by default)
      const addresses = db.collection('addresses');
      await addresses.createIndex({ ownerId: 1, isDefault: -1 }, { name: 'idx_address_owner_default' });

      // Categories (taxonomy tree)
      const categories = db.collection('categories');
      await categories.createIndex(
        { type: 1, parentId: 1, normalizedSlug: 1 },
        { unique: true, name: 'idx_cat_type_parent_slug' }
      );
      await categories.createIndex({ status: 1 }, { name: 'idx_cat_status' });

      // Specialties
      const specialties = db.collection('specialties');
      await specialties.createIndex({ categoryId: 1 }, { name: 'idx_spec_category' });

      logger.info('Migration 004: Geography, addresses, and taxonomy indexes created', {
        action: 'migration:applied',
        version: '004',
      });
    },
  },
  {
    version: '005',
    description: 'Create verification_cases and portfolio_items collections and indexes',
    up: async () => {
      const db = getDb();

      // verification_cases
      const verificationCases = db.collection('verification_cases');
      await verificationCases.createIndex(
        { userId: 1, profileType: 1 },
        { name: 'idx_verif_user_type' }
      );
      await verificationCases.createIndex(
        { status: 1, createdAt: -1 },
        { name: 'idx_verif_status_created' }
      );
      await verificationCases.createIndex(
        { assignedReviewerId: 1 },
        { sparse: true, name: 'idx_verif_reviewer' }
      );

      // portfolio_items
      const portfolioItems = db.collection('portfolio_items');
      await portfolioItems.createIndex(
        { professionalProfileId: 1, sortOrder: 1 },
        { name: 'idx_portfolio_profile_sort' }
      );

      logger.info('Migration 005: verification_cases and portfolio_items indexes created', {
        action: 'migration:applied',
        version: '005',
      });
    },
  },
  {
    version: '006',
    description: 'Create services collection and search indexes',
    up: async () => {
      const db = getDb();

      const services = db.collection('services');
      await services.createIndex(
        { professionalProfileId: 1, status: 1 },
        { name: 'idx_services_pro_status' }
      );
      await services.createIndex(
        { status: 1, categoryId: 1, specialtyId: 1 },
        { name: 'idx_services_status_category' }
      );
      await services.createIndex(
        { status: 1, governorateId: 1, localityId: 1 },
        { name: 'idx_services_status_location' }
      );
      await services.createIndex(
        { status: 1, createdAt: -1 },
        { name: 'idx_services_status_created' }
      );
      await services.createIndex(
        { title: 'text', description: 'text' },
        { name: 'idx_services_text_search', default_language: 'none' }
      );

      logger.info('Migration 006: services collection and indexes created', {
        action: 'migration:applied',
        version: '006',
      });
    },
  },
  {
    version: '007',
    description: 'Create service_requests, offers, and service_orders collections and indexes',
    up: async () => {
      const db = getDb();

      // service_requests
      const requests = db.collection('service_requests');
      await requests.createIndex(
        { customerId: 1, status: 1 },
        { name: 'idx_requests_customer_status' }
      );
      await requests.createIndex(
        { status: 1, categoryId: 1, governorateId: 1, createdAt: -1 },
        { name: 'idx_requests_opportunity_feed' }
      );
      await requests.createIndex(
        { targetProfessionalId: 1, status: 1 },
        { sparse: true, name: 'idx_requests_target_pro' }
      );

      // offers
      const offers = db.collection('offers');
      await offers.createIndex(
        { serviceRequestId: 1, cycle: 1, professionalProfileId: 1 },
        { unique: true, name: 'idx_offers_request_cycle_pro_unique' }
      );
      await offers.createIndex(
        { professionalProfileId: 1, status: 1 },
        { name: 'idx_offers_pro_status' }
      );
      await offers.createIndex(
        { serviceRequestId: 1, status: 1 },
        { name: 'idx_offers_request_status' }
      );

      // service_orders
      const orders = db.collection('service_orders');
      await orders.createIndex(
        { serviceRequestId: 1 },
        { unique: true, name: 'idx_orders_request_unique' }
      );
      await orders.createIndex(
        { customerId: 1, status: 1 },
        { name: 'idx_orders_customer_status' }
      );
      await orders.createIndex(
        { professionalId: 1, status: 1 },
        { name: 'idx_orders_pro_status' }
      );

      logger.info('Migration 007: service_requests, offers, and service_orders indexes created', {
        action: 'migration:applied',
        version: '007',
      });
    },
  },
  {
    version: '008',
    description: 'Create appointments, order_change_requests, and address_consent_logs indexes',
    up: async () => {
      const db = getDb();

      // appointments
      const appointments = db.collection('appointments');
      await appointments.createIndex(
        { serviceOrderId: 1, status: 1 },
        { name: 'idx_appointments_order_status' }
      );
      await appointments.createIndex(
        { scheduledAt: 1 },
        { name: 'idx_appointments_scheduled_at' }
      );

      // order_change_requests
      const changeRequests = db.collection('order_change_requests');
      await changeRequests.createIndex(
        { serviceOrderId: 1, status: 1 },
        { name: 'idx_change_requests_order_status' }
      );

      // address_consent_logs
      const consentLogs = db.collection('address_consent_logs');
      await consentLogs.createIndex(
        { serviceOrderId: 1, createdAt: -1 },
        { name: 'idx_consent_logs_order_created' }
      );

      logger.info('Migration 008: appointments and change_requests indexes created', {
        action: 'migration:applied',
        version: '008',
      });
    },
  },
  {
    version: '009',
    description: 'Create conversations, messages, notifications, and reports indexes',
    up: async () => {
      const db = getDb();

      // conversations
      const conversations = db.collection('conversations');
      await conversations.createIndex(
        { contextType: 1, contextId: 1 },
        { name: 'idx_conversations_context' }
      );
      await conversations.createIndex(
        { participants: 1, updatedAt: -1 },
        { name: 'idx_conversations_participants_updated' }
      );

      // messages
      const messages = db.collection('messages');
      await messages.createIndex(
        { conversationId: 1, createdAt: 1 },
        { name: 'idx_messages_conversation_created' }
      );

      // notifications
      const notifications = db.collection('notifications');
      await notifications.createIndex(
        { userId: 1, isRead: 1, createdAt: -1 },
        { name: 'idx_notifications_user_unread' }
      );

      // conversation_reports
      const reports = db.collection('conversation_reports');
      await reports.createIndex(
        { conversationId: 1, status: 1 },
        { name: 'idx_reports_conversation_status' }
      );

      logger.info('Migration 009: conversations, messages, notifications indexes created', {
        action: 'migration:applied',
        version: '009',
      });
    },
  },
  {
    version: '010',
    description: 'Create stores and products indexes',
    up: async () => {
      const db = getDb();

      // stores
      const stores = db.collection('stores');
      await stores.createIndex(
        { merchantProfileId: 1 },
        { unique: true, name: 'idx_stores_merchant_profile_unique' }
      );
      await stores.createIndex(
        { slug: 1 },
        { unique: true, name: 'idx_stores_slug_unique' }
      );
      await stores.createIndex(
        { status: 1, governorateId: 1 },
        { name: 'idx_stores_status_governorate' }
      );

      // products
      const products = db.collection('products');
      await products.createIndex(
        { storeId: 1, sku: 1 },
        { unique: true, name: 'idx_products_store_sku_unique' }
      );
      await products.createIndex(
        { storeId: 1, status: 1 },
        { name: 'idx_products_store_status' }
      );
      await products.createIndex(
        { categoryId: 1, status: 1 },
        { name: 'idx_products_category_status' }
      );
      await products.createIndex(
        { status: 1, price: 1 },
        { name: 'idx_products_status_price' }
      );

      logger.info('Migration 010: stores and products indexes created', {
        action: 'migration:applied',
        version: '010',
      });
    },
  },
  {
    version: '011',
    description: 'Create carts, customer_addresses, merchant_orders, and idempotency indexes',
    up: async () => {
      const db = getDb();

      // carts
      const carts = db.collection('carts');
      await carts.createIndex(
        { customerId: 1 },
        { unique: true, name: 'idx_carts_customer_unique' }
      );

      // customer_addresses
      const addresses = db.collection('customer_addresses');
      await addresses.createIndex(
        { customerId: 1, createdAt: -1 },
        { name: 'idx_addresses_customer_created' }
      );

      // merchant_orders
      const merchantOrders = db.collection('merchant_orders');
      await merchantOrders.createIndex(
        { customerId: 1, createdAt: -1 },
        { name: 'idx_merchant_orders_customer' }
      );
      await merchantOrders.createIndex(
        { storeId: 1, createdAt: -1 },
        { name: 'idx_merchant_orders_store' }
      );
      await merchantOrders.createIndex(
        { merchantUserId: 1, status: 1 },
        { name: 'idx_merchant_orders_merchant_status' }
      );

      // idempotency_claims
      const idempotency = db.collection('idempotency_claims');
      await idempotency.createIndex(
        { key: 1, principalId: 1, operation: 1 },
        { unique: true, name: 'idx_idempotency_key_principal_op_unique' }
      );
      await idempotency.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, name: 'idx_idempotency_ttl' }
      );

      logger.info('Migration 011: carts, customer_addresses, merchant_orders, idempotency indexes created', {
        action: 'migration:applied',
        version: '011',
      });
    },
  },
  {
    version: '012',
    description: 'Create inventory_movements and inventory_reservations indexes',
    up: async () => {
      const db = getDb();

      // inventory_movements
      const movements = db.collection('inventory_movements');
      await movements.createIndex(
        { productId: 1, createdAt: -1 },
        { name: 'idx_movements_product_created' }
      );
      await movements.createIndex(
        { storeId: 1, createdAt: -1 },
        { name: 'idx_movements_store_created' }
      );

      // inventory_reservations
      const reservations = db.collection('inventory_reservations');
      await reservations.createIndex(
        { orderId: 1, productId: 1 },
        { unique: true, name: 'idx_reservations_order_product_unique' }
      );
      await reservations.createIndex(
        { status: 1, expiresAt: 1 },
        { name: 'idx_reservations_status_expires' }
      );
      await reservations.createIndex(
        { storeId: 1, status: 1 },
        { name: 'idx_reservations_store_status' }
      );

      logger.info('Migration 012: inventory_movements and inventory_reservations indexes created', {
        action: 'migration:applied',
        version: '012',
      });
    },
  },
  {
    version: '013',
    description: 'Add compound indexes for merchant_orders status and fulfillment queries',
    up: async () => {
      const db = getDb();
      const orders = db.collection('merchant_orders');
      await orders.createIndex(
        { storeId: 1, status: 1, createdAt: -1 },
        { name: 'idx_merchant_orders_store_status_created' }
      );
      await orders.createIndex(
        { customerId: 1, status: 1, createdAt: -1 },
        { name: 'idx_merchant_orders_customer_status_created' }
      );

      logger.info('Migration 013: merchant_orders compound indexes created', {
        action: 'migration:applied',
        version: '013',
      });
    },
  },
  {
    version: '014',
    description: 'Add indexes for cod_reports and cod_disputes collections',
    up: async () => {
      const db = getDb();

      // cod_reports indexes
      const codReports = db.collection('cod_reports');
      await codReports.createIndex(
        { orderId: 1, createdAt: -1 },
        { name: 'idx_cod_reports_order_created' }
      );
      await codReports.createIndex(
        { merchantUserId: 1, createdAt: -1 },
        { name: 'idx_cod_reports_merchant_created' }
      );
      await codReports.createIndex(
        { storeId: 1, createdAt: -1 },
        { name: 'idx_cod_reports_store_created' }
      );

      // cod_disputes indexes
      const codDisputes = db.collection('cod_disputes');
      await codDisputes.createIndex(
        { orderId: 1 },
        { name: 'idx_cod_disputes_order' }
      );
      await codDisputes.createIndex(
        { customerId: 1, createdAt: -1 },
        { name: 'idx_cod_disputes_customer_created' }
      );
      await codDisputes.createIndex(
        { status: 1, createdAt: -1 },
        { name: 'idx_cod_disputes_status_created' }
      );

      logger.info('Migration 014: cod_reports and cod_disputes indexes created', {
        action: 'migration:applied',
        version: '014',
      });
    },
  },
  {
    version: '015',
    description: 'Add indexes for reviews collection with unique subject+parties constraint',
    up: async () => {
      const db = getDb();

      const reviews = db.collection('reviews');
      await reviews.createIndex(
        { subjectType: 1, subjectId: 1, reviewerId: 1, revieweeId: 1 },
        { unique: true, name: 'idx_reviews_subject_parties_unique' }
      );
      await reviews.createIndex(
        { revieweeId: 1, status: 1, createdAt: -1 },
        { name: 'idx_reviews_reviewee_status_created' }
      );
      await reviews.createIndex(
        { subjectType: 1, subjectId: 1 },
        { name: 'idx_reviews_subject' }
      );
      await reviews.createIndex(
        { status: 1, createdAt: -1 },
        { name: 'idx_reviews_status_created' }
      );

      logger.info('Migration 015: reviews unique and query indexes created', {
        action: 'migration:applied',
        version: '015',
      });
    },
  },
  {
    version: '016',
    description: 'Add indexes for support_tickets, support_messages, reports, disputes, and return_requests',
    up: async () => {
      const db = getDb();

      // support_tickets
      const supportTickets = db.collection('support_tickets');
      await supportTickets.createIndex({ ticketNumber: 1 }, { unique: true, name: 'idx_support_tickets_number_unique' });
      await supportTickets.createIndex({ userId: 1, createdAt: -1 }, { name: 'idx_support_tickets_user_created' });
      await supportTickets.createIndex({ status: 1, createdAt: -1 }, { name: 'idx_support_tickets_status_created' });
      await supportTickets.createIndex({ assignedStaffId: 1 }, { sparse: true, name: 'idx_support_tickets_assigned' });

      // support_messages
      const supportMessages = db.collection('support_messages');
      await supportMessages.createIndex({ ticketId: 1, createdAt: 1 }, { name: 'idx_support_messages_ticket_created' });

      // reports
      const reports = db.collection('reports');
      await reports.createIndex({ reporterId: 1, createdAt: -1 }, { name: 'idx_reports_reporter_created' });
      await reports.createIndex({ status: 1, targetType: 1 }, { name: 'idx_reports_status_target' });
      await reports.createIndex({ targetType: 1, targetId: 1 }, { name: 'idx_reports_target_unique' });

      // disputes
      const disputes = db.collection('disputes');
      await disputes.createIndex({ disputeNumber: 1 }, { unique: true, name: 'idx_disputes_number_unique' });
      await disputes.createIndex({ subjectType: 1, subjectId: 1 }, { name: 'idx_disputes_subject' });
      await disputes.createIndex({ initiatorId: 1, createdAt: -1 }, { name: 'idx_disputes_initiator_created' });
      await disputes.createIndex({ respondentId: 1, createdAt: -1 }, { name: 'idx_disputes_respondent_created' });
      await disputes.createIndex({ status: 1, createdAt: -1 }, { name: 'idx_disputes_status_created' });

      // return_requests
      const returnRequests = db.collection('return_requests');
      await returnRequests.createIndex({ returnNumber: 1 }, { unique: true, name: 'idx_returns_number_unique' });
      await returnRequests.createIndex({ customerId: 1, createdAt: -1 }, { name: 'idx_returns_customer_created' });
      await returnRequests.createIndex({ merchantId: 1, createdAt: -1 }, { name: 'idx_returns_merchant_created' });
      await returnRequests.createIndex({ orderId: 1 }, { name: 'idx_returns_order' });
      await returnRequests.createIndex({ status: 1, createdAt: -1 }, { name: 'idx_returns_status_created' });

      logger.info('Migration 016: complaints, disputes, and returns indexes created', {
        action: 'migration:applied',
        version: '016',
      });
    },
  },
  {
    version: '017',
    description: 'E18: Create indexes for commission_rules, commission_snapshots, subscription_plans, subscriptions, and subscription_invoices',
    up: async () => {
      const db = getDb();

      // commission_rules
      const commissionRules = db.collection('commission_rules');
      await commissionRules.createIndex({ scope: 1, categoryId: 1, status: 1 }, { name: 'idx_comm_rules_scope_cat_status' });
      await commissionRules.createIndex({ status: 1, effectiveFrom: 1, effectiveTo: 1 }, { name: 'idx_comm_rules_effective' });

      // commission_snapshots
      const commissionSnapshots = db.collection('commission_snapshots');
      await commissionSnapshots.createIndex({ orderId: 1 }, { unique: true, name: 'idx_comm_snapshots_order_unique' });
      await commissionSnapshots.createIndex({ orderType: 1, calculatedAt: -1 }, { name: 'idx_comm_snapshots_type_date' });
      await commissionSnapshots.createIndex({ collectionStatus: 1 }, { name: 'idx_comm_snapshots_collection_status' });

      // subscription_plans
      const subscriptionPlans = db.collection('subscription_plans');
      await subscriptionPlans.createIndex({ planCode: 1 }, { unique: true, name: 'idx_sub_plans_code_unique' });
      await subscriptionPlans.createIndex({ targetRole: 1, isActive: 1 }, { name: 'idx_sub_plans_role_active' });

      // subscriptions
      const subscriptions = db.collection('subscriptions');
      await subscriptions.createIndex({ userId: 1, roleKey: 1, status: 1 }, { name: 'idx_subs_user_role_status' });
      await subscriptions.createIndex({ currentPeriodEnd: 1 }, { name: 'idx_subs_period_end' });

      // subscription_invoices
      const subscriptionInvoices = db.collection('subscription_invoices');
      await subscriptionInvoices.createIndex({ invoiceNumber: 1 }, { unique: true, name: 'idx_sub_inv_number_unique' });
      await subscriptionInvoices.createIndex({ subscriptionId: 1, createdAt: -1 }, { name: 'idx_sub_inv_sub_created' });
      await subscriptionInvoices.createIndex({ providerEventId: 1 }, { sparse: true, name: 'idx_sub_inv_provider_event' });

      logger.info('Migration 017: commissions and subscriptions indexes created', {
        action: 'migration:applied',
        version: '017',
      });
    },
  },
  {
    version: '018',
    description: 'E19: Create indexes for ad_campaigns and ad_delivery_events',
    up: async () => {
      const db = getDb();

      // ad_campaigns
      const adCampaigns = db.collection('ad_campaigns');
      await adCampaigns.createIndex({ advertiserUserId: 1, status: 1 }, { name: 'idx_ad_camps_user_status' });
      await adCampaigns.createIndex({ status: 1, startDate: 1, endDate: 1 }, { name: 'idx_ad_camps_active_window' });
      await adCampaigns.createIndex({ campaignType: 1, status: 1 }, { name: 'idx_ad_camps_type_status' });

      // ad_delivery_events
      const adDeliveryEvents = db.collection('ad_delivery_events');
      await adDeliveryEvents.createIndex({ campaignId: 1, recordedAt: -1 }, { name: 'idx_ad_events_camp_recorded' });
      await adDeliveryEvents.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true, name: 'idx_ad_events_idempotency_unique' });

      logger.info('Migration 018: advertising and delivery event indexes created', {
        action: 'migration:applied',
        version: '018',
      });
    },
  },
  {
    version: '019',
    description: 'E20: Create indexes for analytics_daily_snapshots and analytics_exports',
    up: async () => {
      const db = getDb();

      // analytics_daily_snapshots
      const snapshots = db.collection('analytics_daily_snapshots');
      await snapshots.createIndex({ date: 1 }, { unique: true, name: 'idx_analytics_daily_date_unique' });
      await snapshots.createIndex({ rebuiltAt: -1 }, { name: 'idx_analytics_daily_rebuilt' });

      // analytics_exports
      const exportsCol = db.collection('analytics_exports');
      await exportsCol.createIndex({ requestedBy: 1, createdAt: -1 }, { name: 'idx_analytics_exports_user' });
      await exportsCol.createIndex({ expiresAt: 1 }, { name: 'idx_analytics_exports_expiry' });

      logger.info('Migration 019: analytics snapshots and export indexes created', {
        action: 'migration:applied',
        version: '019',
      });
    },
  },
];

/**
 * Run all pending migrations in order.
 */
export async function runMigrations(): Promise<void> {
  const db = getDb();
  const migrationsCol = db.collection('_migrations');

  // Ensure migration ledger index
  await migrationsCol.createIndex(
    { version: 1 },
    { unique: true, name: 'idx_migrations_version' }
  );

  for (const migration of migrations) {
    const existing = await migrationsCol.findOne({ version: migration.version });
    if (existing) {
      logger.info(`Migration ${migration.version} already applied, skipping`, {
        action: 'migration:skip',
        version: migration.version,
      });
      continue;
    }

    logger.info(`Applying migration ${migration.version}: ${migration.description}`, {
      action: 'migration:start',
      version: migration.version,
    });

    await migration.up();

    await migrationsCol.insertOne({
      version: migration.version,
      description: migration.description,
      appliedAt: new Date(),
    });

    logger.info(`Migration ${migration.version} applied successfully`, {
      action: 'migration:complete',
      version: migration.version,
    });
  }
}

export { migrations };

