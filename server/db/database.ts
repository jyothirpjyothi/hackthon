import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import {
  MVTEC_CATEGORIES,
  type AnalyticsOverview,
  type DriftEventRecord,
  type DriftStatus,
  type EvaluationMetrics,
  type FeatureStatVector,
  type InspectionRecord,
  type ModelVersionInfo,
  type ReviewStatus,
  type SeverityLevel,
  type SystemSettings,
} from '../../src/types/prometheus';
import { DEFAULT_SYSTEM_SETTINGS } from '../ml/anomalyMath';

const DATA_DIR = path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'prometheus_x.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize all 5 required tables cleanly
db.exec(`
  CREATE TABLE IF NOT EXISTS inspections (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    original_file TEXT NOT NULL,
    heatmap_file TEXT NOT NULL,
    overlay_file TEXT NOT NULL,
    mask_file TEXT NOT NULL,
    image_width INTEGER NOT NULL,
    image_height INTEGER NOT NULL,
    anomaly_score REAL NOT NULL,
    raw_distance REAL NOT NULL,
    prediction TEXT NOT NULL,
    severity TEXT NOT NULL,
    severity_note TEXT NOT NULL,
    affected_area_pct REAL NOT NULL,
    peak_intensity REAL NOT NULL,
    mean_anomaly_intensity REAL NOT NULL,
    regions_json TEXT NOT NULL,
    calibration_status TEXT NOT NULL,
    calibrated_confidence REAL,
    uncertainty_score REAL,
    drift_status TEXT NOT NULL,
    drift_distance REAL NOT NULL,
    drift_breakdown_json TEXT NOT NULL,
    global_stats_json TEXT NOT NULL,
    baseline_mode TEXT NOT NULL,
    model_version TEXT NOT NULL,
    architecture TEXT NOT NULL,
    inference_ms INTEGER NOT NULL,
    review_status TEXT NOT NULL,
    review_notes TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS model_versions (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL UNIQUE,
    model_name TEXT NOT NULL,
    architecture TEXT NOT NULL,
    dataset_name TEXT NOT NULL,
    version TEXT NOT NULL,
    input_size INTEGER NOT NULL,
    coreset_size INTEGER NOT NULL,
    training_image_count INTEGER NOT NULL,
    training_status TEXT NOT NULL,
    calibration_status TEXT NOT NULL,
    trained_at TEXT,
    evaluation_metrics_json TEXT,
    reference_stats_json TEXT,
    checkpoint_file TEXT
  );

  CREATE TABLE IF NOT EXISTS review_decisions (
    id TEXT PRIMARY KEY,
    inspection_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    notes TEXT,
    previous_prediction TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS drift_events (
    id TEXT PRIMARY KEY,
    inspection_id TEXT NOT NULL,
    category TEXT NOT NULL,
    drift_status TEXT NOT NULL,
    drift_distance REAL NOT NULL,
    dominant_factor TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_inspections_created ON inspections(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_inspections_category ON inspections(category);
  CREATE INDEX IF NOT EXISTS idx_inspections_review ON inspections(review_status);
  CREATE INDEX IF NOT EXISTS idx_drift_created ON drift_events(created_at DESC);
`);

function mapRowToInspection(row: Record<string, unknown>): InspectionRecord {
  return {
    id: String(row.id),
    category: String(row.category),
    originalFilename: String(row.original_filename),
    originalUrl: `/api/media/uploads/${String(row.original_file)}`,
    heatmapUrl: `/api/media/results/${String(row.heatmap_file)}`,
    overlayUrl: `/api/media/results/${String(row.overlay_file)}`,
    maskUrl: `/api/media/results/${String(row.mask_file)}`,
    imageWidth: Number(row.image_width),
    imageHeight: Number(row.image_height),
    anomalyScore: Number(row.anomaly_score),
    rawDistance: Number(row.raw_distance),
    prediction: String(row.prediction) as InspectionRecord['prediction'],
    severity: String(row.severity) as SeverityLevel,
    severityNote: String(row.severity_note),
    affectedAreaPct: Number(row.affected_area_pct),
    peakIntensity: Number(row.peak_intensity),
    meanAnomalyIntensity: Number(row.mean_anomaly_intensity),
    regions: JSON.parse(String(row.regions_json || '[]')),
    calibrationStatus: String(row.calibration_status) as 'CALIBRATED' | 'UNCALIBRATED',
    calibratedConfidence:
      row.calibrated_confidence === null || row.calibrated_confidence === undefined
        ? null
        : Number(row.calibrated_confidence),
    uncertaintyScore:
      row.uncertainty_score === null || row.uncertainty_score === undefined
        ? null
        : Number(row.uncertainty_score),
    driftStatus: String(row.drift_status) as DriftStatus,
    driftDistance: Number(row.drift_distance),
    driftBreakdown: JSON.parse(String(row.drift_breakdown_json || '[]')),
    baselineMode: String(row.baseline_mode) as InspectionRecord['baselineMode'],
    modelVersion: String(row.model_version),
    architecture: String(row.architecture),
    inferenceMs: Number(row.inference_ms),
    reviewStatus: String(row.review_status) as ReviewStatus,
    reviewNotes: row.review_notes ? String(row.review_notes) : null,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    createdAt: String(row.created_at),
  };
}

export function getSystemSettings(): SystemSettings {
  const row = db
    .prepare('SELECT value_json FROM system_settings WHERE key = ?')
    .get('global') as { value_json: string } | undefined;
  if (!row) {
    saveSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    return { ...DEFAULT_SYSTEM_SETTINGS };
  }
  try {
    return { ...DEFAULT_SYSTEM_SETTINGS, ...JSON.parse(row.value_json) };
  } catch {
    return { ...DEFAULT_SYSTEM_SETTINGS };
  }
}

export function saveSystemSettings(settings: SystemSettings): SystemSettings {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO system_settings (key, value_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
  ).run('global', JSON.stringify(settings), now);
  return settings;
}

export interface InsertInspectionParams {
  id: string;
  category: string;
  originalFilename: string;
  originalFile: string;
  heatmapFile: string;
  overlayFile: string;
  maskFile: string;
  imageWidth: number;
  imageHeight: number;
  anomalyScore: number;
  rawDistance: number;
  prediction: InspectionRecord['prediction'];
  severity: SeverityLevel;
  severityNote: string;
  affectedAreaPct: number;
  peakIntensity: number;
  meanAnomalyIntensity: number;
  regions: InspectionRecord['regions'];
  calibrationStatus: 'CALIBRATED' | 'UNCALIBRATED';
  calibratedConfidence: number | null;
  uncertaintyScore: number | null;
  driftStatus: DriftStatus;
  driftDistance: number;
  driftBreakdown: InspectionRecord['driftBreakdown'];
  globalStats: FeatureStatVector;
  baselineMode: InspectionRecord['baselineMode'];
  modelVersion: string;
  architecture: string;
  inferenceMs: number;
  reviewStatus: ReviewStatus;
  createdAt: string;
}

export function insertInspection(p: InsertInspectionParams): InspectionRecord {
  db.prepare(
    `INSERT INTO inspections (
      id, category, original_filename, original_file, heatmap_file, overlay_file, mask_file,
      image_width, image_height, anomaly_score, raw_distance, prediction, severity, severity_note,
      affected_area_pct, peak_intensity, mean_anomaly_intensity, regions_json,
      calibration_status, calibrated_confidence, uncertainty_score,
      drift_status, drift_distance, drift_breakdown_json, global_stats_json,
      baseline_mode, model_version, architecture, inference_ms, review_status, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )`
  ).run(
    p.id,
    p.category,
    p.originalFilename,
    p.originalFile,
    p.heatmapFile,
    p.overlayFile,
    p.maskFile,
    p.imageWidth,
    p.imageHeight,
    p.anomalyScore,
    p.rawDistance,
    p.prediction,
    p.severity,
    p.severityNote,
    p.affectedAreaPct,
    p.peakIntensity,
    p.meanAnomalyIntensity,
    JSON.stringify(p.regions),
    p.calibrationStatus,
    p.calibratedConfidence,
    p.uncertaintyScore,
    p.driftStatus,
    p.driftDistance,
    JSON.stringify(p.driftBreakdown),
    JSON.stringify(p.globalStats),
    p.baselineMode,
    p.modelVersion,
    p.architecture,
    p.inferenceMs,
    p.reviewStatus,
    p.createdAt
  );

  return getInspectionById(p.id)!;
}

export function listInspections(filters?: {
  search?: string;
  category?: string;
  prediction?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}): InspectionRecord[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.category && filters.category !== 'ALL') {
    conditions.push('category = ?');
    params.push(filters.category);
  }
  if (filters?.prediction && filters.prediction !== 'ALL') {
    conditions.push('prediction = ?');
    params.push(filters.prediction);
  }
  if (filters?.search && filters.search.trim().length > 0) {
    const like = `%${filters.search.trim()}%`;
    conditions.push('(id LIKE ? OR category LIKE ? OR original_filename LIKE ? OR COALESCE(review_notes, \'\') LIKE ?)');
    params.push(like, like, like, like);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const allowedSortCols: Record<string, string> = {
    createdAt: 'created_at',
    anomalyScore: 'anomaly_score',
    category: 'category',
    severity: `CASE severity WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 1 ELSE 0 END`,
  };
  const orderCol = allowedSortCols[filters?.sortBy || 'createdAt'] || 'created_at';
  const orderDir = filters?.sortDir === 'asc' ? 'ASC' : 'DESC';

  const rows = db
    .prepare(`SELECT * FROM inspections ${whereClause} ORDER BY ${orderCol} ${orderDir} LIMIT 200`)
    .all(...params) as Record<string, unknown>[];

  return rows.map(mapRowToInspection);
}

export function getInspectionById(id: string): InspectionRecord | null {
  const row = db.prepare('SELECT * FROM inspections WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapRowToInspection(row) : null;
}

export function getInspectionFiles(id: string): {
  originalFile: string;
  heatmapFile: string;
  overlayFile: string;
  maskFile: string;
} | null {
  const row = db
    .prepare('SELECT original_file, heatmap_file, overlay_file, mask_file FROM inspections WHERE id = ?')
    .get(id) as Record<string, string> | undefined;
  if (!row) return null;
  return {
    originalFile: row.original_file,
    heatmapFile: row.heatmap_file,
    overlayFile: row.overlay_file,
    maskFile: row.mask_file,
  };
}

export function deleteInspectionById(id: string): boolean {
  const result = db.prepare('DELETE FROM inspections WHERE id = ?').run(id);
  return result.changes > 0;
}

export function insertDriftEvent(event: DriftEventRecord): void {
  db.prepare(
    `INSERT INTO drift_events (id, inspection_id, category, drift_status, drift_distance, dominant_factor, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    event.id,
    event.inspectionId,
    event.category,
    event.driftStatus,
    event.driftDistance,
    event.dominantFactor,
    event.createdAt
  );
}

export function listDriftEvents(limit = 50): DriftEventRecord[] {
  const rows = db
    .prepare('SELECT * FROM drift_events ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    inspectionId: String(r.inspection_id),
    category: String(r.category),
    driftStatus: String(r.drift_status) as DriftStatus,
    driftDistance: Number(r.drift_distance),
    dominantFactor: String(r.dominant_factor),
    createdAt: String(r.created_at),
  }));
}

export function getLatestInspectionWithStats(category?: string): {
  inspection: InspectionRecord;
  globalStats: FeatureStatVector;
} | null {
  const row = (
    category && category !== 'ALL'
      ? db
          .prepare('SELECT * FROM inspections WHERE category = ? ORDER BY created_at DESC LIMIT 1')
          .get(category)
      : db.prepare('SELECT * FROM inspections ORDER BY created_at DESC LIMIT 1').get()
  ) as Record<string, unknown> | undefined;

  if (!row) return null;
  return {
    inspection: mapRowToInspection(row),
    globalStats: JSON.parse(String(row.global_stats_json)),
  };
}

export function getDriftTrajectory(category?: string, limit = 30): Array<{
  timestamp: string;
  inspectionId: string;
  category: string;
  distance: number;
  status: DriftStatus;
}> {
  const rows = (
    category && category !== 'ALL'
      ? db
          .prepare(
            'SELECT id, category, drift_distance, drift_status, created_at FROM inspections WHERE category = ? ORDER BY created_at DESC LIMIT ?'
          )
          .all(category, limit)
      : db
          .prepare(
            'SELECT id, category, drift_distance, drift_status, created_at FROM inspections ORDER BY created_at DESC LIMIT ?'
          )
          .all(limit)
  ) as Array<Record<string, unknown>>;

  return rows.reverse().map((r) => ({
    timestamp: String(r.created_at),
    inspectionId: String(r.id),
    category: String(r.category),
    distance: Number(r.drift_distance),
    status: String(r.drift_status) as DriftStatus,
  }));
}

export function listPendingReviews(): InspectionRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM inspections
       WHERE review_status = 'PENDING'
          OR (prediction IN ('DEFECT', 'REVIEW') AND review_status = 'NOT_REQUIRED')
       ORDER BY created_at DESC LIMIT 100`
    )
    .all() as Record<string, unknown>[];
  return rows.map(mapRowToInspection);
}

export function listReviewedInspections(): InspectionRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM inspections
       WHERE review_status IN ('APPROVED_NORMAL', 'CONFIRMED_DEFECT', 'FALSE_POSITIVE')
       ORDER BY reviewed_at DESC LIMIT 100`
    )
    .all() as Record<string, unknown>[];
  return rows.map(mapRowToInspection);
}

export function recordReviewDecision(params: {
  decisionId: string;
  inspectionId: string;
  decision: 'APPROVED_NORMAL' | 'CONFIRMED_DEFECT' | 'FALSE_POSITIVE';
  notes: string;
}): InspectionRecord | null {
  const existing = getInspectionById(params.inspectionId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO review_decisions (id, inspection_id, decision, notes, previous_prediction, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(params.decisionId, params.inspectionId, params.decision, params.notes, existing.prediction, now);

    db.prepare(
      `UPDATE inspections
       SET review_status = ?, review_notes = ?, reviewed_at = ?
       WHERE id = ?`
    ).run(params.decision, params.notes || null, now, params.inspectionId);
  });
  tx();

  return getInspectionById(params.inspectionId);
}

export function upsertModelVersion(info: {
  id: string;
  category: string;
  modelName: string;
  architecture: 'PatchCore-MultiScale' | 'EfficientAD-Lite';
  datasetName: string;
  version: string;
  inputSize: number;
  coresetSize: number;
  trainingImageCount: number;
  trainingStatus: 'TRAINED' | 'UNTRAINED';
  calibrationStatus: 'CALIBRATED' | 'UNCALIBRATED';
  trainedAt: string | null;
  evaluationMetrics: EvaluationMetrics | null;
  referenceStats: FeatureStatVector | null;
  checkpointFile: string | null;
}): void {
  db.prepare(
    `INSERT INTO model_versions (
      id, category, model_name, architecture, dataset_name, version, input_size,
      coreset_size, training_image_count, training_status, calibration_status,
      trained_at, evaluation_metrics_json, reference_stats_json, checkpoint_file
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(category) DO UPDATE SET
      id = excluded.id,
      model_name = excluded.model_name,
      architecture = excluded.architecture,
      dataset_name = excluded.dataset_name,
      version = excluded.version,
      input_size = excluded.input_size,
      coreset_size = excluded.coreset_size,
      training_image_count = excluded.training_image_count,
      training_status = excluded.training_status,
      calibration_status = excluded.calibration_status,
      trained_at = excluded.trained_at,
      evaluation_metrics_json = excluded.evaluation_metrics_json,
      reference_stats_json = excluded.reference_stats_json,
      checkpoint_file = excluded.checkpoint_file`
  ).run(
    info.id,
    info.category,
    info.modelName,
    info.architecture,
    info.datasetName,
    info.version,
    info.inputSize,
    info.coresetSize,
    info.trainingImageCount,
    info.trainingStatus,
    info.calibrationStatus,
    info.trainedAt,
    info.evaluationMetrics ? JSON.stringify(info.evaluationMetrics) : null,
    info.referenceStats ? JSON.stringify(info.referenceStats) : null,
    info.checkpointFile
  );
}

export function listAllModelVersions(): ModelVersionInfo[] {
  const rows = db.prepare('SELECT * FROM model_versions').all() as Array<Record<string, unknown>>;
  const byCat = new Map<string, ModelVersionInfo>();

  for (const r of rows) {
    byCat.set(String(r.category), {
      id: String(r.id),
      category: String(r.category),
      modelName: String(r.model_name),
      architecture: String(r.architecture) as ModelVersionInfo['architecture'],
      datasetName: String(r.dataset_name),
      version: String(r.version),
      inputSize: Number(r.input_size),
      coresetSize: Number(r.coreset_size),
      trainingImageCount: Number(r.training_image_count),
      trainingStatus: String(r.training_status) as 'TRAINED' | 'UNTRAINED',
      calibrationStatus: String(r.calibration_status) as 'CALIBRATED' | 'UNCALIBRATED',
      trainedAt: r.trained_at ? String(r.trained_at) : null,
      evaluationMetrics: r.evaluation_metrics_json
        ? JSON.parse(String(r.evaluation_metrics_json))
        : null,
      referenceStats: r.reference_stats_json ? JSON.parse(String(r.reference_stats_json)) : null,
    });
  }

  return MVTEC_CATEGORIES.map((category) => {
    const existing = byCat.get(category);
    if (existing) return existing;
    return {
      id: `untrained-${category.toLowerCase().replace(/\s+/g, '-')}`,
      category,
      modelName: category === 'General Surface' ? 'PatchCore + Vision Open-Set' : 'PatchCore-MultiScale',
      architecture: 'PatchCore-MultiScale',
      datasetName:
        category === 'General Surface'
          ? 'Open-Set Vision / Multi-Surface (Zero-Shot)'
          : 'MVTec AD (Awaiting Normal Baseline)',
      version: '0.0.0',
      inputSize: 256,
      coresetSize: 0,
      trainingImageCount: 0,
      trainingStatus: 'UNTRAINED',
      calibrationStatus: 'UNCALIBRATED',
      trainedAt: null,
      evaluationMetrics: null,
      referenceStats: null,
    };
  });
}

export function getAnalyticsOverview(): AnalyticsOverview {
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN prediction = 'PASS' THEN 1 ELSE 0 END) as normal_count,
         SUM(CASE WHEN prediction = 'DEFECT' THEN 1 ELSE 0 END) as defect_count,
         SUM(CASE WHEN prediction = 'REVIEW' THEN 1 ELSE 0 END) as review_count,
         SUM(CASE WHEN severity = 'HIGH' THEN 1 ELSE 0 END) as high_severity_count,
         SUM(CASE WHEN review_status = 'FALSE_POSITIVE' THEN 1 ELSE 0 END) as fp_count,
         SUM(CASE WHEN review_status = 'CONFIRMED_DEFECT' THEN 1 ELSE 0 END) as confirmed_defect_count,
         SUM(CASE WHEN review_status IN ('APPROVED_NORMAL', 'CONFIRMED_DEFECT', 'FALSE_POSITIVE') THEN 1 ELSE 0 END) as reviewed_count,
         SUM(CASE WHEN drift_status != 'STABLE' THEN 1 ELSE 0 END) as drift_alerts_count
       FROM inspections`
    )
    .get() as Record<string, number | null>;

  const totalInspected = Number(totals.total || 0);
  const normalCount = Number(totals.normal_count || 0);
  const anomaliesDetected = Number(totals.defect_count || 0);
  const reviewRequiredCount = Number(totals.review_count || 0);
  const highSeverityCount = Number(totals.high_severity_count || 0);
  const falsePositiveCount = Number(totals.fp_count || 0);
  const confirmedDefectCount = Number(totals.confirmed_defect_count || 0);
  const humanReviewedCount = Number(totals.reviewed_count || 0);
  const driftAlertsCount = Number(totals.drift_alerts_count || 0);

  const flaggedTotal = anomaliesDetected + reviewRequiredCount;
  const falsePositiveRate =
    flaggedTotal > 0 ? Number(((falsePositiveCount / flaggedTotal) * 100).toFixed(1)) : 0;
  const defectDetectionRate =
    totalInspected > 0 ? Number(((anomaliesDetected / totalInspected) * 100).toFixed(1)) : 0;

  const catRows = db
    .prepare(
      `SELECT
         category,
         COUNT(*) as total,
         SUM(CASE WHEN prediction = 'PASS' THEN 1 ELSE 0 END) as normal,
         SUM(CASE WHEN prediction = 'DEFECT' THEN 1 ELSE 0 END) as defect,
         SUM(CASE WHEN prediction = 'REVIEW' THEN 1 ELSE 0 END) as review,
         AVG(anomaly_score) as avg_score
       FROM inspections
       GROUP BY category
       ORDER BY total DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const sevRows = db
    .prepare(
      `SELECT severity, COUNT(*) as count FROM inspections GROUP BY severity`
    )
    .all() as Array<{ severity: SeverityLevel; count: number }>;

  const sevMap = new Map<SeverityLevel, number>([
    ['LOW', 0],
    ['MEDIUM', 0],
    ['HIGH', 0],
    ['NONE', 0],
  ]);
  for (const r of sevRows) {
    sevMap.set(r.severity, Number(r.count));
  }

  // Group recent inspections into chronological buckets (by minute/hour or inspection index)
  const recentRows = db
    .prepare(
      `SELECT
         substr(created_at, 1, 16) as bucket,
         COUNT(*) as total,
         SUM(CASE WHEN prediction = 'PASS' THEN 1 ELSE 0 END) as normal,
         SUM(CASE WHEN prediction = 'DEFECT' THEN 1 ELSE 0 END) as defect,
         SUM(CASE WHEN prediction = 'REVIEW' THEN 1 ELSE 0 END) as review,
         SUM(CASE WHEN review_status = 'FALSE_POSITIVE' THEN 1 ELSE 0 END) as false_positives,
         AVG(anomaly_score) as avg_score
       FROM inspections
       GROUP BY substr(created_at, 1, 16)
       ORDER BY bucket ASC
       LIMIT 24`
    )
    .all() as Array<Record<string, unknown>>;

  return {
    totalInspected,
    normalCount,
    anomaliesDetected,
    reviewRequiredCount,
    highSeverityCount,
    falsePositiveCount,
    confirmedDefectCount,
    humanReviewedCount,
    falsePositiveRate,
    defectDetectionRate,
    driftAlertsCount,
    categoryStats: catRows.map((r) => ({
      category: String(r.category),
      total: Number(r.total),
      normal: Number(r.normal),
      defect: Number(r.defect),
      review: Number(r.review),
      avgScore: Number(Number(r.avg_score || 0).toFixed(3)),
    })),
    severityStats: (['LOW', 'MEDIUM', 'HIGH'] as SeverityLevel[]).map((sev) => ({
      severity: sev,
      count: sevMap.get(sev) || 0,
    })),
    trends: recentRows.map((r) => ({
      bucket: String(r.bucket).replace('T', ' '),
      total: Number(r.total),
      normal: Number(r.normal),
      defect: Number(r.defect),
      review: Number(r.review),
      falsePositives: Number(r.false_positives),
      avgScore: Number(Number(r.avg_score || 0).toFixed(3)),
    })),
  };
}
