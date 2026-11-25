import 'dotenv/config';
import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  MVTEC_CATEGORIES,
  type DriftStatusResponse,
  type MvtecCategory,
} from './src/types/prometheus';
import {
  deleteInspectionById,
  getAnalyticsOverview,
  getDriftTrajectory,
  getInspectionById,
  getInspectionFiles,
  getLatestInspectionWithStats,
  getSystemSettings,
  listAllModelVersions,
  listDriftEvents,
  listInspections,
  listPendingReviews,
  listReviewedInspections,
  recordReviewDecision,
  saveSystemSettings,
} from './server/db/database';
import { validateSystemSettings } from './server/ml/anomalyMath';
import {
  RESULTS_DIR,
  SAMPLE_SPECIMENS,
  UPLOADS_DIR,
  ensureInitialCheckpoints,
  evaluateAndCalibrateCategory,
  loadMemoryBank,
  resolveSampleSpecimenPath,
  runInspectionPipeline,
  trainCategoryModel,
} from './server/ml/pipeline';

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png']);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 12 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_MIMES.has(file.mimetype.toLowerCase()) || !ALLOWED_EXTS.has(ext)) {
      cb(new Error('Only JPG, JPEG, and PNG image files are permitted.'));
      return;
    }
    cb(null, true);
  },
});

function isValidCategory(category: string): category is MvtecCategory {
  return (MVTEC_CATEGORIES as readonly string[]).includes(category);
}

function safeUnlink(dir: string, filename: string): void {
  if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg)$/.test(filename)) return;
  const resolved = path.resolve(dir, filename);
  if (resolved.startsWith(dir + path.sep) && fs.existsSync(resolved)) {
    try {
      fs.unlinkSync(resolved);
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function startServer() {
  await ensureInitialCheckpoints();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // =========================================================
  // SYSTEM ENDPOINTS
  // =========================================================
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      service: 'PROMETHEUS-X',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/system/info', (_req: Request, res: Response) => {
    const models = listAllModelVersions();
    const trainedCount = models.filter((m) => m.trainingStatus === 'TRAINED').length;
    const calibratedCount = models.filter((m) => m.calibrationStatus === 'CALIBRATED').length;
    const settings = getSystemSettings();
    res.json({
      name: 'PROMETHEUS-X',
      engine: 'Multi-Scale PatchCore Coreset & Distribution Monitor',
      architecture: settings.architecture,
      inputImageSize: settings.inputImageSize,
      supportedCategories: MVTEC_CATEGORIES,
      trainedCategoriesCount: trainedCount,
      calibratedCategoriesCount: calibratedCount,
      maxUploadSizeMb: 10,
      allowedFormats: ['JPG', 'JPEG', 'PNG'],
    });
  });

  app.get('/api/samples', (_req: Request, res: Response) => {
    res.json({ samples: SAMPLE_SPECIMENS });
  });

  // =========================================================
  // CONFINED MEDIA SERVING (uploads & results PNGs)
  // =========================================================
  app.get('/api/media/:folder/:filename', (req: Request, res: Response) => {
    const { folder, filename } = req.params;
    if (folder !== 'uploads' && folder !== 'results') {
      res.status(400).json({ error: 'Invalid media folder.' });
      return;
    }
    if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg)$/.test(filename)) {
      res.status(400).json({ error: 'Invalid filename.' });
      return;
    }
    const baseDir = folder === 'uploads' ? UPLOADS_DIR : RESULTS_DIR;
    const resolved = path.resolve(baseDir, filename);
    if (!resolved.startsWith(baseDir + path.sep) || !fs.existsSync(resolved)) {
      res.status(404).json({ error: 'Media asset not found.' });
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(resolved);
  });

  // =========================================================
  // INSPECTION ENDPOINTS
  // =========================================================
  app.post('/api/inspect', upload.single('image'), async (req: Request, res: Response) => {
    try {
      const category = String(req.body?.category || '').trim();
      if (!isValidCategory(category)) {
        res.status(400).json({ error: 'Please select a valid industrial product category.' });
        return;
      }

      let imageBuffer: Buffer;
      let originalFilename: string;

      if (req.file && req.file.buffer) {
        imageBuffer = req.file.buffer;
        originalFilename = req.file.originalname || 'uploaded_image.png';
      } else if (typeof req.body?.sampleKey === 'string' && req.body.sampleKey.trim()) {
        const resolved = resolveSampleSpecimenPath(req.body.sampleKey.trim());
        if (!resolved) {
          res.status(400).json({ error: 'Requested sample specimen was not found.' });
          return;
        }
        imageBuffer = fs.readFileSync(resolved.filePath);
        originalFilename = `${resolved.specimen.key}.jpg`;
      } else {
        res.status(400).json({ error: 'Please upload a JPG/PNG product image before running inspection.' });
        return;
      }

      const markerShape = req.body?.markerShape === 'circle' ? 'circle' : 'rectangle';
      const isCustomUpload = Boolean(req.file && req.file.buffer);

      const record = await runInspectionPipeline({
        imageBuffer,
        originalFilename,
        category,
        isCustomUpload,
        markerShape,
      });

      res.status(201).json({ inspection: record });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Inspection processing failed.';
      res.status(400).json({ error: message });
    }
  });

  app.get('/api/inspections', (req: Request, res: Response) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const prediction = typeof req.query.prediction === 'string' ? req.query.prediction : undefined;
    const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'createdAt';
    const sortDir = req.query.sortDir === 'asc' ? 'asc' : 'desc';

    const inspections = listInspections({ search, category, prediction, sortBy, sortDir });
    res.json({ inspections });
  });

  app.get('/api/inspections/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    if (!/^INS-[A-F0-9]{8}$/.test(id)) {
      res.status(400).json({ error: 'Invalid inspection ID format.' });
      return;
    }
    const inspection = getInspectionById(id);
    if (!inspection) {
      res.status(404).json({ error: 'Inspection record not found.' });
      return;
    }
    res.json({ inspection });
  });

  app.delete('/api/inspections/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    if (!/^INS-[A-F0-9]{8}$/.test(id)) {
      res.status(400).json({ error: 'Invalid inspection ID format.' });
      return;
    }
    const files = getInspectionFiles(id);
    if (!files) {
      res.status(404).json({ error: 'Inspection record not found.' });
      return;
    }
    const deleted = deleteInspectionById(id);
    if (deleted) {
      safeUnlink(UPLOADS_DIR, files.originalFile);
      safeUnlink(RESULTS_DIR, files.heatmapFile);
      safeUnlink(RESULTS_DIR, files.overlayFile);
      safeUnlink(RESULTS_DIR, files.maskFile);
    }
    res.json({ deleted, id });
  });

  // =========================================================
  // ANALYTICS ENDPOINTS
  // =========================================================
  app.get('/api/analytics/overview', (_req: Request, res: Response) => {
    res.json(getAnalyticsOverview());
  });

  app.get('/api/analytics/severity', (_req: Request, res: Response) => {
    const overview = getAnalyticsOverview();
    res.json({ severityStats: overview.severityStats });
  });

  app.get('/api/analytics/trends', (_req: Request, res: Response) => {
    const overview = getAnalyticsOverview();
    res.json({ trends: overview.trends });
  });

  app.get('/api/analytics/false-positives', (_req: Request, res: Response) => {
    const overview = getAnalyticsOverview();
    res.json({
      totalInspected: overview.totalInspected,
      falsePositiveCount: overview.falsePositiveCount,
      confirmedDefectCount: overview.confirmedDefectCount,
      humanReviewedCount: overview.humanReviewedCount,
      reviewRequiredCount: overview.reviewRequiredCount,
      falsePositiveRate: overview.falsePositiveRate,
      trends: overview.trends.map((t) => ({
        bucket: t.bucket,
        falsePositives: t.falsePositives,
        defects: t.defect,
      })),
    });
  });

  // =========================================================
  // MODEL & TRAINING ENDPOINTS
  // =========================================================
  app.get('/api/model/status', (_req: Request, res: Response) => {
    const models = listAllModelVersions();
    const trained = models.filter((m) => m.trainingStatus === 'TRAINED');
    res.json({
      ready: trained.length > 0,
      trainedCount: trained.length,
      totalCategories: models.length,
      calibratedCount: trained.filter((m) => m.calibrationStatus === 'CALIBRATED').length,
      models,
    });
  });

  app.get('/api/model/info', (_req: Request, res: Response) => {
    const settings = getSystemSettings();
    const models = listAllModelVersions();
    res.json({
      activeArchitecture: settings.architecture,
      inputImageSize: settings.inputImageSize,
      coresetRatio: settings.coresetRatio,
      models,
    });
  });

  app.post('/api/model/train', upload.array('images', 10), async (req: Request, res: Response) => {
    try {
      const category = String(req.body?.category || '').trim();
      if (!isValidCategory(category)) {
        res.status(400).json({ error: 'Please select a valid MVTec AD product category.' });
        return;
      }

      const archRaw = String(req.body?.architecture || '').trim();
      const architecture =
        archRaw === 'EfficientAD-Lite' ? 'EfficientAD-Lite' : 'PatchCore-MultiScale';

      const files = (req.files as Express.Multer.File[] | undefined) || [];
      const buffers = files.map((f) => f.buffer);

      const bank = await trainCategoryModel({
        category,
        normalImageBuffers: buffers.length > 0 ? buffers : undefined,
        architecture,
      });

      const models = listAllModelVersions();
      const updated = models.find((m) => m.category === category);
      res.json({
        message: `Normal-pattern ${bank.architecture} memory bank trained for ${category} (${bank.coreset.length} coreset prototypes).`,
        model: updated,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Model training failed.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/model/evaluate', async (req: Request, res: Response) => {
    try {
      const category = String(req.body?.category || '').trim();
      if (!isValidCategory(category)) {
        res.status(400).json({ error: 'Please select a valid product category to evaluate.' });
        return;
      }
      const { metrics } = await evaluateAndCalibrateCategory(category);
      const models = listAllModelVersions();
      const updated = models.find((m) => m.category === category);
      res.json({
        message: `Held-out evaluation & Platt confidence calibration completed for ${category}.`,
        metrics,
        model: updated,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Evaluation pipeline failed.';
      res.status(400).json({ error: message });
    }
  });

  // =========================================================
  // DISTRIBUTION SHIFT MONITOR ENDPOINTS
  // =========================================================
  app.get('/api/drift/status', (req: Request, res: Response) => {
    const categoryParam = typeof req.query.category === 'string' ? req.query.category : undefined;
    const settings = getSystemSettings();
    const latest = getLatestInspectionWithStats(categoryParam);
    const activeCategory =
      categoryParam && categoryParam !== 'ALL'
        ? categoryParam
        : latest?.inspection.category || 'Metal Nut';
    const bank = loadMemoryBank(activeCategory);
    const history = listDriftEvents(40);
    const trajectory = getDriftTrajectory(categoryParam, 30);

    const payload: DriftStatusResponse = {
      overallStatus: latest ? latest.inspection.driftStatus : 'STABLE',
      latestDistance: latest ? latest.inspection.driftDistance : null,
      warningThreshold: settings.driftWarningThreshold,
      criticalThreshold: settings.driftCriticalThreshold,
      totalAlerts: history.length,
      referenceStats: bank?.globalRefMean ?? null,
      currentStats: latest ? latest.globalStats : null,
      featureComparison: latest ? latest.inspection.driftBreakdown : [],
      activeCategory,
      history,
      trajectory,
    };

    res.json(payload);
  });

  app.get('/api/drift/history', (_req: Request, res: Response) => {
    res.json({
      events: listDriftEvents(100),
      trajectory: getDriftTrajectory(undefined, 50),
    });
  });

  // =========================================================
  // HUMAN REVIEW CENTER ENDPOINTS
  // =========================================================
  app.get('/api/reviews/pending', (_req: Request, res: Response) => {
    const pending = listPendingReviews();
    const reviewed = listReviewedInspections();
    const overview = getAnalyticsOverview();
    res.json({
      pending,
      reviewed,
      summary: {
        totalInspected: overview.totalInspected,
        falsePositiveCount: overview.falsePositiveCount,
        confirmedDefectCount: overview.confirmedDefectCount,
        humanReviewedCount: overview.humanReviewedCount,
        reviewRequiredCount: pending.length,
      },
    });
  });

  app.post('/api/reviews/:id/decision', (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    if (!/^INS-[A-F0-9]{8}$/.test(id)) {
      res.status(400).json({ error: 'Invalid inspection ID format.' });
      return;
    }

    const decision = String(req.body?.decision || '');
    if (!['APPROVED_NORMAL', 'CONFIRMED_DEFECT', 'FALSE_POSITIVE'].includes(decision)) {
      res.status(400).json({
        error: 'Decision must be APPROVED_NORMAL, CONFIRMED_DEFECT, or FALSE_POSITIVE.',
      });
      return;
    }

    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 1000) : '';
    const updated = recordReviewDecision({
      decisionId: `REV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      inspectionId: id,
      decision: decision as 'APPROVED_NORMAL' | 'CONFIRMED_DEFECT' | 'FALSE_POSITIVE',
      notes,
    });

    if (!updated) {
      res.status(404).json({ error: 'Inspection record not found.' });
      return;
    }

    res.json({ inspection: updated });
  });

  // =========================================================
  // REPORTS ENDPOINT
  // =========================================================
  app.get('/api/reports/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    if (!/^INS-[A-F0-9]{8}$/.test(id)) {
      res.status(400).json({ error: 'Invalid inspection ID format.' });
      return;
    }
    const inspection = getInspectionById(id);
    if (!inspection) {
      res.status(404).json({ error: 'Inspection record not found.' });
      return;
    }

    const report = {
      reportHeader: {
        platform: 'PROMETHEUS-X',
        subtitle: 'Open-Set Industrial Anomaly Inspection Report',
        generatedAt: new Date().toISOString(),
        inspectionId: inspection.id,
      },
      specimen: {
        category: inspection.category,
        sourceFilename: inspection.originalFilename,
        resolution: `${inspection.imageWidth}x${inspection.imageHeight}`,
        inspectedAt: inspection.createdAt,
      },
      modelAssessment: {
        architecture: inspection.architecture,
        modelVersion: inspection.modelVersion,
        baselineMode: inspection.baselineMode,
        inferenceTimeMs: inspection.inferenceMs,
        recommendation: inspection.prediction,
        anomalyScore: inspection.anomalyScore,
        rawPatchDistance: inspection.rawDistance,
        calibrationStatus: inspection.calibrationStatus,
        calibratedConfidence: inspection.calibratedConfidence,
        uncertaintyEntropy: inspection.uncertaintyScore,
      },
      severityEstimation: {
        estimatedCategory: inspection.severity,
        affectedAreaPct: inspection.affectedAreaPct,
        peakAnomalyIntensity: inspection.peakIntensity,
        meanAnomalyIntensity: inspection.meanAnomalyIntensity,
        detectedRegionsCount: inspection.regions.length,
        regions: inspection.regions,
        disclaimer: inspection.severityNote,
      },
      distributionShift: {
        status: inspection.driftStatus,
        mahalanobisDistance: inspection.driftDistance,
        note: 'Distribution shift monitoring detects changes in imaging or material conditions and does not automatically prove product defectiveness.',
        featureBreakdown: inspection.driftBreakdown,
      },
      humanVerification: {
        reviewStatus: inspection.reviewStatus,
        reviewerNotes: inspection.reviewNotes,
        reviewedAt: inspection.reviewedAt,
      },
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="PROMETHEUS-X_${inspection.id}_report.json"`
    );
    res.send(JSON.stringify(report, null, 2));
  });

  // =========================================================
  // SETTINGS ENDPOINTS
  // =========================================================
  app.get('/api/settings', (_req: Request, res: Response) => {
    res.json({ settings: getSystemSettings() });
  });

  app.put('/api/settings', (req: Request, res: Response) => {
    const validation = validateSystemSettings(req.body || {});
    if (!validation.valid || !validation.sanitized) {
      res.status(400).json({ error: validation.errors[0], errors: validation.errors });
      return;
    }
    const saved = saveSystemSettings(validation.sanitized);
    res.json({ settings: saved });
  });

  // Global error handler for multer & API routes (never leaks paths/stacks)
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'Uploaded file exceeds the 10 MB size limit.' });
        return;
      }
      res.status(400).json({ error: 'File upload failed validation.' });
      return;
    }
    res.status(400).json({ error: err.message || 'An unexpected request error occurred.' });
  });

  // =========================================================
  // VITE DEV MIDDLEWARE / PRODUCTION STATIC ASSETS
  // =========================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PROMETHEUS-X server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start PROMETHEUS-X server:', err);
  process.exit(1);
});
