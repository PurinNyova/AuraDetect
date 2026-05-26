import type { NextFunction, Request, Response } from "express";

import express from "express";
import { Op } from "sequelize";
import { z } from "zod/v4";

import type { DashboardSource, DashboardVerdict } from "../models/dashboard.js";

import {

  Notification,
  SavedView,
  Scan,
  ScanScore,
  UserDashboardSetting,
} from "../models/dashboard.js";

const router = express.Router();

const verdictSchema = z.enum(["likely_ai_generated", "likely_authentic"]);
const sourceSchema = z.enum(["direct_upload", "api_import", "bulk_upload"]);

const historyFiltersSchema = z.object({
  from: z.string().datetime().optional(),
  maxConfidence: z.number().min(0).max(1).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  query: z.string().trim().min(1).optional(),
  savedViewId: z.number().int().min(1).optional(),
  sources: z.array(sourceSchema).optional(),
  to: z.string().datetime().optional(),
  verdicts: z.array(verdictSchema).optional(),
});

const savedViewSchema = z.object({
  filters: historyFiltersSchema.omit({ savedViewId: true }).default({}),
  isDefault: z.boolean().optional().default(false),
  name: z.string().trim().min(1).max(100),
});

const updateSavedViewSchema = savedViewSchema.partial().refine(payload => Object.keys(payload).length > 0, {
  message: "At least one field is required.",
});

const settingsUpdateSchema = z.object({
  alertThresholdPercent: z.number().int().min(1).max(100).optional(),
  highRiskAlertsEnabled: z.boolean().optional(),
  keepOriginalsForAudits: z.boolean().optional(),
  privacyModeEnabled: z.boolean().optional(),
  retentionHours: z.number().int().min(1).optional(),
}).refine(payload => Object.keys(payload).length > 0, {
  message: "At least one setting is required.",
});

const saveScanSchema = z.object({
  confidence: z.number().min(0).max(1),
  fileSizeBytes: z.number().int().min(0),
  imageDataUrl: z.string().trim().min(1).optional(),
  mimeType: z.string().trim().min(1),
  originalFilename: z.string().trim().min(1),
  predictedLabel: z.string().trim().min(1),
  scannedAt: z.string().datetime().optional(),
  scores: z.array(z.object({
    label: z.string().trim().min(1),
    score: z.number().min(0).max(1),
  })).min(1),
  source: sourceSchema,
  verdict: verdictSchema,
});

function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401);
    next(new Error("Authentication required."));
    return;
  }

  next();
}

function getUserId(req: Request) {
  return req.session.userId as number;
}

function asArray(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  return Array.isArray(value) ? value : [value];
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === "") {
    return undefined;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? value : numberValue;
}

function parseHistoryFilters(query: Request["query"]) {
  return historyFiltersSchema.parse({
    from: query.from,
    maxConfidence: optionalNumber(query.maxConfidence),
    minConfidence: optionalNumber(query.minConfidence),
    page: optionalNumber(query.page),
    pageSize: optionalNumber(query.pageSize),
    query: query.query,
    savedViewId: optionalNumber(query.savedViewId),
    sources: asArray(query.source),
    to: query.to,
    verdicts: asArray(query.verdict),
  });
}

function toIso(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

function serializeSettings(settings: UserDashboardSetting) {
  return {
    alertThresholdPercent: settings.alertThresholdPercent,
    highRiskAlertsEnabled: settings.highRiskAlertsEnabled,
    id: settings.id,
    keepOriginalsForAudits: settings.keepOriginalsForAudits,
    privacyModeEnabled: settings.privacyModeEnabled,
    retentionHours: settings.retentionHours,
    updatedAt: toIso(settings.updatedAt),
  };
}

function parseJsonObject(value: string) {
  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

function serializeSavedView(savedView: SavedView) {
  return {
    createdAt: toIso(savedView.createdAt),
    filters: parseJsonObject(savedView.filtersJson),
    id: savedView.id,
    isDefault: savedView.isDefault,
    name: savedView.name,
    updatedAt: toIso(savedView.updatedAt),
  };
}

function serializeNotification(notification: Notification) {
  return {
    createdAt: toIso(notification.createdAt),
    id: notification.id,
    isRead: notification.isRead,
    payload: parseJsonObject(notification.payloadJson),
    readAt: toIso(notification.readAt),
    relatedScanId: notification.relatedScanId,
    type: notification.type,
  };
}

function serializeScan(scan: Scan) {
  return {
    confidence: scan.confidence,
    deletedAt: toIso(scan.deletedAt),
    expiresAt: toIso(scan.expiresAt),
    fileSizeBytes: scan.fileSizeBytes,
    id: scan.id,
    imageUrl: scan.imageUrl,
    mimeType: scan.mimeType,
    originalFilename: scan.originalFilename,
    predictedLabel: scan.predictedLabel,
    scannedAt: toIso(scan.scannedAt),
    scores: (scan.scores ?? []).map(score => ({
      label: score.label,
      score: score.score,
    })),
    source: scan.source,
    verdict: scan.verdict,
  };
}

async function getSettings(userId: number) {
  const [settings] = await UserDashboardSetting.findOrCreate({
    defaults: { userId },
    where: { userId },
  });

  return settings;
}

function getWeekStart(date: Date) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return start;
}

function createScanWhere(userId: number, filters: z.infer<typeof historyFiltersSchema>) {
  const where: Record<string, unknown> = {
    deletedAt: null,
    userId,
  };

  if (filters.verdicts?.length) {
    where.verdict = { [Op.in]: filters.verdicts };
  }

  if (filters.sources?.length) {
    where.source = { [Op.in]: filters.sources };
  }

  if (filters.minConfidence !== undefined || filters.maxConfidence !== undefined) {
    where.confidence = {
      ...(filters.minConfidence !== undefined ? { [Op.gte]: filters.minConfidence } : {}),
      ...(filters.maxConfidence !== undefined ? { [Op.lte]: filters.maxConfidence } : {}),
    };
  }

  if (filters.from || filters.to) {
    where.scannedAt = {
      ...(filters.from ? { [Op.gte]: new Date(filters.from) } : {}),
      ...(filters.to ? { [Op.lte]: new Date(filters.to) } : {}),
    };
  }

  if (filters.query) {
    where.originalFilename = { [Op.like]: `%${filters.query}%` };
  }

  return where;
}

async function getHistoryFilters(req: Request, userId: number) {
  const queryFilters = parseHistoryFilters(req.query);

  if (!queryFilters.savedViewId) {
    return {
      ...queryFilters,
      page: queryFilters.page ?? 1,
      pageSize: queryFilters.pageSize ?? 25,
    };
  }

  const savedView = await SavedView.findOne({
    where: {
      id: queryFilters.savedViewId,
      userId,
    },
  });

  if (!savedView) {
    throw Object.assign(new Error("Saved view not found."), { statusCode: 404 });
  }

  const savedFilters = historyFiltersSchema.parse(parseJsonObject(savedView.filtersJson));

  return {
    ...savedFilters,
    ...queryFilters,
    page: queryFilters.page ?? savedFilters.page ?? 1,
    pageSize: queryFilters.pageSize ?? savedFilters.pageSize ?? 25,
  };
}

async function unsetOtherDefaults(userId: number, exceptId?: number) {
  await SavedView.update({ isDefault: false }, {
    where: {
      userId,
      ...(exceptId ? { id: { [Op.ne]: exceptId } } : {}),
    },
  });
}

router.use(requireUser);

router.get("/stats", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const now = new Date();
    const weekStart = getWeekStart(now);
    const previousWeekStart = new Date(weekStart);
    previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);

    const [weeklyScans, previousWeeklyScans, likelyAiCount, activeScans, highRiskNotificationCount] = await Promise.all([
      Scan.count({ where: { deletedAt: null, scannedAt: { [Op.gte]: weekStart }, userId } }),
      Scan.count({ where: { deletedAt: null, scannedAt: { [Op.gte]: previousWeekStart, [Op.lt]: weekStart }, userId } }),
      Scan.count({ where: { deletedAt: null, userId, verdict: "likely_ai_generated" } }),
      Scan.findAll({ attributes: ["confidence"], where: { deletedAt: null, userId } }),
      Notification.count({ where: { isRead: false, type: "high_risk_scan", userId } }),
    ]);

    const avgConfidence = activeScans.length
      ? activeScans.reduce((total, scan) => total + scan.confidence, 0) / activeScans.length
      : 0;

    res.json({
      avgConfidence,
      highRiskNotificationCount,
      likelyAiCount,
      weeklyScanDelta: weeklyScans - previousWeeklyScans,
      weeklyScans,
    });
  }
  catch (error) {
    next(error);
  }
});

router.get("/history", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const filters = await getHistoryFilters(req, userId);
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;
    const where = createScanWhere(userId, filters);

    const [result, summaryScans] = await Promise.all([
      Scan.findAndCountAll({
        distinct: true,
        include: [{ as: "scores", model: ScanScore }],
        limit: pageSize,
        offset: (page - 1) * pageSize,
        order: [["scannedAt", "DESC"], [{ as: "scores", model: ScanScore }, "id", "ASC"]],
        where,
      }),
      Scan.findAll({ attributes: ["confidence", "verdict"], where }),
    ]);

    const likelyAiCount = summaryScans.filter(scan => scan.verdict === "likely_ai_generated").length;
    const likelyAuthenticCount = summaryScans.filter(scan => scan.verdict === "likely_authentic").length;
    const avgConfidence = summaryScans.length
      ? summaryScans.reduce((total, scan) => total + scan.confidence, 0) / summaryScans.length
      : 0;

    res.json({
      appliedFilters: filters,
      items: result.rows.map(serializeScan),
      page,
      pageSize,
      summary: {
        avgConfidence,
        likelyAiCount,
        likelyAuthenticCount,
        totalScans: summaryScans.length,
      },
      total: result.count,
    });
  }
  catch (error) {
    if (error instanceof Error && "statusCode" in error && error.statusCode === 404) {
      res.status(404);
    }

    next(error);
  }
});

router.get("/history/saved-views", async (req, res, next) => {
  try {
    const items = await SavedView.findAll({
      order: [["isDefault", "DESC"], ["name", "ASC"]],
      where: { userId: getUserId(req) },
    });

    res.json({ items: items.map(serializeSavedView) });
  }
  catch (error) {
    next(error);
  }
});

router.post("/history/saved-views", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const payload = savedViewSchema.parse(req.body);

    if (payload.isDefault) {
      await unsetOtherDefaults(userId);
    }

    const savedView = await SavedView.create({
      filtersJson: JSON.stringify(payload.filters),
      isDefault: payload.isDefault,
      name: payload.name,
      userId,
    });

    res.status(201).json(serializeSavedView(savedView));
  }
  catch (error) {
    next(error);
  }
});

router.patch("/history/saved-views/:id", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const payload = updateSavedViewSchema.parse(req.body);
    const savedView = await SavedView.findOne({ where: { id: Number(req.params.id), userId } });

    if (!savedView) {
      res.status(404);
      throw new Error("Saved view not found.");
    }

    if (payload.isDefault) {
      await unsetOtherDefaults(userId, savedView.id);
    }

    await savedView.update({
      ...(payload.filters ? { filtersJson: JSON.stringify(payload.filters) } : {}),
      ...(payload.isDefault !== undefined ? { isDefault: payload.isDefault } : {}),
      ...(payload.name ? { name: payload.name } : {}),
    });

    res.json(serializeSavedView(savedView));
  }
  catch (error) {
    next(error);
  }
});

router.delete("/history/saved-views/:id", async (req, res, next) => {
  try {
    const deleted = await SavedView.destroy({
      where: {
        id: Number(req.params.id),
        userId: getUserId(req),
      },
    });

    if (!deleted) {
      res.status(404);
      throw new Error("Saved view not found.");
    }

    res.json({ success: true });
  }
  catch (error) {
    next(error);
  }
});

router.get("/settings", async (req, res, next) => {
  try {
    res.json(serializeSettings(await getSettings(getUserId(req))));
  }
  catch (error) {
    next(error);
  }
});

router.patch("/settings", async (req, res, next) => {
  try {
    const payload = settingsUpdateSchema.parse(req.body);
    const settings = await getSettings(getUserId(req));
    await settings.update(payload);
    res.json(serializeSettings(settings));
  }
  catch (error) {
    next(error);
  }
});

router.post("/scans", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const payload = saveScanSchema.parse(req.body);
    const settings = await getSettings(userId);
    const scannedAt = payload.scannedAt ? new Date(payload.scannedAt) : new Date();
    const expiresAt = settings.privacyModeEnabled && !settings.keepOriginalsForAudits
      ? new Date(scannedAt.getTime() + settings.retentionHours * 60 * 60 * 1000)
      : null;

    const scan = await Scan.create({
      confidence: payload.confidence,
      deletedAt: null,
      expiresAt,
      fileSizeBytes: payload.fileSizeBytes,
      imageUrl: payload.imageDataUrl ?? null,
      mimeType: payload.mimeType,
      originalFilename: payload.originalFilename,
      predictedLabel: payload.predictedLabel,
      scannedAt,
      source: payload.source as DashboardSource,
      userId,
      verdict: payload.verdict as DashboardVerdict,
    });

    await ScanScore.bulkCreate(payload.scores.map(score => ({
      label: score.label,
      scanId: scan.id,
      score: score.score,
    })));

    const savedScan = await Scan.findByPk(scan.id, {
      include: [{ as: "scores", model: ScanScore }],
      order: [[{ as: "scores", model: ScanScore }, "id", "ASC"]],
    });

    let notification: Notification | null = null;
    if (settings.highRiskAlertsEnabled && payload.confidence * 100 >= settings.alertThresholdPercent) {
      notification = await Notification.create({
        isRead: false,
        payloadJson: JSON.stringify({
          confidence: payload.confidence,
          message: `${payload.originalFilename} crossed your ${settings.alertThresholdPercent}% alert threshold.`,
          title: "High-risk scan detected",
          verdict: payload.verdict,
        }),
        readAt: null,
        relatedScanId: scan.id,
        type: "high_risk_scan",
        userId,
      });
    }

    res.status(201).json({
      notification: notification ? serializeNotification(notification) : null,
      scan: serializeScan(savedScan ?? scan),
    });
  }
  catch (error) {
    next(error);
  }
});

router.get("/notifications", async (req, res, next) => {
  try {
    const pageSize = Math.min(Math.max(Number(req.query.pageSize ?? 20), 1), 100);
    const unreadOnly = req.query.unreadOnly === "true";
    const userId = getUserId(req);
    const where = {
      ...(unreadOnly ? { isRead: false } : {}),
      userId,
    };

    const [items, unreadCount] = await Promise.all([
      Notification.findAll({
        limit: pageSize,
        order: [["createdAt", "DESC"]],
        where,
      }),
      Notification.count({ where: { isRead: false, userId } }),
    ]);

    res.json({
      items: items.map(serializeNotification),
      unreadCount,
    });
  }
  catch (error) {
    next(error);
  }
});

router.post("/notifications/read-all", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    await Notification.update({ isRead: true, readAt: new Date() }, {
      where: { isRead: false, userId },
    });

    res.json({
      items: [],
      unreadCount: 0,
    });
  }
  catch (error) {
    next(error);
  }
});

router.post("/notifications/:id/read", async (req, res, next) => {
  try {
    const notification = await Notification.findOne({
      where: {
        id: Number(req.params.id),
        userId: getUserId(req),
      },
    });

    if (!notification) {
      res.status(404);
      throw new Error("Notification not found.");
    }

    await notification.update({ isRead: true, readAt: notification.readAt ?? new Date() });
    res.json(serializeNotification(notification));
  }
  catch (error) {
    next(error);
  }
});

export default router;
