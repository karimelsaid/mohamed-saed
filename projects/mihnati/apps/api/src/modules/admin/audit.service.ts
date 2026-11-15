import { randomUUID } from 'crypto';
import { getDb } from '../../platform/database/connection.js';
import { AdminAuditLogDoc } from './rbac.types.js';
import { redactSensitiveData } from '../../platform/logging/logger.js';
import { logger } from '../../platform/logging/logger.js';

export class AuditService {
  private getCollection() {
    return getDb().collection<AdminAuditLogDoc>('admin_audit_logs');
  }

  /**
   * Appends an immutable audit log entry.
   */
  async log(params: {
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    reason?: string;
    metadata?: Record<string, unknown>;
    sensitivePurpose?: string;
    requestId?: string;
  }): Promise<AdminAuditLogDoc> {
    const col = this.getCollection();
    const doc: AdminAuditLogDoc = {
      _id: `aud_${randomUUID()}`,
      actorId: params.actorId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason,
      metadata: params.metadata ? (redactSensitiveData(params.metadata) as Record<string, unknown>) : undefined,
      sensitivePurpose: params.sensitivePurpose,
      requestId: params.requestId,
      createdAt: new Date(),
    };

    await col.insertOne(doc);

    logger.info(`[AUDIT] ${params.action} by ${params.actorId} on ${params.targetType}:${params.targetId}`, {
      action: 'admin:audit_logged',
      auditAction: params.action,
      actorId: params.actorId,
    });

    return doc;
  }

  /**
   * Lists audit logs for authorized staff.
   */
  async listLogs(params: {
    actorId?: string;
    targetType?: string;
    limit?: number;
    skip?: number;
  }): Promise<{ logs: AdminAuditLogDoc[]; total: number }> {
    const col = this.getCollection();
    const filter: Record<string, unknown> = {};
    if (params.actorId) filter['actorId'] = params.actorId;
    if (params.targetType) filter['targetType'] = params.targetType;

    const limit = Math.min(params.limit || 50, 100);
    const skip = params.skip || 0;

    const [logs, total] = await Promise.all([
      col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      col.countDocuments(filter),
    ]);

    return { logs, total };
  }
}

