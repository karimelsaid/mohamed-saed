import { randomUUID } from 'crypto';
import { getDb } from '../../platform/database/connection.js';
import {
  RoleKey,
  MarketRoleKey,
  RoleAssignmentDoc,
  CustomerProfileDoc,
  ProfessionalProfileDoc,
  MerchantProfileDoc,
} from './role.types.js';
import { UserDoc } from '../identity/auth.types.js';
import { ForbiddenError, NotFoundError } from '../../platform/http/errors.js';
import { logger } from '../../platform/logging/logger.js';

const ALLOWED_SELF_ACTIVATION_ROLES: MarketRoleKey[] = ['customer', 'professional', 'merchant'];

export class RoleService {
  private getAssignmentsCollection() {
    return getDb().collection<RoleAssignmentDoc>('user_role_assignments');
  }

  private getUsersCollection() {
    return getDb().collection<UserDoc>('users');
  }

  private getDomainEventsCollection() {
    return getDb().collection('domain_events');
  }

  /**
   * Lists all role assignments for a user.
   */
  async listUserRoles(userId: string): Promise<RoleAssignmentDoc[]> {
    const col = this.getAssignmentsCollection();
    return col.find({ userId }).sort({ createdAt: 1 }).toArray();
  }

  /**
   * Activates a market role for the user (Customer, Professional, Merchant).
   * Idempotent and thread-safe: repeated activation returns the same assignment and profile.
   */
  async activateRole(userId: string, roleKey: RoleKey): Promise<{ assignment: RoleAssignmentDoc }> {
    if (!ALLOWED_SELF_ACTIVATION_ROLES.includes(roleKey as MarketRoleKey)) {
      throw new ForbiddenError(
        `Role "${roleKey}" cannot be self-activated. Internal roles require administrative grant.`
      );
    }

    // 1. Verify user exists and is active
    const user = await this.getUsersCollection().findOne({ _id: userId });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.status !== 'active') {
      throw new ForbiddenError(`Cannot activate roles while account status is "${user.status}".`);
    }

    const assignmentsCol = this.getAssignmentsCollection();
    const now = new Date();

    // 2. Upsert role assignment atomically
    const assignmentId = `ura_${randomUUID()}`;
    await assignmentsCol.updateOne(
      { userId, roleKey },
      {
        $set: {
          status: 'active',
          updatedAt: now,
          grantedAt: now,
          revokedAt: undefined,
        },
        $setOnInsert: {
          _id: assignmentId,
          userId,
          roleKey,
          grantedBy: userId,
          createdAt: now,
        },
      },
      { upsert: true }
    );

    const assignment = (await assignmentsCol.findOne({ userId, roleKey }))!;

    // 3. Ensure corresponding profile exists (creates draft profile if absent)
    await this.ensureProfileExists(userId, roleKey as MarketRoleKey);

    // 4. Record domain event
    await this.getDomainEventsCollection().insertOne({
      aggregateType: 'UserRoleAssignment',
      aggregateId: assignment._id,
      version: 1,
      eventType: 'RoleActivated',
      actor: userId,
      roleKey,
      occurredAt: now,
    });

    logger.info('User role activated successfully', {
      action: 'role:activated',
      userId,
      roleKey,
    });

    return { assignment };
  }

  /**
   * Deactivates a role assignment.
   */
  async deactivateRole(userId: string, roleKey: RoleKey, reason?: string): Promise<{ assignment: RoleAssignmentDoc }> {
    const col = this.getAssignmentsCollection();
    const assignment = await col.findOne({ userId, roleKey });

    if (!assignment) {
      throw new NotFoundError(`Role assignment for "${roleKey}" not found.`);
    }

    if (assignment.status === 'inactive') {
      return { assignment };
    }

    const now = new Date();
    await col.updateOne(
      { userId, roleKey },
      {
        $set: {
          status: 'inactive',
          revokedAt: now,
          reason: reason || 'User requested deactivation',
          updatedAt: now,
        },
      }
    );

    const updated = (await col.findOne({ userId, roleKey }))!;

    // Record domain event
    await this.getDomainEventsCollection().insertOne({
      aggregateType: 'UserRoleAssignment',
      aggregateId: assignment._id,
      version: 1,
      eventType: 'RoleDeactivated',
      actor: userId,
      roleKey,
      reason,
      occurredAt: now,
    });

    logger.info('User role deactivated successfully', {
      action: 'role:deactivated',
      userId,
      roleKey,
    });

    return { assignment: updated };
  }

  /**
   * Checks if user has an active assignment for the given role.
   */
  async hasActiveRole(userId: string, roleKey: RoleKey): Promise<boolean> {
    const col = this.getAssignmentsCollection();
    const assignment = await col.findOne({ userId, roleKey, status: 'active' });
    return Boolean(assignment);
  }

  /**
   * Creates the corresponding initial profile if it does not already exist.
   */
  private async ensureProfileExists(userId: string, roleKey: MarketRoleKey): Promise<void> {
    const db = getDb();
    const now = new Date();

    if (roleKey === 'customer') {
      const col = db.collection<CustomerProfileDoc>('customer_profiles');
      await col.updateOne(
        { userId },
        {
          $setOnInsert: {
            _id: `cp_${randomUUID()}`,
            userId,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true }
      );
    } else if (roleKey === 'professional') {
      const col = db.collection<ProfessionalProfileDoc>('professional_profiles');
      const defaultSlug = `pro-${userId.slice(-6)}-${Date.now().toString(36)}`;
      await col.updateOne(
        { userId },
        {
          $setOnInsert: {
            _id: `pp_${randomUUID()}`,
            userId,
            slug: defaultSlug,
            verificationStatus: 'draft',
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true }
      );
    } else if (roleKey === 'merchant') {
      const col = db.collection<MerchantProfileDoc>('merchant_profiles');
      await col.updateOne(
        { userId },
        {
          $setOnInsert: {
            _id: `mp_${randomUUID()}`,
            userId,
            verificationStatus: 'draft',
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true }
      );
    }
  }
}
