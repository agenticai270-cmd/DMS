import type { Request, Response } from 'express';
import { publicUrlForUpload, removeUpload } from '../middleware/upload.js';
import { DisasterAssessment } from '../models/DisasterAssessment.js';
import { DisasterReport } from '../models/DisasterReport.js';
import { EmergencyResource } from '../models/EmergencyResource.js';
import {
  getAssessmentForReport,
  runAssessment,
} from '../services/assessmentService.js';
import {
  notifyHighSeverityIncident,
  notifyReporterOfStatus,
} from '../services/notificationService.js';
import {
  applyStatusSideEffects,
  buildReportQuery,
  createReport,
  SORTS,
  validateStatusTransition,
} from '../services/reportService.js';
import { actorFromUser, getTimeline, recordTimelineEvent, SYSTEM_ACTOR } from '../services/timelineService.js';
import { DISASTER_LABELS } from '../types/domain.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok, paginated } from '../utils/apiResponse.js';
import {
  assignResourcesSchema,
  createReportSchema,
  reportQuerySchema,
  updateStatusSchema,
} from '../validators/schemas.js';

const REPORTER_FIELDS = 'name email phone';

export const submitReport = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createReportSchema.safeParse(req.body);
  if (!parsed.success) {
    // Don't leave an orphaned file behind when validation rejects the request.
    if (req.file) removeUpload(req.file.filename);
    throw parsed.error;
  }

  const report = await createReport(
    { ...parsed.data, imageUrl: req.file ? publicUrlForUpload(req.file.filename) : undefined },
    req.user!.id,
  );

  await recordTimelineEvent(report._id, 'SUBMITTED', actorFromUser(req.user!), 'Report submitted by reporter.');

  const { assessment } = await runAssessment(report);

  await recordTimelineEvent(
    report._id,
    'SUBMITTED',
    SYSTEM_ACTOR,
    `Automated assessment complete — ${assessment.severity} severity (score ${assessment.score}/100).`,
  );

  await notifyHighSeverityIncident({
    reportId: report._id,
    reportCode: report.reportCode,
    severity: assessment.severity,
    disasterLabel: DISASTER_LABELS[report.disasterType],
    address: report.location.address,
  });

  return created(res, { report: report.toJSON(), assessment: assessment.toJSON() });
});

export const listReports = asyncHandler(async (req: Request, res: Response) => {
  const q = reportQuerySchema.parse(req.query);
  const isAdmin = req.user!.role === 'admin';

  // Non-admins only ever see their own reports, regardless of query params.
  const filters = buildReportQuery({
    status: q.status,
    disasterType: q.disasterType,
    severity: q.severity,
    urgency: q.urgency,
    search: q.search,
    userId: isAdmin && !q.mine ? undefined : req.user!.id,
  });

  const [items, total] = await Promise.all([
    DisasterReport.find(filters)
      .sort(SORTS[q.sort] ?? SORTS.newest)
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('userId', REPORTER_FIELDS)
      .lean(),
    DisasterReport.countDocuments(filters),
  ]);

  return paginated(res, items, q.page, q.limit, total);
});

/** Lightweight payload for the map: no description, no reporter details. */
export const listReportsForMap = asyncHandler(async (_req: Request, res: Response) => {
  const items = await DisasterReport.find({ status: { $nin: ['REJECTED'] } })
    .select('reportCode disasterType severity severityScore status peopleAffected location createdAt urgency')
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();
  return ok(res, { items });
});

export const getReport = asyncHandler(async (req: Request, res: Response) => {
  const report = await DisasterReport.findById(req.params.id)
    .populate('userId', REPORTER_FIELDS)
    .populate('assignedResources', 'name type contact address status availability latitude longitude')
    .lean();
  if (!report) throw ApiError.notFound('That report does not exist.');

  const reporterId = String((report.userId as unknown as { _id?: unknown })?._id ?? report.userId);
  if (req.user!.role !== 'admin' && reporterId !== req.user!.id) {
    throw ApiError.forbidden('You can only view your own reports.');
  }

  const [assessment, timeline] = await Promise.all([
    getAssessmentForReport(report._id),
    getTimeline(report._id),
  ]);

  return ok(res, { report, assessment, timeline });
});

export const getAssessment = asyncHandler(async (req: Request, res: Response) => {
  const report = await DisasterReport.findById(req.params.id).select('userId').lean();
  if (!report) throw ApiError.notFound('That report does not exist.');
  if (req.user!.role !== 'admin' && String(report.userId) !== req.user!.id) {
    throw ApiError.forbidden('You can only view your own reports.');
  }

  const assessment = await getAssessmentForReport(report._id);
  if (!assessment) throw ApiError.notFound('This report has not been assessed yet.');
  return ok(res, { assessment });
});

/** Admin-triggered re-run, e.g. after the report was edited or AI came back online. */
export const reassess = asyncHandler(async (req: Request, res: Response) => {
  const report = await DisasterReport.findById(req.params.id);
  if (!report) throw ApiError.notFound('That report does not exist.');

  const { assessment } = await runAssessment(report);
  await recordTimelineEvent(
    report._id,
    report.status,
    actorFromUser(req.user!),
    `Assessment re-run — ${assessment.severity} severity (score ${assessment.score}/100).`,
  );

  return ok(res, { assessment: assessment.toJSON() });
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const input = updateStatusSchema.parse(req.body);
  const report = await DisasterReport.findById(req.params.id);
  if (!report) throw ApiError.notFound('That report does not exist.');

  const problem = validateStatusTransition(report.status, input.status);
  if (problem) throw ApiError.badRequest(problem);

  applyStatusSideEffects(report, input.status);
  if (input.note) report.responseNote = input.note;
  await report.save();

  await recordTimelineEvent(report._id, input.status, actorFromUser(req.user!), input.note);
  await notifyReporterOfStatus({
    userId: report.userId,
    reportId: report._id,
    reportCode: report.reportCode,
    status: input.status,
    note: input.note,
  });

  return ok(res, { report: report.toJSON() });
});

export const assignResources = asyncHandler(async (req: Request, res: Response) => {
  const input = assignResourcesSchema.parse(req.body);
  const report = await DisasterReport.findById(req.params.id);
  if (!report) throw ApiError.notFound('That report does not exist.');
  if (report.status === 'RESOLVED' || report.status === 'REJECTED') {
    throw ApiError.badRequest('Resources cannot be assigned to a closed incident.');
  }

  const resources = await EmergencyResource.find({ _id: { $in: input.resourceIds } })
    .select('name')
    .lean();
  if (resources.length !== input.resourceIds.length) {
    throw ApiError.badRequest('One or more selected resources no longer exist.');
  }

  report.assignedResources = input.resourceIds as unknown as typeof report.assignedResources;
  const moved = report.status === 'SUBMITTED' || report.status === 'UNDER_REVIEW' || report.status === 'VERIFIED';
  if (moved) applyStatusSideEffects(report, 'RESPONSE_ASSIGNED');
  if (input.note) report.responseNote = input.note;
  await report.save();

  const names = resources.map((r) => r.name).join(', ');
  await recordTimelineEvent(
    report._id,
    report.status,
    actorFromUser(req.user!),
    `Assigned: ${names}.${input.note ? ` ${input.note}` : ''}`,
  );
  await notifyReporterOfStatus({
    userId: report.userId,
    reportId: report._id,
    reportCode: report.reportCode,
    status: report.status,
  });

  const populated = await DisasterReport.findById(report._id)
    .populate('assignedResources', 'name type contact address status availability latitude longitude')
    .lean();

  return ok(res, { report: populated });
});

export const deleteReport = asyncHandler(async (req: Request, res: Response) => {
  const report = await DisasterReport.findById(req.params.id);
  if (!report) throw ApiError.notFound('That report does not exist.');

  if (report.imageUrl) removeUpload(report.imageUrl.split('/').pop() ?? '');
  await Promise.all([
    DisasterAssessment.deleteOne({ reportId: report._id }),
    report.deleteOne(),
  ]);

  return ok(res, { message: 'Report deleted.' });
});
