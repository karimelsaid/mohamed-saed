import { getDb } from '../../platform/database/connection.js';
import { UserDoc, AccountStatus } from '../identity/auth.types.js';
import { SessionService } from '../identity/session.service.js';
import { ConflictError, NotFoundError } from '../../platform/http/errors.js';
import { logger } from '../../platform/logging/logger.js';

export class AccountService {
  constructor(private readonly sessionService: SessionService) {}

  private getUsersCollection() {
    return getDb().collection<UserDoc>('users');
  }

  private getDomainEventsCollection() {
    return getDb().collection('domain_events');
  }

  /**
   * User requests account deactivation.
   * Allowed from: 'active' -> 'deactivation_requested'
   */
  async requestDeactivation(userId: string, reason?: string): Promise<{ status: AccountStatus }> {
    const col = this.getUsersCollection();
    const user = await col.findOne({ _id: userId });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.status !== 'active') {
      throw new ConflictError(
        `Cannot request deactivation from status "${user.status}". Account must be active.`,
        'INVALID_TRANSITION'
      );
    }

    const newVersion = user.version + 1;
    await col.updateOne(
      { _id: userId, version: user.version },
      {
        $set: { status: 'deactivation_requested', updatedAt: new Date() },
        $inc: { version: 1 },
      }
    );

    // Record domain event
    await this.getDomainEventsCollection().insertOne({
      aggregateType: 'UserAccount',
      aggregateId: userId,
      version: newVersion,
      eventType: 'AccountDeactivationRequested',
      actor: userId,
      reason: reason || 'User requested deactivation',
      occurredAt: new Date(),
    });

    logger.info('Account deactivation requested', {
      action: 'account:deactivation_requested',
      userId,
    });

    return { status: 'deactivation_requested' };
  }

  /**
   * User requests account deletion.
   * Allowed from: 'active', 'suspended', 'deactivation_requested', 'deactivated' -> 'deletion_pending'
   * Revokes all active sessions immediately.
   */
  async requestDeletion(userId: string, reason?: string): Promise<{ status: AccountStatus }> {
    const col = this.getUsersCollection();
    const user = await col.findOne({ _id: userId });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const allowedPriorStates: AccountStatus[] = ['active', 'suspended', 'deactivation_requested', 'deactivated'];
    if (!allowedPriorStates.includes(user.status)) {
      throw new ConflictError(
        `Cannot request deletion from status "${user.status}".`,
        'INVALID_TRANSITION'
      );
    }

    const newVersion = user.version + 1;
    await col.updateOne(
      { _id: userId, version: user.version },
      {
        $set: { status: 'deletion_pending', updatedAt: new Date() },
        $inc: { version: 1 },
      }
    );

    // Revoke all sessions immediately (AC-E02.3)
    await this.sessionService.revokeAllUserSessions(userId, 'DELETION_PENDING');

    // Record domain event
    await this.getDomainEventsCollection().insertOne({
      aggregateType: 'UserAccount',
      aggregateId: userId,
      version: newVersion,
      eventType: 'AccountDeletionRequested',
      actor: userId,
      reason: reason || 'User requested deletion',
      occurredAt: new Date(),
    });

    logger.info('Account deletion requested, sessions revoked', {
      action: 'account:deletion_requested',
      userId,
    });

    return { status: 'deletion_pending' };
  }

  /**
   * User cancels a pending deactivation or deletion request.
   * Restores status to 'active'.
   */
  async cancelRequest(userId: string): Promise<{ status: AccountStatus }> {
    const col = this.getUsersCollection();
    const user = await col.findOne({ _id: userId });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.status !== 'deactivation_requested' && user.status !== 'deletion_pending') {
      throw new ConflictError(
        `No pending deactivation or deletion request to cancel. Current status: "${user.status}".`,
        'INVALID_TRANSITION'
      );
    }

    const newVersion = user.version + 1;
    await col.updateOne(
      { _id: userId, version: user.version },
      {
        $set: { status: 'active', updatedAt: new Date() },
        $inc: { version: 1 },
      }
    );

    // Record domain event
    await this.getDomainEventsCollection().insertOne({
      aggregateType: 'UserAccount',
      aggregateId: userId,
      version: newVersion,
      eventType: 'AccountRequestCancelled',
      actor: userId,
      occurredAt: new Date(),
    });

    logger.info('Account request cancelled, restored to active', {
      action: 'account:request_cancelled',
      userId,
    });

    return { status: 'active' };
  }
}

