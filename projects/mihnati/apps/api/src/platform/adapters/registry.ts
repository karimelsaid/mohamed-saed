import type { AppConfig } from '../config/env.js';
import type {
  ObjectStoragePort,
  OtpPort,
  MapsPort,
  NotificationPort,
  PaymentPort,
} from './ports.js';
import {
  FakeObjectStorage,
  FakeOtp,
  FakeMaps,
  FakeNotification,
  FakePayment,
} from './fakes.js';
import { logger } from '../logging/logger.js';

export interface AdapterRegistry {
  storage: ObjectStoragePort;
  otp: OtpPort;
  maps: MapsPort;
  notification: NotificationPort;
  payment: PaymentPort;
}

/**
 * Creates the adapter registry based on config drivers.
 * E01 only supports fake adapters — live drivers are not implemented.
 */
export function createAdapters(config: AppConfig): AdapterRegistry {
  const warnIfNotFake = (name: string, driver: string) => {
    if (driver !== 'fake') {
      logger.warn(
        `Adapter "${name}" driver "${driver}" is not yet implemented. Falling back to fake adapter.`,
        { action: 'adapter:fallback', adapter: name, driver }
      );
    }
  };

  warnIfNotFake('storage', config.STORAGE_DRIVER);
  warnIfNotFake('otp', config.OTP_DRIVER);
  warnIfNotFake('maps', config.MAPS_DRIVER);
  warnIfNotFake('notification', config.NOTIFICATION_DRIVER);
  warnIfNotFake('payment', config.PAYMENT_DRIVER);

  return {
    storage: new FakeObjectStorage(),
    otp: new FakeOtp(),
    maps: new FakeMaps(),
    notification: new FakeNotification(),
    payment: new FakePayment(),
  };
}

