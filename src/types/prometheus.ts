export const MVTEC_CATEGORIES = [
  'General Surface',
  'Bottle',
  'Cable',
  'Capsule',
  'Carpet',
  'Grid',
  'Hazelnut',
  'Leather',
  'Metal Nut',
  'Pill',
  'Screw',
  'Tile',
  'Toothbrush',
  'Transistor',
  'Wood',
  'Zipper',
] as const;

export type MvtecCategory = (typeof MVTEC_CATEGORIES)[number];

export type MarkerShape = 'rectangle' | 'circle';
export type PredictionOutcome = 'PASS' | 'DEFECT' | 'REVIEW';
export type SeverityLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type DriftStatus = 'STABLE' | 'POSSIBLE_SHIFT' | 'SIGNIFICANT_SHIFT';
export type ReviewStatus =
  | 'NOT_REQUIRED'
  | 'PENDING'
  | 'APPROVED_NORMAL'
  | 'CONFIRMED_DEFECT'
  | 'FALSE_POSITIVE';

export interface AnomalyRegion {
  id: number;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  areaPixels: number;
  areaPct: number;
  peakIntensity: number;
  meanIntensity: number;
  centroidX: number;
  centroidY: number;
}

export interface FeatureStatVector {
  luminanceMean: number;
  luminanceStd: number;
  redMean: number;
  greenMean: number;
  blueMean: number;
  contrastEnergy: number;
  edgeDensity: number;
  highFreqLaplacian: number;
}

export interface DriftFeatureDelta {
  feature: string;
  label: string;
  referenceMean: number;
  currentValue: number;
  zScore: number;
}

export interface InspectionRecord {
  id: string;
  category: string;
  originalFilename: string;
  originalUrl: string;
  heatmapUrl: string;
  overlayUrl: string;
  maskUrl: string;
  imageWidth: number;
  imageHeight: number;
  anomalyScore: number;
  rawDistance: number;
  prediction: PredictionOutcome;
  severity: SeverityLevel;
  severityNote: string;
  affectedAreaPct: number;
  peakIntensity: number;
  meanAnomalyIntensity: number;
  regions: AnomalyRegion[];
  calibrationStatus: 'CALIBRATED' | 'UNCALIBRATED';
  calibratedConfidence: number | null;
  uncertaintyScore: number | null;
  driftStatus: DriftStatus;
  driftDistance: number;
  driftBreakdown: DriftFeatureDelta[];
  baselineMode: 'TRAINED_PATCHCORE' | 'SELF_REFERENCE_OPEN_SET' | 'VISION_OPEN_SET';
  modelVersion: string;
  architecture: string;
  inferenceMs: number;
  reviewStatus: ReviewStatus;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface CalibrationBin {
  binIndex: number;
  rangeLabel: string;
  avgConfidence: number;
  empiricalAccuracy: number;
  count: number;
}

export interface EvaluationMetrics {
  imageAuroc: number;
  imageAp: number;
  f1AtThreshold: number;
  operatingThreshold: number;
  pixelAuroc: number;
  pixelAp: number;
  ece: number;
  sampleCount: number;
  normalCount: number;
  anomalyCount: number;
  evaluatedAt: string;
  reliabilityBins: CalibrationBin[];
}

export interface ModelVersionInfo {
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
}

export interface SystemSettings {
  anomalyThreshold: number;
  uncertaintyMargin: number;
  maskThreshold: number;
  severityLowMaxAreaPct: number;
  severityMediumMaxAreaPct: number;
  severityLowMaxIntensity: number;
  severityMediumMaxIntensity: number;
  calibrationEnabled: boolean;
  minConfidenceFloor: number;
  driftWarningThreshold: number;
  driftCriticalThreshold: number;
  inputImageSize: 128 | 256 | 384;
  gaussianSigma: number;
  normalizationMode: 'standard' | 'robust';
  architecture: 'PatchCore-MultiScale' | 'EfficientAD-Lite';
  coresetRatio: number;
  datasetPathLabel: string;
}

export interface AnalyticsOverview {
  totalInspected: number;
  normalCount: number;
  anomaliesDetected: number;
  reviewRequiredCount: number;
  highSeverityCount: number;
  falsePositiveCount: number;
  confirmedDefectCount: number;
  humanReviewedCount: number;
  falsePositiveRate: number;
  defectDetectionRate: number;
  driftAlertsCount: number;
  categoryStats: Array<{
    category: string;
    total: number;
    normal: number;
    defect: number;
    review: number;
    avgScore: number;
  }>;
  severityStats: Array<{
    severity: SeverityLevel;
    count: number;
  }>;
  trends: Array<{
    bucket: string;
    total: number;
    normal: number;
    defect: number;
    review: number;
    falsePositives: number;
    avgScore: number;
  }>;
}

export interface DriftEventRecord {
  id: string;
  inspectionId: string;
  category: string;
  driftStatus: DriftStatus;
  driftDistance: number;
  dominantFactor: string;
  createdAt: string;
}

export interface DriftStatusResponse {
  overallStatus: DriftStatus;
  latestDistance: number | null;
  warningThreshold: number;
  criticalThreshold: number;
  totalAlerts: number;
  referenceStats: FeatureStatVector | null;
  currentStats: FeatureStatVector | null;
  featureComparison: DriftFeatureDelta[];
  activeCategory: string;
  history: DriftEventRecord[];
  trajectory: Array<{
    timestamp: string;
    inspectionId: string;
    category: string;
    distance: number;
    status: DriftStatus;
  }>;
}

export interface SampleSpecimen {
  key: string;
  label: string;
  category: MvtecCategory;
  expectedKind: 'Normal Reference' | 'Unseen Defect Test';
  description: string;
  imageUrl: string;
}
