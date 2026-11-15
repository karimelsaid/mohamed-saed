import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import type { AppConfig } from '../platform/config/env.js';
import {
  requestIdMiddleware,
  requestLoggerMiddleware,
  securityHeadersMiddleware,
} from '../platform/http/middleware.js';
import { globalErrorHandler } from '../platform/http/error-handler.js';
import { createHealthRouter } from '../platform/http/health.router.js';
import { NotFoundError } from '../platform/http/errors.js';
import { createAdapters } from '../platform/adapters/registry.js';
import { SessionService } from '../modules/identity/session.service.js';
import { OtpService } from '../modules/identity/otp.service.js';
import { AuthService } from '../modules/identity/auth.service.js';
import { AuthController } from '../modules/identity/auth.controller.js';
import { createAuthRouter } from '../modules/identity/auth.routes.js';
import { AccountService } from '../modules/account/account.service.js';
import { AccountController } from '../modules/account/account.controller.js';
import { createAccountRouter } from '../modules/account/account.routes.js';
import { RoleService } from '../modules/roles/role.service.js';
import { RoleController } from '../modules/roles/role.controller.js';
import { createRoleRouter } from '../modules/roles/role.routes.js';
import { ProfileService } from '../modules/profiles/profile.service.js';
import { ProfileController } from '../modules/profiles/profile.controller.js';
import { createProfileRouter } from '../modules/profiles/profile.routes.js';
import { AuditService } from '../modules/admin/audit.service.js';
import { AdminService } from '../modules/admin/admin.service.js';
import { AdminController } from '../modules/admin/admin.controller.js';
import { createAdminRouter } from '../modules/admin/admin.routes.js';
import { GeographyController } from '../modules/geography/geography.controller.js';
import { createGeographyRouter } from '../modules/geography/geography.routes.js';
import { TaxonomyController } from '../modules/taxonomy/taxonomy.controller.js';
import { createTaxonomyRouter } from '../modules/taxonomy/taxonomy.routes.js';
import { VerificationService } from '../modules/verification/verification.service.js';
import { VerificationController } from '../modules/verification/verification.controller.js';
import { createVerificationRouter } from '../modules/verification/verification.routes.js';
import { ServicesService } from '../modules/services/services.service.js';
import { ServicesController } from '../modules/services/services.controller.js';
import { createServicesRouter } from '../modules/services/services.routes.js';
import { RequestsService } from '../modules/requests/requests.service.js';
import { RequestsController } from '../modules/requests/requests.controller.js';
import { createRequestsRouter } from '../modules/requests/requests.routes.js';
import { OrdersService } from '../modules/orders/orders.service.js';
import { OrdersController } from '../modules/orders/orders.controller.js';
import { createOrdersRouter } from '../modules/orders/orders.routes.js';
import { CommunicationsService } from '../modules/communications/communications.service.js';
import { CommunicationsController } from '../modules/communications/communications.controller.js';
import { createCommunicationsRouter } from '../modules/communications/communications.routes.js';
import { StoresService } from '../modules/stores/stores.service.js';
import { StoresController } from '../modules/stores/stores.controller.js';
import { createStoresRouter } from '../modules/stores/stores.routes.js';
import { CommerceService } from '../modules/commerce/commerce.service.js';
import { CommerceController } from '../modules/commerce/commerce.controller.js';
import { createCommerceRouter } from '../modules/commerce/commerce.routes.js';
import { InventoryService } from '../modules/inventory/inventory.service.js';
import { InventoryController } from '../modules/inventory/inventory.controller.js';
import { createInventoryRouter } from '../modules/inventory/inventory.routes.js';
import { MerchantOrdersService } from '../modules/merchant-orders/merchant-orders.service.js';
import { MerchantOrdersController } from '../modules/merchant-orders/merchant-orders.controller.js';
import { createMerchantOrdersRouter } from '../modules/merchant-orders/merchant-orders.routes.js';
import { CodService } from '../modules/cod/cod.service.js';
import { CodController } from '../modules/cod/cod.controller.js';
import { createCodRouter } from '../modules/cod/cod.routes.js';
import { ReviewsService } from '../modules/reviews/reviews.service.js';
import { ReviewsController } from '../modules/reviews/reviews.controller.js';
import { createReviewsRouter } from '../modules/reviews/reviews.routes.js';
import { DisputesService } from '../modules/disputes/disputes.service.js';
import { DisputesController } from '../modules/disputes/disputes.controller.js';
import { createDisputesRouter } from '../modules/disputes/disputes.routes.js';
import { CommissionsService } from '../modules/monetization/commissions.service.js';
import { SubscriptionsService } from '../modules/monetization/subscriptions.service.js';
import { MonetizationController } from '../modules/monetization/monetization.controller.js';
import { createMonetizationRouter } from '../modules/monetization/monetization.routes.js';
import { AdvertisingService } from '../modules/advertising/advertising.service.js';
import { AdvertisingController } from '../modules/advertising/advertising.controller.js';
import { createAdvertisingRouter } from '../modules/advertising/advertising.routes.js';
import { AnalyticsService } from '../modules/analytics/analytics.service.js';
import { AnalyticsController } from '../modules/analytics/analytics.controller.js';
import { createAnalyticsRouter } from '../modules/analytics/analytics.routes.js';
import type { Request, Response, NextFunction } from 'express';

export function createApp(config: AppConfig): express.Express {
  const app = express();

  // ── Services & Adapters initialization ──
  const adapters = createAdapters(config);
  const sessionService = new SessionService(config);
  const otpService = new OtpService(adapters.otp);
  const authService = new AuthService(sessionService, otpService);
  const accountService = new AccountService(sessionService);
  const roleService = new RoleService();
  const profileService = new ProfileService();
  const auditService = new AuditService();
  const adminService = new AdminService(auditService);

  const authController = new AuthController(authService, sessionService, otpService);
  const accountController = new AccountController(accountService, authService, sessionService);
  const roleController = new RoleController(roleService);
  const profileController = new ProfileController(profileService);
  const adminController = new AdminController(auditService, sessionService, adminService);
  const geographyController = new GeographyController();
  const taxonomyController = new TaxonomyController();
  const verificationService = new VerificationService(auditService);
  const verificationController = new VerificationController(verificationService);
  const servicesService = new ServicesService(auditService, verificationService);
  const servicesController = new ServicesController(servicesService);
  const requestsService = new RequestsService(verificationService);
  const requestsController = new RequestsController(requestsService);
  const ordersService = new OrdersService(auditService);
  const ordersController = new OrdersController(ordersService);
  const commsService = new CommunicationsService(auditService);
  const commsController = new CommunicationsController(commsService);
  const storesService = new StoresService(auditService, verificationService);
  const storesController = new StoresController(storesService);
  const commerceService = new CommerceService(auditService);
  const commerceController = new CommerceController(commerceService);
  const inventoryService = new InventoryService(auditService);
  const inventoryController = new InventoryController(inventoryService);
  const merchantOrdersService = new MerchantOrdersService(auditService, inventoryService);
  const merchantOrdersController = new MerchantOrdersController(merchantOrdersService);
  const codService = new CodService(auditService);
  const codController = new CodController(codService);
  const reviewsService = new ReviewsService(auditService);
  const reviewsController = new ReviewsController(reviewsService);
  const disputesService = new DisputesService(auditService);
  const disputesController = new DisputesController(disputesService);
  const commissionsService = new CommissionsService(auditService);
  const subscriptionsService = new SubscriptionsService(auditService);
  const monetizationController = new MonetizationController(commissionsService, subscriptionsService);
  const advertisingService = new AdvertisingService(auditService);
  const advertisingController = new AdvertisingController(advertisingService);
  const analyticsService = new AnalyticsService(auditService);
  const analyticsController = new AnalyticsController(analyticsService);

  // ── Trust proxy (one hop, e.g. nginx / cloud LB) ──
  app.set('trust proxy', 1);

  // ── Security headers ──
  app.use(securityHeadersMiddleware);

  // ── CORS — explicit origins only, credentials mode ──
  const allowedOrigins = config.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-ID',
        'X-CSRF-Token',
        'Idempotency-Key',
        'If-Match',
      ],
      exposedHeaders: ['X-Request-ID'],
      maxAge: 86400,
    })
  );

  // ── Body parsers ──
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  // ── Request ID & structured logging ──
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);

  // ── API v1 routes ──
  const apiRouter = express.Router();
  apiRouter.use(createHealthRouter());
  apiRouter.use(createAuthRouter(authController, sessionService, authService));
  apiRouter.use(createAccountRouter(accountController, sessionService, authService));
  apiRouter.use(createRoleRouter(roleController, sessionService, authService));
  apiRouter.use(createProfileRouter(profileController, sessionService, authService));
  apiRouter.use(createAdminRouter(adminController, sessionService, authService));
  apiRouter.use(createGeographyRouter(geographyController, sessionService, authService));
  apiRouter.use(createTaxonomyRouter(taxonomyController, sessionService, authService));
  apiRouter.use(createVerificationRouter(verificationController, sessionService, authService));
  apiRouter.use(createServicesRouter(servicesController, sessionService, authService));
  apiRouter.use(createRequestsRouter(requestsController, sessionService, authService));
  apiRouter.use(createOrdersRouter(ordersController, sessionService, authService));
  apiRouter.use(createCommunicationsRouter(commsController, sessionService, authService));
  apiRouter.use(createStoresRouter(storesController, sessionService, authService));
  apiRouter.use(createCommerceRouter(commerceController, sessionService, authService));
  apiRouter.use(createInventoryRouter(inventoryController, sessionService, authService));
  apiRouter.use(createMerchantOrdersRouter(merchantOrdersController, sessionService, authService));
  apiRouter.use(createCodRouter(codController, sessionService, authService));
  apiRouter.use(createReviewsRouter(reviewsController, sessionService, authService));
  apiRouter.use(createDisputesRouter(disputesController, sessionService, authService));
  apiRouter.use(createMonetizationRouter(monetizationController, sessionService, authService));
  apiRouter.use(createAdvertisingRouter(advertisingController, sessionService, authService));
  apiRouter.use(createAnalyticsRouter(analyticsController, sessionService, authService));

  app.use(config.API_PREFIX, apiRouter);

  // ── Catch-all 404 for unknown routes ──
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError('The requested endpoint does not exist'));
  });

  // ── Global error handler (must be last) ──
  app.use(globalErrorHandler);

  return app;
}

