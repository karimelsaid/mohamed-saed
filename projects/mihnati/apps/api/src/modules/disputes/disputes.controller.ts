import type { Request, Response, NextFunction } from 'express';
import { DisputesService } from './disputes.service.js';
import { UnauthenticatedError } from '../../platform/http/errors.js';

function getRequestId(req: Request): string {
  return (req as any).requestId || (req.headers['x-request-id'] as string) || '';
}

function getParam(req: Request, key: string): string {
  const val = req.params[key];
  if (Array.isArray(val)) return val[0] || '';
  return val || '';
}

export class DisputesController {
  constructor(private disputesService: DisputesService) {}

  // ══════════════════════════════════════════════════════════════
  // ── Support Tickets & Messages ──
  // ══════════════════════════════════════════════════════════════

  createSupportTicket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const roles = await this.disputesService.getUserRoles(user.id);
      const userRole = roles[0] || 'customer';

      const ticket = await this.disputesService.createSupportTicket(
        user.id,
        userRole,
        req.body,
        getRequestId(req)
      );

      res.status(201).json({
        data: ticket,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  getMySupportTickets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const tickets = await this.disputesService.getUserSupportTickets(user.id);

      res.status(200).json({
        data: tickets,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  getSupportTicket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const roles = await this.disputesService.getUserRoles(user.id);
      const ticket = await this.disputesService.getSupportTicketById(
        user.id,
        roles,
        getParam(req, 'id')
      );

      res.status(200).json({
        data: ticket,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  createSupportMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const roles = await this.disputesService.getUserRoles(user.id);
      const message = await this.disputesService.createSupportMessage(
        user.id,
        roles,
        getParam(req, 'id'),
        req.body,
        getRequestId(req)
      );

      res.status(201).json({
        data: message,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  getSupportMessages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const roles = await this.disputesService.getUserRoles(user.id);
      const messages = await this.disputesService.getSupportMessages(
        user.id,
        roles,
        getParam(req, 'id')
      );

      res.status(200).json({
        data: messages,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  adminListSupportTickets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, category, priority, assignedStaffId, page, pageSize } = req.query;

      const result = await this.disputesService.adminListSupportTickets({
        status: status as any,
        category: category as string,
        priority: priority as string,
        assignedStaffId: assignedStaffId as string,
        page: page ? parseInt(page as string, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize as string, 10) : 20,
      });

      res.status(200).json({
        data: result.tickets,
        pagination: {
          page: page ? parseInt(page as string, 10) : 1,
          pageSize: pageSize ? parseInt(pageSize as string, 10) : 20,
          total: result.total,
          hasNext: (page ? parseInt(page as string, 10) : 1) * (pageSize ? parseInt(pageSize as string, 10) : 20) < result.total,
        },
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  adminAssignTicket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staff = req.user;
      if (!staff) throw new UnauthenticatedError();

      const ticket = await this.disputesService.adminAssignTicket(
        staff.id,
        getParam(req, 'id'),
        req.body.assignedStaffId || staff.id,
        getRequestId(req)
      );

      res.status(200).json({
        data: ticket,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  adminUpdateTicketStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staff = req.user;
      if (!staff) throw new UnauthenticatedError();

      const ticket = await this.disputesService.adminUpdateTicketStatus(
        staff.id,
        getParam(req, 'id'),
        req.body.status,
        getRequestId(req)
      );

      res.status(200).json({
        data: ticket,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // ── Reports ──
  // ══════════════════════════════════════════════════════════════

  createReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const report = await this.disputesService.createReport(
        user.id,
        req.body,
        getRequestId(req)
      );

      res.status(201).json({
        data: report,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  adminListReports = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, targetType, page, pageSize } = req.query;

      const result = await this.disputesService.adminListReports({
        status: status as string,
        targetType: targetType as string,
        page: page ? parseInt(page as string, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize as string, 10) : 20,
      });

      res.status(200).json({
        data: result.reports,
        pagination: {
          page: page ? parseInt(page as string, 10) : 1,
          pageSize: pageSize ? parseInt(pageSize as string, 10) : 20,
          total: result.total,
          hasNext: (page ? parseInt(page as string, 10) : 1) * (pageSize ? parseInt(pageSize as string, 10) : 20) < result.total,
        },
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  adminResolveReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staff = req.user;
      if (!staff) throw new UnauthenticatedError();

      const report = await this.disputesService.adminResolveReport(
        staff.id,
        getParam(req, 'id'),
        req.body,
        getRequestId(req)
      );

      res.status(200).json({
        data: report,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // ── Formal Order Disputes ──
  // ══════════════════════════════════════════════════════════════

  createDispute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const dispute = await this.disputesService.createDispute(
        user.id,
        req.body,
        getRequestId(req)
      );

      res.status(201).json({
        data: dispute,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  getMyDisputes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const disputes = await this.disputesService.getUserDisputes(user.id);

      res.status(200).json({
        data: disputes,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  getDispute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const roles = await this.disputesService.getUserRoles(user.id);
      const dispute = await this.disputesService.getDisputeById(
        user.id,
        roles,
        getParam(req, 'id')
      );

      res.status(200).json({
        data: dispute,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  submitEvidence = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const dispute = await this.disputesService.submitEvidence(
        user.id,
        getParam(req, 'id'),
        req.body,
        getRequestId(req)
      );

      res.status(200).json({
        data: dispute,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  appealDispute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const dispute = await this.disputesService.appealDispute(
        user.id,
        getParam(req, 'id'),
        req.body,
        getRequestId(req)
      );

      res.status(200).json({
        data: dispute,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  adminListDisputes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, subjectType, page, pageSize } = req.query;

      const result = await this.disputesService.adminListDisputes({
        status: status as string,
        subjectType: subjectType as string,
        page: page ? parseInt(page as string, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize as string, 10) : 20,
      });

      res.status(200).json({
        data: result.disputes,
        pagination: {
          page: page ? parseInt(page as string, 10) : 1,
          pageSize: pageSize ? parseInt(pageSize as string, 10) : 20,
          total: result.total,
          hasNext: (page ? parseInt(page as string, 10) : 1) * (pageSize ? parseInt(pageSize as string, 10) : 20) < result.total,
        },
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  adminAssignDispute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staff = req.user;
      if (!staff) throw new UnauthenticatedError();

      const dispute = await this.disputesService.adminAssignDispute(
        staff.id,
        getParam(req, 'id'),
        req.body.reviewerId || staff.id,
        getRequestId(req)
      );

      res.status(200).json({
        data: dispute,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  adminRequestEvidence = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staff = req.user;
      if (!staff) throw new UnauthenticatedError();

      const dispute = await this.disputesService.adminRequestEvidence(
        staff.id,
        getParam(req, 'id'),
        req.body,
        getRequestId(req)
      );

      res.status(200).json({
        data: dispute,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  adminIssueDecision = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staff = req.user;
      if (!staff) throw new UnauthenticatedError();

      const dispute = await this.disputesService.adminIssueDecision(
        staff.id,
        getParam(req, 'id'),
        req.body,
        getRequestId(req)
      );

      res.status(200).json({
        data: dispute,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  adminAppealDecision = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staff = req.user;
      if (!staff) throw new UnauthenticatedError();

      const dispute = await this.disputesService.adminAppealDecision(
        staff.id,
        getParam(req, 'id'),
        req.body,
        getRequestId(req)
      );

      res.status(200).json({
        data: dispute,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  adminDismissDispute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staff = req.user;
      if (!staff) throw new UnauthenticatedError();

      const dispute = await this.disputesService.adminDismissDispute(
        staff.id,
        getParam(req, 'id'),
        req.body.reason,
        getRequestId(req)
      );

      res.status(200).json({
        data: dispute,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // ── Return Requests ──
  // ══════════════════════════════════════════════════════════════

  createReturnRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const returnReq = await this.disputesService.createReturnRequest(
        user.id,
        req.body,
        getRequestId(req)
      );

      res.status(201).json({
        data: returnReq,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  getMyReturnRequests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const returns = await this.disputesService.getCustomerReturnRequests(user.id);

      res.status(200).json({
        data: returns,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  getMerchantReturnRequests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const returns = await this.disputesService.getMerchantReturnRequests(user.id);

      res.status(200).json({
        data: returns,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  getReturnRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const roles = await this.disputesService.getUserRoles(user.id);
      const returnReq = await this.disputesService.getReturnRequestById(
        user.id,
        roles,
        getParam(req, 'id')
      );

      res.status(200).json({
        data: returnReq,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  merchantReviewReturn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const returnReq = await this.disputesService.merchantReviewReturn(
        user.id,
        getParam(req, 'id'),
        req.body,
        getRequestId(req)
      );

      res.status(200).json({
        data: returnReq,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  customerShipReturn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const returnReq = await this.disputesService.customerShipReturn(
        user.id,
        getParam(req, 'id'),
        getRequestId(req)
      );

      res.status(200).json({
        data: returnReq,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  merchantReceiveReturn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const returnReq = await this.disputesService.merchantReceiveReturn(
        user.id,
        getParam(req, 'id'),
        getRequestId(req)
      );

      res.status(200).json({
        data: returnReq,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  merchantInspectReturn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const returnReq = await this.disputesService.merchantInspectReturn(
        user.id,
        getParam(req, 'id'),
        req.body,
        getRequestId(req)
      );

      res.status(200).json({
        data: returnReq,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  merchantResolveReturn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const returnReq = await this.disputesService.merchantResolveReturn(
        user.id,
        getParam(req, 'id'),
        req.body,
        getRequestId(req)
      );

      res.status(200).json({
        data: returnReq,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  escalateReturnToDispute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) throw new UnauthenticatedError();

      const dispute = await this.disputesService.escalateReturnToDispute(
        user.id,
        getParam(req, 'id'),
        req.body.reason || 'Customer rejected return escalated to formal dispute',
        getRequestId(req)
      );

      res.status(201).json({
        data: dispute,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };
}
