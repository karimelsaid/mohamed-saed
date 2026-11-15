import { MongoClient, Db, MongoClientOptions } from 'mongodb';
import { AppConfig } from '../config/env.js';
import { logger } from '../logging/logger.js';

let client: MongoClient | null = null;
let db: Db | null = null;

export interface MongoConnectionOptions {
  uri: string;
  dbName: string;
  minPoolSize: number;
  maxPoolSize: number;
  connectTimeoutMS: number;
  serverSelectionTimeoutMS: number;
}

function buildOptions(config: AppConfig): MongoConnectionOptions {
  return {
    uri: config.MONGODB_URI,
    dbName: config.MONGODB_DB_NAME,
    minPoolSize: config.MONGODB_MIN_POOL_SIZE,
    maxPoolSize: config.MONGODB_MAX_POOL_SIZE,
    connectTimeoutMS: config.MONGODB_CONNECT_TIMEOUT_MS,
    serverSelectionTimeoutMS: config.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
  };
}

export async function connectMongo(config: AppConfig): Promise<{ client: MongoClient; db: Db }> {
  const opts = buildOptions(config);

  logger.info('Connecting to MongoDB...', {
    action: 'mongo:connect',
    dbName: opts.dbName,
  });

  const clientOptions: MongoClientOptions = {
    minPoolSize: opts.minPoolSize,
    maxPoolSize: opts.maxPoolSize,
    connectTimeoutMS: opts.connectTimeoutMS,
    serverSelectionTimeoutMS: opts.serverSelectionTimeoutMS,
    retryWrites: true,
    retryReads: true,
    w: 'majority',
    readPreference: 'primaryPreferred',
  };

  client = new MongoClient(opts.uri, clientOptions);
  await client.connect();

  db = client.db(opts.dbName);

  // Verify connection with a ping
  await db.command({ ping: 1 });

  logger.info('MongoDB connected successfully', {
    action: 'mongo:connected',
    dbName: opts.dbName,
  });

  return { client, db };
}

export function getMongoClient(): MongoClient {
  if (!client) {
    throw new Error('MongoClient not initialized. Call connectMongo() first.');
  }
  return client;
}

export function getDb(): Db {
  if (!db) {
    throw new Error('Database not initialized. Call connectMongo() first.');
  }
  return db;
}

export async function closeMongo(): Promise<void> {
  if (client) {
    logger.info('Closing MongoDB connection...', { action: 'mongo:close' });
    await client.close();
    client = null;
    db = null;
    logger.info('MongoDB connection closed', { action: 'mongo:closed' });
  }
}

/**
 * Checks if the MongoDB connection is alive by running a ping command.
 * Returns true if healthy, false otherwise.
 */
export async function isMongoHealthy(): Promise<{ healthy: boolean; message: string }> {
  if (!client || !db) {
    return { healthy: false, message: 'MongoDB client not initialized' };
  }
  try {
    await db.command({ ping: 1 });
    return { healthy: true, message: 'MongoDB ping successful' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { healthy: false, message: `MongoDB ping failed: ${msg}` };
  }
}

/**
 * Checks if the connected MongoDB is running as a Replica Set.
 */
export async function isReplicaSet(): Promise<{ isReplSet: boolean; setName?: string; message: string }> {
  if (!db) {
    return { isReplSet: false, message: 'Database not initialized' };
  }
  try {
    const status = await db.admin().command({ replSetGetStatus: 1 });
    return {
      isReplSet: true,
      setName: status.set as string,
      message: `Replica Set: ${status.set}`,
    };
  } catch {
    return { isReplSet: false, message: 'Not a Replica Set or status unavailable' };
  }
}

