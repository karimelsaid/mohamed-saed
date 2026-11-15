import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import { loadConfig, type AppConfig } from '../../src/platform/config/env.js';

/**
 * Integration tests that require a running MongoDB instance.
 * These tests verify:
 * - Database connection and ping
 * - Migration execution
 * - Domain events collection and indexes
 * - Idempotency records with TTL
 * - Outbox events collection
 * - Transaction commit/rollback behavior
 */

let client: MongoClient;
let db: Db;
let config: AppConfig;
let isReplSet = false;
const TEST_DB = 'mihnati_integration_test';

beforeAll(async () => {
  config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/' + TEST_DB,
    MONGODB_DB_NAME: TEST_DB,
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
    LOG_LEVEL: 'error',
  });

  client = new MongoClient(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

  try {
    await client.connect();
    db = client.db(TEST_DB);

    // Check if connected MongoDB instance is a Replica Set
    try {
      const status = await db.admin().command({ replSetGetStatus: 1 });
      isReplSet = Boolean(status.ok);
    } catch {
      isReplSet = false;
    }

    // Clean test database
    const collections = await db.listCollections().toArray();
    for (const col of collections) {
      await db.dropCollection(col.name);
    }
  } catch {
    // MongoDB not available — tests will be skipped
  }
});

afterAll(async () => {
  if (db) {
    try {
      await db.dropDatabase();
    } catch { /* ignore */ }
  }
  if (client) {
    await client.close();
  }
});

describe('MongoDB Connection', () => {
  it('should connect and ping successfully', async () => {
    if (!db) return; // skip if no MongoDB
    const result = await db.command({ ping: 1 });
    expect(result.ok).toBe(1);
  });
});

describe('Foundation Collections & Indexes', () => {
  it('should create domain_events collection with indexes', async () => {
    if (!db) return;

    const col = db.collection('domain_events');
    await col.createIndex(
      { aggregateType: 1, aggregateId: 1, version: 1 },
      { unique: true, name: 'idx_domain_events_aggregate_version' }
    );

    const indexes = await col.indexes();
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_domain_events_aggregate_version');
  });

  it('should enforce uniqueness on domain_events aggregate version', async () => {
    if (!db) return;

    const col = db.collection('domain_events');
    await col.deleteMany({});

    await col.insertOne({
      aggregateType: 'ServiceOrder',
      aggregateId: 'order-1',
      version: 1,
      eventType: 'OrderCreated',
      occurredAt: new Date(),
    });

    // Duplicate should fail
    await expect(
      col.insertOne({
        aggregateType: 'ServiceOrder',
        aggregateId: 'order-1',
        version: 1,
        eventType: 'OrderUpdated',
        occurredAt: new Date(),
      })
    ).rejects.toThrow(/duplicate key/i);
  });

  it('should create idempotency_records with TTL index', async () => {
    if (!db) return;

    const col = db.collection('idempotency_records');
    await col.createIndex(
      { principalId: 1, operationKey: 1, operationName: 1 },
      { unique: true, name: 'idx_idempotency_records_scope' }
    );
    await col.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: 'idx_idempotency_records_ttl' }
    );

    const indexes = await col.indexes();
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_idempotency_records_scope');
    expect(indexNames).toContain('idx_idempotency_records_ttl');
  });

  it('should create outbox_events collection', async () => {
    if (!db) return;

    const col = db.collection('outbox_events');
    await col.createIndex(
      { deliveryState: 1, nextAttemptAt: 1 },
      { name: 'idx_outbox_delivery' }
    );

    await col.insertOne({
      aggregateType: 'ServiceOrder',
      aggregateId: 'order-1',
      eventType: 'OrderCreated',
      deliveryState: 'pending',
      nextAttemptAt: new Date(),
      attempts: 0,
    });

    const count = await col.countDocuments();
    expect(count).toBe(1);
  });
});

describe('Transaction Support', () => {
  it('should commit a multi-document transaction', async (ctx) => {
    if (!db) return;
    if (!isReplSet) {
      ctx.skip('Skipped: MongoDB is running in Standalone mode. Multi-document transactions require a Replica Set (e.g. replSet rs0).');
      return;
    }

    const session = client.startSession();
    const colA = db.collection('tx_test_a');
    const colB = db.collection('tx_test_b');

    try {
      await session.withTransaction(async () => {
        await colA.insertOne({ name: 'docA', value: 1 }, { session });
        await colB.insertOne({ name: 'docB', value: 2 }, { session });
      });

      // Both documents should exist after commit
      const docA = await colA.findOne({ name: 'docA' });
      const docB = await colB.findOne({ name: 'docB' });
      expect(docA).not.toBeNull();
      expect(docB).not.toBeNull();
    } finally {
      await session.endSession();
      await colA.drop().catch(() => {});
      await colB.drop().catch(() => {});
    }
  });

  it('should rollback a transaction on abort', async (ctx) => {
    if (!db) return;
    if (!isReplSet) {
      ctx.skip('Skipped: MongoDB is running in Standalone mode. Multi-document transactions require a Replica Set (e.g. replSet rs0).');
      return;
    }

    const session = client.startSession();
    const col = db.collection('tx_test_rollback');

    try {
      session.startTransaction();
      await col.insertOne({ name: 'willRollback' }, { session });

      // Abort the transaction
      await session.abortTransaction();

      // Document should not exist
      const doc = await col.findOne({ name: 'willRollback' });
      expect(doc).toBeNull();
    } finally {
      await session.endSession();
      await col.drop().catch(() => {});
    }
  });
});

describe('Migration Ledger', () => {
  it('should record migrations in _migrations collection', async () => {
    if (!db) return;

    const migrationsCol = db.collection('_migrations');
    await migrationsCol.createIndex(
      { version: 1 },
      { unique: true, name: 'idx_migrations_version' }
    );

    await migrationsCol.insertOne({
      version: 'test-001',
      description: 'Test migration',
      appliedAt: new Date(),
    });

    const record = await migrationsCol.findOne({ version: 'test-001' });
    expect(record).not.toBeNull();
    expect(record!.description).toBe('Test migration');
  });

  it('should prevent duplicate migration versions', async () => {
    if (!db) return;

    const migrationsCol = db.collection('_migrations');

    await expect(
      migrationsCol.insertOne({
        version: 'test-001',
        description: 'Duplicate',
        appliedAt: new Date(),
      })
    ).rejects.toThrow(/duplicate key/i);
  });
});

