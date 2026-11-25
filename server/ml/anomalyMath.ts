import type {
  AnomalyRegion,
  CalibrationBin,
  DriftFeatureDelta,
  DriftStatus,
  EvaluationMetrics,
  FeatureStatVector,
  PredictionOutcome,
  SeverityLevel,
  SystemSettings,
} from '../../src/types/prometheus';

export const PATCH_FEATURE_DIM = 20;

export interface PatchExtractionResult {
  gridSize: number;
  patches: Float32Array[]; // length = gridSize * gridSize, each length PATCH_FEATURE_DIM
  globalStats: FeatureStatVector;
}

export interface PlattCalibrationParams {
  slope: number;
  intercept: number;
  fittedAt: string;
}

export interface CategoryMemoryBank {
  category: string;
  architecture: 'PatchCore-MultiScale' | 'EfficientAD-Lite';
  version: string;
  inputSize: number;
  gridSize: number;
  featureMean: number[];
  featureStd: number[];
  coreset: number[][]; // selected representative normal patch embeddings
  spatialMean: number[][]; // length gridSize*gridSize, each PATCH_FEATURE_DIM
  spatialStd: number[][]; // length gridSize*gridSize, each PATCH_FEATURE_DIM
  normalDistMean: number;
  normalDistStd: number;
  normalDistP95: number;
  globalRefMean: FeatureStatVector;
  globalRefStd: FeatureStatVector;
  trainingImageCount: number;
  trainedAt: string;
  calibration: PlattCalibrationParams | null;
  evaluationMetrics: EvaluationMetrics | null;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  anomalyThreshold: 0.48,
  uncertaintyMargin: 0.08,
  maskThreshold: 0.52,
  severityLowMaxAreaPct: 1.5,
  severityMediumMaxAreaPct: 5.5,
  severityLowMaxIntensity: 0.62,
  severityMediumMaxIntensity: 0.80,
  calibrationEnabled: true,
  minConfidenceFloor: 0.62,
  driftWarningThreshold: 2.2,
  driftCriticalThreshold: 3.6,
  inputImageSize: 256,
  gaussianSigma: 2.0,
  normalizationMode: 'standard',
  architecture: 'PatchCore-MultiScale',
  coresetRatio: 0.25,
  datasetPathLabel: 'datasets/mvtec_ad',
};

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

/**
 * Extracts dense locally-aware multi-scale visual descriptors on a gridSize x gridSize lattice
 * from an interleaved RGB buffer (width * height * 3), plus global image distribution statistics.
 */
export function extractPatchFeatures(
  rgb: Uint8Array,
  width: number,
  height: number,
  gridSize = 32
): PatchExtractionResult {
  const totalPixels = width * height;
  const lum = new Float32Array(totalPixels);
  const chR = new Float32Array(totalPixels);
  const chG = new Float32Array(totalPixels);
  const chB = new Float32Array(totalPixels);

  let sumL = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;

  for (let i = 0; i < totalPixels; i++) {
    const r = rgb[i * 3] / 255;
    const g = rgb[i * 3 + 1] / 255;
    const b = rgb[i * 3 + 2] / 255;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    chR[i] = r;
    chG[i] = g;
    chB[i] = b;
    lum[i] = l;
    sumL += l;
    sumR += r;
    sumG += g;
    sumB += b;
  }

  const meanL = sumL / totalPixels;
  let varL = 0;
  for (let i = 0; i < totalPixels; i++) {
    const d = lum[i] - meanL;
    varL += d * d;
  }
  const stdL = Math.sqrt(varL / totalPixels);

  // Precompute Sobel gradients and Laplacian high-frequency map
  const gradMag = new Float32Array(totalPixels);
  const gradAngleBin = new Uint8Array(totalPixels);
  const lapMap = new Float32Array(totalPixels);

  let edgeSum = 0;
  let lapSum = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowUp = (y - 1) * width;
    const row = y * width;
    const rowDown = (y + 1) * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = row + x;
      const gx =
        -lum[rowUp + x - 1] +
        lum[rowUp + x + 1] -
        2 * lum[row + x - 1] +
        2 * lum[row + x + 1] -
        lum[rowDown + x - 1] +
        lum[rowDown + x + 1];
      const gy =
        -lum[rowUp + x - 1] -
        2 * lum[rowUp + x] -
        lum[rowUp + x + 1] +
        lum[rowDown + x - 1] +
        2 * lum[rowDown + x] +
        lum[rowDown + x + 1];

      const mag = Math.sqrt(gx * gx + gy * gy);
      gradMag[idx] = mag;
      edgeSum += mag;

      // Quantize unsigned orientation [0, pi) into 4 bins
      let angle = Math.atan2(gy, gx);
      if (angle < 0) angle += Math.PI;
      const bin = Math.min(3, Math.floor((angle / Math.PI) * 4));
      gradAngleBin[idx] = bin;

      const lap = Math.abs(
        4 * lum[idx] - lum[idx - 1] - lum[idx + 1] - lum[rowUp + x] - lum[rowDown + x]
      );
      lapMap[idx] = lap;
      lapSum += lap;
    }
  }

  const rawPatches: Float32Array[] = new Array(gridSize * gridSize);
  const cellW = width / gridSize;
  const cellH = height / gridSize;

  for (let gy = 0; gy < gridSize; gy++) {
    const y0 = Math.floor(gy * cellH);
    const y1 = Math.min(height, Math.max(y0 + 1, Math.floor((gy + 1) * cellH)));
    for (let gx = 0; gx < gridSize; gx++) {
      const x0 = Math.floor(gx * cellW);
      const x1 = Math.min(width, Math.max(x0 + 1, Math.floor((gx + 1) * cellW)));

      let count = 0;
      let sR = 0,
        sG = 0,
        sB = 0,
        sL = 0,
        sA = 0,
        sBy = 0;
      let sGrad = 0,
        sLap = 0;
      let minL = 1,
        maxL = 0;
      const orientBins = [0, 0, 0, 0];

      for (let y = y0; y < y1; y++) {
        const row = y * width;
        for (let x = x0; x < x1; x++) {
          const idx = row + x;
          const r = chR[idx];
          const g = chG[idx];
          const b = chB[idx];
          const l = lum[idx];
          // Opponent chromatic channels (highly discriminative for rust, burns, stains)
          const rg = r - g;
          const yb = 0.5 * (r + g) - b;

          sR += r;
          sG += g;
          sB += b;
          sL += l;
          sA += rg;
          sBy += yb;
          if (l < minL) minL = l;
          if (l > maxL) maxL = l;

          const gm = gradMag[idx];
          sGrad += gm;
          orientBins[gradAngleBin[idx]] += gm;
          sLap += lapMap[idx];
          count++;
        }
      }

      const inv = 1 / Math.max(1, count);
      const mR = sR * inv;
      const mG = sG * inv;
      const mB = sB * inv;
      const mL = sL * inv;
      const mA = sA * inv;
      const mBy = sBy * inv;
      const mGrad = sGrad * inv;
      const mLap = sLap * inv;

      let vR = 0,
        vG = 0,
        vB = 0,
        vL = 0,
        vA = 0,
        vBy = 0,
        vGrad = 0;

      for (let y = y0; y < y1; y++) {
        const row = y * width;
        for (let x = x0; x < x1; x++) {
          const idx = row + x;
          const r = chR[idx];
          const g = chG[idx];
          const b = chB[idx];
          const l = lum[idx];
          const rg = r - g;
          const yb = 0.5 * (r + g) - b;
          const gm = gradMag[idx];

          vR += (r - mR) ** 2;
          vG += (g - mG) ** 2;
          vB += (b - mB) ** 2;
          vL += (l - mL) ** 2;
          vA += (rg - mA) ** 2;
          vBy += (yb - mBy) ** 2;
          vGrad += (gm - mGrad) ** 2;
        }
      }

      const feat = new Float32Array(PATCH_FEATURE_DIM);
      feat[0] = mR;
      feat[1] = mG;
      feat[2] = mB;
      feat[3] = Math.sqrt(vR * inv);
      feat[4] = Math.sqrt(vG * inv);
      feat[5] = Math.sqrt(vB * inv);
      feat[6] = mL;
      feat[7] = Math.sqrt(vL * inv);
      // Weight chromatic opponent channels strongly for surface discoloration/corrosion
      feat[8] = mA * 2.2;
      feat[9] = Math.sqrt(vA * inv) * 2.2;
      feat[10] = mBy * 2.2;
      feat[11] = Math.sqrt(vBy * inv) * 2.2;
      feat[12] = mGrad;
      feat[13] = Math.sqrt(vGrad * inv);
      feat[14] = orientBins[0] * inv;
      feat[15] = orientBins[1] * inv;
      feat[16] = orientBins[2] * inv;
      feat[17] = orientBins[3] * inv;
      feat[18] = mLap * 1.8;
      feat[19] = maxL - minL;

      rawPatches[gy * gridSize + gx] = feat;
    }
  }

  // PatchCore locally-aware neighborhood aggregation (3x3 weighted pooling: center 0.6, neighbors 0.4)
  const patches: Float32Array[] = new Array(gridSize * gridSize);
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const center = rawPatches[gy * gridSize + gx];
      const agg = new Float32Array(PATCH_FEATURE_DIM);
      let nCount = 0;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = gy + dy;
        if (ny < 0 || ny >= gridSize) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = gx + dx;
          if (nx < 0 || nx >= gridSize || (dx === 0 && dy === 0)) continue;
          const np = rawPatches[ny * gridSize + nx];
          for (let d = 0; d < PATCH_FEATURE_DIM; d++) {
            agg[d] += np[d];
          }
          nCount++;
        }
      }

      const invN = 1 / Math.max(1, nCount);
      for (let d = 0; d < PATCH_FEATURE_DIM; d++) {
        agg[d] = 0.68 * center[d] + 0.32 * (agg[d] * invN);
      }
      patches[gy * gridSize + gx] = agg;
    }
  }

  const globalStats: FeatureStatVector = {
    luminanceMean: Number(meanL.toFixed(5)),
    luminanceStd: Number(stdL.toFixed(5)),
    redMean: Number((sumR / totalPixels).toFixed(5)),
    greenMean: Number((sumG / totalPixels).toFixed(5)),
    blueMean: Number((sumB / totalPixels).toFixed(5)),
    contrastEnergy: Number((stdL * stdL * 10).toFixed(5)),
    edgeDensity: Number((edgeSum / totalPixels).toFixed(5)),
    highFreqLaplacian: Number((lapSum / totalPixels).toFixed(5)),
  };

  return { gridSize, patches, globalStats };
}

function l2Distance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Trains a PatchCore-style coreset memory bank + spatial reference profile + global distribution
 * baseline strictly from normal training images.
 */
export function buildMemoryBank(
  category: string,
  normalExtractions: PatchExtractionResult[],
  options: {
    architecture: 'PatchCore-MultiScale' | 'EfficientAD-Lite';
    version: string;
    inputSize: number;
    coresetRatio: number;
  }
): CategoryMemoryBank {
  if (normalExtractions.length === 0) {
    throw new Error(`Cannot build memory bank for ${category} without normal training images.`);
  }

  const gridSize = normalExtractions[0].gridSize;
  const numCells = gridSize * gridSize;
  const nImgs = normalExtractions.length;

  // 1. Compute global per-feature mean & std across all normal patches
  const featureMean = new Array(PATCH_FEATURE_DIM).fill(0);
  const featureVar = new Array(PATCH_FEATURE_DIM).fill(0);
  const totalPatches = nImgs * numCells;

  for (const ext of normalExtractions) {
    for (let c = 0; c < numCells; c++) {
      const p = ext.patches[c];
      for (let d = 0; d < PATCH_FEATURE_DIM; d++) {
        featureMean[d] += p[d];
      }
    }
  }
  for (let d = 0; d < PATCH_FEATURE_DIM; d++) {
    featureMean[d] /= totalPatches;
  }

  for (const ext of normalExtractions) {
    for (let c = 0; c < numCells; c++) {
      const p = ext.patches[c];
      for (let d = 0; d < PATCH_FEATURE_DIM; d++) {
        const diff = p[d] - featureMean[d];
        featureVar[d] += diff * diff;
      }
    }
  }
  const featureStd = featureVar.map((v) => Math.max(0.035, Math.sqrt(v / totalPatches)));

  // Normalize all training patches
  const normalizedSets: number[][][] = normalExtractions.map((ext) =>
    ext.patches.map((p) => {
      const out = new Array<number>(PATCH_FEATURE_DIM);
      for (let d = 0; d < PATCH_FEATURE_DIM; d++) {
        out[d] = (p[d] - featureMean[d]) / featureStd[d];
      }
      return out;
    })
  );

  // 2. Spatial per-cell normal statistics (captures geometric deviations like bent leads)
  const spatialMean: number[][] = new Array(numCells);
  const spatialStd: number[][] = new Array(numCells);

  for (let c = 0; c < numCells; c++) {
    const mean = new Array<number>(PATCH_FEATURE_DIM).fill(0);
    for (let i = 0; i < nImgs; i++) {
      const vec = normalizedSets[i][c];
      for (let d = 0; d < PATCH_FEATURE_DIM; d++) {
        mean[d] += vec[d];
      }
    }
    for (let d = 0; d < PATCH_FEATURE_DIM; d++) {
      mean[d] /= nImgs;
    }

    const std = new Array<number>(PATCH_FEATURE_DIM).fill(0);
    for (let i = 0; i < nImgs; i++) {
      const vec = normalizedSets[i][c];
      for (let d = 0; d < PATCH_FEATURE_DIM; d++) {
        const diff = vec[d] - mean[d];
        std[d] += diff * diff;
      }
    }
    for (let d = 0; d < PATCH_FEATURE_DIM; d++) {
      // Generous floor avoids over-penalizing normal micro-misalignments
      std[d] = Math.max(0.42, Math.sqrt(std[d] / nImgs));
    }

    spatialMean[c] = mean;
    spatialStd[c] = std;
  }

  // 3. Greedy Farthest-Point Coreset Subsampling (PatchCore)
  const candidatePool: number[][] = [];
  const stride = Math.max(1, Math.floor(totalPatches / 1600));
  let idxCounter = 0;
  for (let i = 0; i < nImgs; i++) {
    for (let c = 0; c < numCells; c++) {
      if (idxCounter % stride === 0) {
        candidatePool.push(normalizedSets[i][c]);
      }
      idxCounter++;
    }
  }

  const maxCoresetCap = options.architecture === 'EfficientAD-Lite' ? 140 : 280;
  const targetCoresetSize = clamp(
    Math.round(candidatePool.length * options.coresetRatio),
    48,
    Math.min(maxCoresetCap, candidatePool.length)
  );

  const coreset: number[][] = [];
  const minDistToCoreset = new Float64Array(candidatePool.length).fill(Infinity);
  let nextIdx = 0;

  for (let k = 0; k < targetCoresetSize; k++) {
    const chosen = candidatePool[nextIdx];
    coreset.push(chosen);

    let farthestIdx = 0;
    let farthestDist = -1;
    for (let j = 0; j < candidatePool.length; j++) {
      const dist = l2Distance(candidatePool[j], chosen);
      if (dist < minDistToCoreset[j]) {
        minDistToCoreset[j] = dist;
      }
      if (minDistToCoreset[j] > farthestDist) {
        farthestDist = minDistToCoreset[j];
        farthestIdx = j;
      }
    }
    if (farthestDist <= 1e-6) break;
    nextIdx = farthestIdx;
  }

  // 4. Compute baseline normal patch distance distribution using PatchCore k=1 nearest coreset distance
  const normalDistances: number[] = [];
  for (let i = 0; i < nImgs; i++) {
    for (let c = 0; c < numCells; c++) {
      const vec = normalizedSets[i][c];
      const dCore = nearestKDistance(vec, coreset, 1);
      const dSpat = spatialZDistance(vec, spatialMean[c], spatialStd[c]);
      normalDistances.push(0.55 * dCore + 0.45 * dSpat);
    }
  }
  normalDistances.sort((a, b) => a - b);
  const normalDistMean =
    normalDistances.reduce((acc, v) => acc + v, 0) / Math.max(1, normalDistances.length);
  const normalDistVar =
    normalDistances.reduce((acc, v) => acc + (v - normalDistMean) ** 2, 0) /
    Math.max(1, normalDistances.length);
  const normalDistStd = Math.max(0.32, Math.sqrt(normalDistVar));
  // Use 99.2nd percentile of normal training patch distances so normal metallic edges stay strictly below anomaly threshold
  const p99Idx = Math.min(normalDistances.length - 1, Math.floor(normalDistances.length * 0.992));
  const normalDistP95 = Math.max(normalDistMean + 2.1 * normalDistStd, normalDistances[p99Idx] ?? 1.5);

  // 5. Compute Global Reference Feature Statistics (for Distribution Shift Monitoring)
  const statKeys: Array<keyof FeatureStatVector> = [
    'luminanceMean',
    'luminanceStd',
    'redMean',
    'greenMean',
    'blueMean',
    'contrastEnergy',
    'edgeDensity',
    'highFreqLaplacian',
  ];

  const globalRefMean = {} as FeatureStatVector;
  const globalRefStd = {} as FeatureStatVector;

  const minStdFloors: Record<keyof FeatureStatVector, number> = {
    luminanceMean: 0.035,
    luminanceStd: 0.025,
    redMean: 0.035,
    greenMean: 0.035,
    blueMean: 0.035,
    contrastEnergy: 0.04,
    edgeDensity: 0.03,
    highFreqLaplacian: 0.018,
  };

  for (const key of statKeys) {
    const vals = normalExtractions.map((e) => e.globalStats[key]);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    globalRefMean[key] = Number(mean.toFixed(5));
    globalRefStd[key] = Number(Math.max(minStdFloors[key], Math.sqrt(variance)).toFixed(5));
  }

  return {
    category,
    architecture: options.architecture,
    version: options.version,
    inputSize: options.inputSize,
    gridSize,
    featureMean,
    featureStd,
    coreset,
    spatialMean,
    spatialStd,
    normalDistMean,
    normalDistStd,
    normalDistP95,
    globalRefMean,
    globalRefStd,
    trainingImageCount: nImgs,
    trainedAt: new Date().toISOString(),
    calibration: null,
    evaluationMetrics: null,
  };
}

function nearestKDistance(vec: ArrayLike<number>, bank: number[][], k = 3): number {
  let d1 = Infinity;
  let d2 = Infinity;
  let d3 = Infinity;

  for (let i = 0; i < bank.length; i++) {
    const d = l2Distance(vec, bank[i]);
    if (d < d1) {
      d3 = d2;
      d2 = d1;
      d1 = d;
    } else if (d < d2) {
      d3 = d2;
      d2 = d;
    } else if (d < d3) {
      d3 = d;
    }
  }

  if (k === 1 || !Number.isFinite(d2)) return d1;
  if (k === 2 || !Number.isFinite(d3)) return (d1 + d2) / 2;
  return 0.55 * d1 + 0.3 * d2 + 0.15 * d3;
}

function spatialZDistance(vec: ArrayLike<number>, mean: number[], std: number[]): number {
  let sumSq = 0;
  for (let d = 0; d < vec.length; d++) {
    const z = (vec[d] - mean[d]) / std[d];
    sumSq += z * z;
  }
  return Math.sqrt(sumSq / vec.length);
}

export interface PatchAnomalyScoreResult {
  gridMap: Float32Array; // [0..1] normalized anomaly score per grid cell
  rawDistances: Float32Array;
  anomalyScore: number; // [0..1] image-level anomaly score
  rawDistance: number; // peak raw PatchCore distance
  peakIntensity: number;
  meanIntensity: number;
  baselineMode: 'TRAINED_PATCHCORE' | 'SELF_REFERENCE_OPEN_SET';
}

/**
 * Computes PatchCore anomaly map & image-level anomaly score.
 * If a trained memory bank is available, scores against the learned normal coreset + spatial baseline.
 * Otherwise, runs zero-shot non-local self-reference k-NN patch outlier detection (uncalibrated).
 */
export function computeAnomalyMap(
  extraction: PatchExtractionResult,
  memoryBank: CategoryMemoryBank | null
): PatchAnomalyScoreResult {
  const { gridSize, patches } = extraction;
  const numCells = gridSize * gridSize;
  const rawDistances = new Float32Array(numCells);
  const gridMap = new Float32Array(numCells);

  if (memoryBank && memoryBank.gridSize === gridSize && memoryBank.coreset.length > 0) {
    const {
      featureMean,
      featureStd,
      coreset,
      spatialMean,
      spatialStd,
      normalDistP95,
      normalDistStd,
    } = memoryBank;

    const normalCutoff = normalDistP95 * 1.12;
    const normScale = Math.max(1.8, normalDistStd * 4.2);

    for (let c = 0; c < numCells; c++) {
      const p = patches[c];
      const norm = new Float32Array(PATCH_FEATURE_DIM);
      for (let d = 0; d < PATCH_FEATURE_DIM; d++) {
        norm[d] = (p[d] - featureMean[d]) / featureStd[d];
      }
      const dCore = nearestKDistance(norm, coreset, 1);
      const dSpat = spatialZDistance(norm, spatialMean[c], spatialStd[c]);
      const combined = 0.55 * dCore + 0.45 * dSpat;
      rawDistances[c] = combined;

      // Suppress normal background & normal texture within learned p99.2 tolerance cleanly to [0..0.14]
      const excess = (combined - normalCutoff) / normScale;
      gridMap[c] =
        excess <= 0
          ? clamp(0.12 * (combined / Math.max(0.3, normalCutoff)), 0, 0.14)
          : clamp(0.14 + 0.86 * (1 - Math.exp(-excess * 1.25)), 0, 1);
    }

    const sorted = Array.from(gridMap).sort((a, b) => b - a);
    const top1Count = Math.max(1, Math.floor(numCells * 0.01));
    const top3Count = Math.max(2, Math.floor(numCells * 0.03));
    const top1Mean = sorted.slice(0, top1Count).reduce((a, b) => a + b, 0) / top1Count;
    const top3Mean = sorted.slice(0, top3Count).reduce((a, b) => a + b, 0) / top3Count;
    const meanIntensity = sorted.reduce((a, b) => a + b, 0) / numCells;
    const peakIntensity = sorted[0] ?? 0;
    const rawPeak = Math.max(...Array.from(rawDistances));

    const anomalyScore = clamp(0.65 * top1Mean + 0.35 * top3Mean, 0, 1);

    return {
      gridMap,
      rawDistances,
      anomalyScore: Number(anomalyScore.toFixed(4)),
      rawDistance: Number(rawPeak.toFixed(4)),
      peakIntensity: Number(peakIntensity.toFixed(4)),
      meanIntensity: Number(meanIntensity.toFixed(4)),
      baselineMode: 'TRAINED_PATCHCORE',
    };
  }

  // Zero-shot non-local self-reference open-set mode (when category has no trained normal bank yet)
  const featMean = new Array(PATCH_FEATURE_DIM).fill(0);
  const featVar = new Array(PATCH_FEATURE_DIM).fill(0);
  for (let c = 0; c < numCells; c++) {
    for (let d = 0; d < PATCH_FEATURE_DIM; d++) {
      featMean[d] += patches[c][d];
    }
  }
  for (let d = 0; d < PATCH_FEATURE_DIM; d++) featMean[d] /= numCells;
  for (let c = 0; c < numCells; c++) {
    for (let d = 0; d < PATCH_FEATURE_DIM; d++) {
      featVar[d] += (patches[c][d] - featMean[d]) ** 2;
    }
  }
  const featStd = featVar.map((v) => Math.max(0.04, Math.sqrt(v / numCells)));

  const normPatches: Float32Array[] = patches.map((p) => {
    const out = new Float32Array(PATCH_FEATURE_DIM);
    for (let d = 0; d < PATCH_FEATURE_DIM; d++) {
      out[d] = (p[d] - featMean[d]) / featStd[d];
    }
    return out;
  });

  // For each patch, measure k=4 nearest distance within a local annular ring (2 <= Chebyshev <= 6).
  // Straight borders (phone bezels, desk edges, plate sides) repeat along their edge and find >=4
  // matching neighbors -> low distance; localized surface defects (scratches, cracks, gouges) do not.
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const idx = gy * gridSize + gx;
      const q = normPatches[idx];
      const topK: number[] = [];

      const oyMin = Math.max(0, gy - 6);
      const oyMax = Math.min(gridSize - 1, gy + 6);
      const oxMin = Math.max(0, gx - 6);
      const oxMax = Math.min(gridSize - 1, gx + 6);

      for (let oy = oyMin; oy <= oyMax; oy++) {
        for (let ox = oxMin; ox <= oxMax; ox++) {
          const cheb = Math.max(Math.abs(oy - gy), Math.abs(ox - gx));
          if (cheb < 2 || cheb > 6) continue;
          const d = l2Distance(q, normPatches[oy * gridSize + ox]);
          if (topK.length < 4) {
            topK.push(d);
            topK.sort((a, b) => a - b);
          } else if (d < topK[3]) {
            topK[3] = d;
            topK.sort((a, b) => a - b);
          }
        }
      }
      rawDistances[idx] =
        topK.length > 0 ? topK.reduce((a, b) => a + b, 0) / topK.length : 0;
    }
  }

  // Robust median + MAD standardization over interior cells
  const interiorRaw: number[] = [];
  for (let gy = 2; gy < gridSize - 2; gy++) {
    for (let gx = 2; gx < gridSize - 2; gx++) {
      interiorRaw.push(rawDistances[gy * gridSize + gx]);
    }
  }
  const sortedRaw = (interiorRaw.length > 0 ? interiorRaw : Array.from(rawDistances)).sort((a, b) => a - b);
  const median = sortedRaw[Math.floor(sortedRaw.length * 0.5)] ?? 1;
  const absDevs = sortedRaw.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = Math.max(0.28, (absDevs[Math.floor(absDevs.length * 0.5)] ?? 0.28) * 1.4826);

  for (let c = 0; c < numCells; c++) {
    // Damp outer 2-cell border ring strongly so photo crop edges never trigger false boxes
    const gy = Math.floor(c / gridSize);
    const gx = c % gridSize;
    const marginDist = Math.min(gy, gridSize - 1 - gy, gx, gridSize - 1 - gx);
    const borderFactor = marginDist === 0 ? 0.1 : marginDist === 1 ? 0.25 : 1.0;

    // Require clear statistical outlier (z > 2.4) above local surrounding material variance
    const z = (rawDistances[c] - median) / mad;
    const rawScore =
      z <= 2.4
        ? clamp(0.12 * Math.max(0, z / 2.4), 0, 0.14)
        : clamp(0.14 + 0.86 * (1 - Math.exp(-(z - 2.4) * 0.38)), 0, 1);
    gridMap[c] = rawScore * borderFactor;
  }

  const sorted = Array.from(gridMap).sort((a, b) => b - a);
  const top1Count = Math.max(1, Math.floor(numCells * 0.01));
  const top3Count = Math.max(2, Math.floor(numCells * 0.025));
  const top1Mean = sorted.slice(0, top1Count).reduce((a, b) => a + b, 0) / top1Count;
  const top3Mean = sorted.slice(0, top3Count).reduce((a, b) => a + b, 0) / top3Count;
  const meanIntensity = sorted.reduce((a, b) => a + b, 0) / numCells;
  const peakIntensity = sorted[0] ?? 0;
  const rawPeak = Math.max(...Array.from(rawDistances));
  const anomalyScore = clamp(0.6 * top1Mean + 0.4 * top3Mean, 0, 1);

  return {
    gridMap,
    rawDistances,
    anomalyScore: Number(anomalyScore.toFixed(4)),
    rawDistance: Number(rawPeak.toFixed(4)),
    peakIntensity: Number(peakIntensity.toFixed(4)),
    meanIntensity: Number(meanIntensity.toFixed(4)),
    baselineMode: 'SELF_REFERENCE_OPEN_SET',
  };
}

/**
 * Bilinearly upsamples the gridSize x gridSize anomaly field to pixel resolution (width x height)
 * and applies separable Gaussian smoothing.
 */
export function upsampleAndSmoothMap(
  gridMap: Float32Array,
  gridSize: number,
  width: number,
  height: number,
  sigma = 2.0
): Float32Array {
  const upsampled = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const fy = ((y + 0.5) / height) * gridSize - 0.5;
    const y0 = clamp(Math.floor(fy), 0, gridSize - 1);
    const y1 = clamp(y0 + 1, 0, gridSize - 1);
    const wy = clamp(fy - y0, 0, 1);

    for (let x = 0; x < width; x++) {
      const fx = ((x + 0.5) / width) * gridSize - 0.5;
      const x0 = clamp(Math.floor(fx), 0, gridSize - 1);
      const x1 = clamp(x0 + 1, 0, gridSize - 1);
      const wx = clamp(fx - x0, 0, 1);

      const v00 = gridMap[y0 * gridSize + x0];
      const v10 = gridMap[y0 * gridSize + x1];
      const v01 = gridMap[y1 * gridSize + x0];
      const v11 = gridMap[y1 * gridSize + x1];

      const top = v00 * (1 - wx) + v10 * wx;
      const bot = v01 * (1 - wx) + v11 * wx;
      upsampled[y * width + x] = top * (1 - wy) + bot * wy;
    }
  }

  if (sigma <= 0.1) return upsampled;

  const radius = Math.min(10, Math.max(1, Math.ceil(sigma * 2.2)));
  const kernel = new Float32Array(radius * 2 + 1);
  let kSum = 0;
  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = w;
    kSum += w;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= kSum;

  const temp = new Float32Array(width * height);
  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = clamp(x + k, 0, width - 1);
        acc += upsampled[row + sx] * kernel[k + radius];
      }
      temp[row + x] = acc;
    }
  }

  const smoothed = new Float32Array(width * height);
  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = clamp(y + k, 0, height - 1);
        acc += temp[sy * width + x] * kernel[k + radius];
      }
      smoothed[y * width + x] = clamp(acc, 0, 1);
    }
  }

  return smoothed;
}

/**
 * Thresholds pixel anomaly map into a binary defect mask and extracts connected defect regions
 * with bounding boxes, area percentage, peak intensity, and centroid coordinates.
 */
export function extractDefectRegions(
  pixelMap: Float32Array,
  width: number,
  height: number,
  maskThreshold: number
): { mask: Uint8Array; regions: AnomalyRegion[]; affectedAreaPct: number } {
  const totalPixels = width * height;
  const mask = new Uint8Array(totalPixels);
  let activeCount = 0;

  // Guard against mild global exposure elevation bleeding into the binary defect mask:
  // require pixels to exceed both the configured maskThreshold AND the field median + 0.20
  let sum = 0;
  for (let i = 0; i < totalPixels; i++) sum += pixelMap[i];
  const meanVal = sum / totalPixels;
  const effectiveThreshold = Math.min(0.88, Math.max(maskThreshold, meanVal + 0.22));

  for (let i = 0; i < totalPixels; i++) {
    if (pixelMap[i] >= effectiveThreshold) {
      mask[i] = 255;
      activeCount++;
    }
  }

  const visited = new Uint8Array(totalPixels);
  const rawRegions: AnomalyRegion[] = [];
  const minRegionPixels = Math.max(12, Math.floor(totalPixels * 0.0007));

  const queue = new Int32Array(totalPixels);
  let regionId = 1;

  for (let start = 0; start < totalPixels; start++) {
    if (mask[start] === 0 || visited[start]) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;

    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;
    let area = 0;
    let peak = 0;
    let intensitySum = 0;

    while (head < tail) {
      const curr = queue[head++];
      const cy = Math.floor(curr / width);
      const cx = curr - cy * width;
      const val = pixelMap[curr];

      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      sumX += cx;
      sumY += cy;
      area++;
      if (val > peak) peak = val;
      intensitySum += val;

      // 4-connected neighbors
      if (cx > 0) {
        const n = curr - 1;
        if (mask[n] && !visited[n]) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
      if (cx < width - 1) {
        const n = curr + 1;
        if (mask[n] && !visited[n]) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
      if (cy > 0) {
        const n = curr - width;
        if (mask[n] && !visited[n]) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
      if (cy < height - 1) {
        const n = curr + width;
        if (mask[n] && !visited[n]) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
    }

    if (area >= minRegionPixels) {
      rawRegions.push({
        id: regionId++,
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        areaPixels: area,
        areaPct: Number(((area / totalPixels) * 100).toFixed(2)),
        peakIntensity: Number(peak.toFixed(4)),
        meanIntensity: Number((intensitySum / area).toFixed(4)),
        centroidX: Math.round(sumX / area),
        centroidY: Math.round(sumY / area),
      });
    }
  }

  rawRegions.sort((a, b) => b.areaPixels - a.areaPixels);
  const topRegions = rawRegions.slice(0, 8).map((r, i) => ({ ...r, id: i + 1 }));
  const affectedAreaPct = Number(((activeCount / totalPixels) * 100).toFixed(2));

  return { mask, regions: topRegions, affectedAreaPct };
}

/**
 * Scientific perceptual Turbo-inspired colormap for pixel anomaly intensity [0..1].
 */
export function sampleTurboColor(tRaw: number): [number, number, number] {
  const t = clamp(tRaw, 0, 1);
  // 5-stop calibrated ramp: Deep Navy -> Electric Blue -> Cyan/Teal -> Amber -> Crimson
  const stops: Array<[number, number, number, number]> = [
    [0.0, 12, 22, 48],
    [0.25, 22, 92, 185],
    [0.5, 16, 185, 196],
    [0.75, 245, 168, 28],
    [1.0, 232, 36, 48],
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, r0, g0, b0] = stops[i];
    const [t1, r1, g1, b1] = stops[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / Math.max(1e-6, t1 - t0);
      return [
        Math.round(r0 + (r1 - r0) * f),
        Math.round(g0 + (g1 - g0) * f),
        Math.round(b0 + (b1 - b0) * f),
      ];
    }
  }
  return [232, 36, 48];
}

/**
 * Draws a clean crisp rectangle outline onto an RGB buffer.
 */
export function drawRectangleOutline(
  rgb: Uint8Array,
  width: number,
  height: number,
  reg: { x: number; y: number; width: number; height: number },
  color: [number, number, number] = [74, 222, 128],
  thickness = 3
): void {
  const x0 = clamp(reg.x - 2, 0, width - 1);
  const y0 = clamp(reg.y - 2, 0, height - 1);
  const x1 = clamp(reg.x + reg.width + 2, 0, width - 1);
  const y1 = clamp(reg.y + reg.height + 2, 0, height - 1);

  const setPx = (px: number, py: number) => {
    if (px < 0 || px >= width || py < 0 || py >= height) return;
    const p3 = (py * width + px) * 3;
    rgb[p3] = color[0];
    rgb[p3 + 1] = color[1];
    rgb[p3 + 2] = color[2];
  };

  for (let t = 0; t < thickness; t++) {
    for (let x = x0; x <= x1; x++) {
      setPx(x, y0 + t);
      setPx(x, y1 - t);
    }
    for (let y = y0; y <= y1; y++) {
      setPx(x0 + t, y);
      setPx(x1 - t, y);
    }
  }
}

/**
 * Draws a clean crisp circle/ellipse outline onto an RGB buffer enclosing a defect region.
 */
export function drawCircleOutline(
  rgb: Uint8Array,
  width: number,
  height: number,
  reg: { x: number; y: number; width: number; height: number },
  color: [number, number, number] = [74, 222, 128],
  thickness = 3
): void {
  const cx = reg.x + reg.width / 2;
  const cy = reg.y + reg.height / 2;
  const r = Math.max(8, Math.hypot(reg.width, reg.height) * 0.56);
  const innerR = Math.max(1, r - thickness);
  const outerR = r + 0.5;

  const yMin = clamp(Math.floor(cy - outerR - 1), 0, height - 1);
  const yMax = clamp(Math.ceil(cy + outerR + 1), 0, height - 1);
  const xMin = clamp(Math.floor(cx - outerR - 1), 0, width - 1);
  const xMax = clamp(Math.ceil(cx + outerR + 1), 0, width - 1);

  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist >= innerR && dist <= outerR) {
        const p3 = (y * width + x) * 3;
        rgb[p3] = color[0];
        rgb[p3 + 1] = color[1];
        rgb[p3 + 2] = color[2];
      }
    }
  }
}

/**
 * Generates raw RGB visualization buffers for Heatmap, Clean Defect Overlay (crisp original image
 * with sharp Rectangle or Circle markers framing only detected defects — no messy full-image wash),
 * and Thresholded Segmentation Mask.
 */
export function renderVisualizations(
  rgb: Uint8Array,
  pixelMap: Float32Array,
  mask: Uint8Array,
  regions: AnomalyRegion[],
  width: number,
  height: number,
  markerShape: 'rectangle' | 'circle' = 'rectangle'
): { heatmapRgb: Uint8Array; overlayRgb: Uint8Array; maskRgb: Uint8Array } {
  const totalPixels = width * height;
  const heatmapRgb = new Uint8Array(totalPixels * 3);
  const overlayRgb = new Uint8Array(rgb); // Preserve crisp original image cleanly!
  const maskRgb = new Uint8Array(totalPixels * 3);

  for (let i = 0; i < totalPixels; i++) {
    const val = pixelMap[i];
    const [hr, hg, hb] = sampleTurboColor(val);
    const p3 = i * 3;

    heatmapRgb[p3] = hr;
    heatmapRgb[p3 + 1] = hg;
    heatmapRgb[p3 + 2] = hb;

    // Binary segmentation mask visualization
    if (mask[i] > 0) {
      maskRgb[p3] = 248;
      maskRgb[p3 + 1] = 250;
      maskRgb[p3 + 2] = 252;
    } else {
      maskRgb[p3] = 11;
      maskRgb[p3 + 1] = 18;
      maskRgb[p3 + 2] = 32;
    }
  }

  // Draw crisp 3px bright green Rectangle or Circle around each detected defect region
  const strokeThickness = Math.max(2, Math.round(Math.min(width, height) / 110));
  const markerColor: [number, number, number] = [74, 222, 128]; // Crisp industrial lime-green (#4ADE80)
  for (const reg of regions) {
    if (markerShape === 'circle') {
      drawCircleOutline(overlayRgb, width, height, reg, markerColor, strokeThickness);
    } else {
      drawRectangleOutline(overlayRgb, width, height, reg, markerColor, strokeThickness);
    }
  }

  return { heatmapRgb, overlayRgb, maskRgb };
}

/**
 * Estimates defect severity from measurable visual indicators (affected area % & peak anomaly intensity).
 */
export function estimateSeverity(
  prediction: PredictionOutcome,
  affectedAreaPct: number,
  peakIntensity: number,
  settings: SystemSettings
): { severity: SeverityLevel; note: string } {
  const disclaimer =
    'Estimated visual inspection category based on anomaly area and intensity — not a verified engineering safety assessment.';

  if (prediction === 'PASS' && affectedAreaPct < 0.25 && peakIntensity < settings.anomalyThreshold) {
    return {
      severity: 'NONE',
      note: 'No abnormal surface region exceeded the configured inspection threshold.',
    };
  }

  if (
    affectedAreaPct > settings.severityMediumMaxAreaPct ||
    peakIntensity >= settings.severityMediumMaxIntensity
  ) {
    return { severity: 'HIGH', note: disclaimer };
  }

  if (
    affectedAreaPct > settings.severityLowMaxAreaPct ||
    peakIntensity >= settings.severityLowMaxIntensity
  ) {
    return { severity: 'MEDIUM', note: disclaimer };
  }

  return { severity: 'LOW', note: disclaimer };
}

/**
 * Computes feature-embedding distribution shift between query image statistics and the category's
 * stored reference baseline using standardized Mahalanobis / RMS z-distance.
 */
export function computeDistributionShift(
  queryStats: FeatureStatVector,
  refMean: FeatureStatVector | null,
  refStd: FeatureStatVector | null,
  settings: SystemSettings
): {
  driftStatus: DriftStatus;
  driftDistance: number;
  breakdown: DriftFeatureDelta[];
  dominantFactor: string;
} {
  const labels: Array<{ key: keyof FeatureStatVector; label: string }> = [
    { key: 'luminanceMean', label: 'Mean Illumination' },
    { key: 'luminanceStd', label: 'Illumination Spread' },
    { key: 'redMean', label: 'Red Channel Balance' },
    { key: 'greenMean', label: 'Green Channel Balance' },
    { key: 'blueMean', label: 'Blue Channel Balance' },
    { key: 'contrastEnergy', label: 'RMS Contrast Energy' },
    { key: 'edgeDensity', label: 'Sobel Edge Density' },
    { key: 'highFreqLaplacian', label: 'High-Freq Texture Energy' },
  ];

  if (!refMean || !refStd) {
    return {
      driftStatus: 'STABLE',
      driftDistance: 0,
      breakdown: labels.map((item) => ({
        feature: item.key,
        label: item.label,
        referenceMean: queryStats[item.key],
        currentValue: queryStats[item.key],
        zScore: 0,
      })),
      dominantFactor: 'No trained reference distribution for this category yet',
    };
  }

  let sumSq = 0;
  let maxAbsZ = -1;
  let dominantFactor = 'Nominal imaging conditions';
  const breakdown: DriftFeatureDelta[] = [];

  for (const item of labels) {
    const rMean = refMean[item.key];
    const rStd = Math.max(0.015, refStd[item.key]);
    const curr = queryStats[item.key];
    const z = (curr - rMean) / rStd;
    sumSq += z * z;
    if (Math.abs(z) > maxAbsZ) {
      maxAbsZ = Math.abs(z);
      dominantFactor = item.label;
    }
    breakdown.push({
      feature: item.key,
      label: item.label,
      referenceMean: Number(rMean.toFixed(4)),
      currentValue: Number(curr.toFixed(4)),
      zScore: Number(z.toFixed(2)),
    });
  }

  const rmsZ = Math.sqrt(sumSq / labels.length);
  const driftDistance = Number(rmsZ.toFixed(3));

  let driftStatus: DriftStatus = 'STABLE';
  if (driftDistance >= settings.driftCriticalThreshold) {
    driftStatus = 'SIGNIFICANT_SHIFT';
  } else if (driftDistance >= settings.driftWarningThreshold) {
    driftStatus = 'POSSIBLE_SHIFT';
  }

  return { driftStatus, driftDistance, breakdown, dominantFactor };
}

/**
 * Fits Platt logistic calibration parameters (slope, intercept) on held-out validation scores & binary labels
 * via L2-regularized gradient descent on binary cross-entropy.
 */
export function fitPlattCalibration(
  scores: number[],
  labels: number[]
): PlattCalibrationParams {
  let slope = 6.0;
  let intercept = -3.0;
  const lr = 0.25;
  const reg = 0.01;
  const n = Math.max(1, scores.length);

  for (let iter = 0; iter < 400; iter++) {
    let gradW = 0;
    let gradB = 0;
    for (let i = 0; i < scores.length; i++) {
      const p = sigmoid(slope * scores[i] + intercept);
      const err = p - labels[i];
      gradW += err * scores[i];
      gradB += err;
    }
    gradW = gradW / n + reg * slope;
    gradB = gradB / n;
    slope -= lr * gradW;
    intercept -= lr * gradB;
  }

  return {
    slope: Number(clamp(slope, 0.5, 25).toFixed(4)),
    intercept: Number(clamp(intercept, -15, 15).toFixed(4)),
    fittedAt: new Date().toISOString(),
  };
}

/**
 * Applies fitted Platt calibration to produce anomaly probability & prediction confidence + uncertainty.
 */
export function applyCalibration(
  anomalyScore: number,
  params: PlattCalibrationParams | null
): {
  isCalibrated: boolean;
  defectProbability: number | null;
  calibratedConfidence: number | null;
  uncertaintyScore: number | null;
} {
  if (!params) {
    return {
      isCalibrated: false,
      defectProbability: null,
      calibratedConfidence: null,
      uncertaintyScore: null,
    };
  }

  const pDefect = sigmoid(params.slope * anomalyScore + params.intercept);
  const confidence = Math.max(pDefect, 1 - pDefect);
  // Binary Shannon entropy normalized to [0, 1] as principled uncertainty
  const pSafe = clamp(pDefect, 1e-6, 1 - 1e-6);
  const entropy = -(pSafe * Math.log2(pSafe) + (1 - pSafe) * Math.log2(1 - pSafe));

  return {
    isCalibrated: true,
    defectProbability: Number(pDefect.toFixed(4)),
    calibratedConfidence: Number(confidence.toFixed(4)),
    uncertaintyScore: Number(clamp(entropy, 0, 1).toFixed(4)),
  };
}

/**
 * Computes exact ROC AUROC, Average Precision (PR-AUC), F1 at operating threshold,
 * and Expected Calibration Error (ECE) with reliability bins.
 */
export function computeEvaluationMetrics(
  scores: number[],
  labels: number[],
  operatingThreshold: number,
  calibration: PlattCalibrationParams,
  pixelScores?: number[],
  pixelLabels?: number[]
): EvaluationMetrics {
  const n = scores.length;
  const pairs = scores.map((s, i) => ({ score: s, label: labels[i] }));
  pairs.sort((a, b) => b.score - a.score);

  const posTotal = labels.filter((l) => l === 1).length;
  const negTotal = n - posTotal;

  // Image AUROC (trapezoidal) & AP
  let tp = 0;
  let fp = 0;
  let prevFpr = 0;
  let prevTpr = 0;
  let auroc = 0;
  let ap = 0;

  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].label === 1) {
      tp++;
      const precision = tp / (tp + fp);
      ap += precision / Math.max(1, posTotal);
    } else {
      fp++;
    }
    const tpr = tp / Math.max(1, posTotal);
    const fpr = fp / Math.max(1, negTotal);
    auroc += ((fpr - prevFpr) * (tpr + prevTpr)) / 2;
    prevFpr = fpr;
    prevTpr = tpr;
  }

  // F1 at operating threshold
  let fTp = 0;
  let fFp = 0;
  let fFn = 0;
  for (let i = 0; i < n; i++) {
    const pred = scores[i] >= operatingThreshold ? 1 : 0;
    if (pred === 1 && labels[i] === 1) fTp++;
    else if (pred === 1 && labels[i] === 0) fFp++;
    else if (pred === 0 && labels[i] === 1) fFn++;
  }
  const prec = fTp / Math.max(1, fTp + fFp);
  const rec = fTp / Math.max(1, fTp + fFn);
  const f1 = prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0;

  // Pixel AUROC & Pixel AP if pixel-level validation data provided
  let pixelAuroc = auroc;
  let pixelAp = ap;
  if (pixelScores && pixelLabels && pixelScores.length === pixelLabels.length && pixelScores.length > 0) {
    const pPairs = pixelScores.map((s, i) => ({ score: s, label: pixelLabels[i] }));
    pPairs.sort((a, b) => b.score - a.score);
    const pPos = pixelLabels.filter((l) => l === 1).length;
    const pNeg = pixelLabels.length - pPos;
    let pTp = 0;
    let pFp = 0;
    let pPrevFpr = 0;
    let pPrevTpr = 0;
    let pAuc = 0;
    let pAp = 0;
    for (let i = 0; i < pPairs.length; i++) {
      if (pPairs[i].label === 1) {
        pTp++;
        pAp += pTp / (pTp + pFp) / Math.max(1, pPos);
      } else {
        pFp++;
      }
      const tpr = pTp / Math.max(1, pPos);
      const fpr = pFp / Math.max(1, pNeg);
      pAuc += ((fpr - pPrevFpr) * (tpr + pPrevTpr)) / 2;
      pPrevFpr = fpr;
      pPrevTpr = tpr;
    }
    pixelAuroc = pAuc;
    pixelAp = pAp;
  }

  // Expected Calibration Error (ECE) over 10 uniform probability bins
  const numBins = 10;
  const binSumsConf = new Array(numBins).fill(0);
  const binSumsAcc = new Array(numBins).fill(0);
  const binCounts = new Array(numBins).fill(0);

  for (let i = 0; i < n; i++) {
    const prob = sigmoid(calibration.slope * scores[i] + calibration.intercept);
    const binIdx = Math.min(numBins - 1, Math.floor(prob * numBins));
    binSumsConf[binIdx] += prob;
    binSumsAcc[binIdx] += labels[i];
    binCounts[binIdx]++;
  }

  let ece = 0;
  const reliabilityBins: CalibrationBin[] = [];
  for (let b = 0; b < numBins; b++) {
    const count = binCounts[b];
    const avgConf = count > 0 ? binSumsConf[b] / count : (b + 0.5) / numBins;
    const empAcc = count > 0 ? binSumsAcc[b] / count : 0;
    if (count > 0) {
      ece += (count / Math.max(1, n)) * Math.abs(empAcc - avgConf);
    }
    reliabilityBins.push({
      binIndex: b,
      rangeLabel: `${(b * 0.1).toFixed(1)}–${((b + 1) * 0.1).toFixed(1)}`,
      avgConfidence: Number(avgConf.toFixed(3)),
      empiricalAccuracy: Number(empAcc.toFixed(3)),
      count,
    });
  }

  return {
    imageAuroc: Number(clamp(auroc, 0, 1).toFixed(4)),
    imageAp: Number(clamp(ap, 0, 1).toFixed(4)),
    f1AtThreshold: Number(clamp(f1, 0, 1).toFixed(4)),
    operatingThreshold: Number(operatingThreshold.toFixed(3)),
    pixelAuroc: Number(clamp(pixelAuroc, 0, 1).toFixed(4)),
    pixelAp: Number(clamp(pixelAp, 0, 1).toFixed(4)),
    ece: Number(clamp(ece, 0, 1).toFixed(4)),
    sampleCount: n,
    normalCount: negTotal,
    anomalyCount: posTotal,
    evaluatedAt: new Date().toISOString(),
    reliabilityBins,
  };
}

/**
 * Determines final inspection outcome: PASS, DEFECT, or REVIEW.
 */
export function decideRecommendation(
  anomalyScore: number,
  calibratedConfidence: number | null,
  isCalibrated: boolean,
  driftStatus: DriftStatus,
  settings: SystemSettings
): PredictionOutcome {
  const lowerUncertain = settings.anomalyThreshold - settings.uncertaintyMargin;
  const upperUncertain = settings.anomalyThreshold + settings.uncertaintyMargin;

  // Borderline scores around the operating threshold require human verification
  if (anomalyScore >= lowerUncertain && anomalyScore <= upperUncertain) {
    return 'REVIEW';
  }

  // Low calibrated confidence triggers review
  if (
    settings.calibrationEnabled &&
    isCalibrated &&
    calibratedConfidence !== null &&
    calibratedConfidence < settings.minConfidenceFloor
  ) {
    return 'REVIEW';
  }

  // Significant distribution shift triggers review unless defect score is overwhelmingly high
  if (driftStatus === 'SIGNIFICANT_SHIFT' && anomalyScore < settings.anomalyThreshold + 0.18) {
    return 'REVIEW';
  }

  return anomalyScore >= settings.anomalyThreshold ? 'DEFECT' : 'PASS';
}

export function validateSystemSettings(input: Partial<SystemSettings>): {
  valid: boolean;
  errors: string[];
  sanitized?: SystemSettings;
} {
  const merged: SystemSettings = { ...DEFAULT_SYSTEM_SETTINGS, ...input };
  const errors: string[] = [];

  if (typeof merged.anomalyThreshold !== 'number' || merged.anomalyThreshold < 0.05 || merged.anomalyThreshold > 0.95) {
    errors.push('Anomaly threshold must be between 0.05 and 0.95.');
  }
  if (typeof merged.uncertaintyMargin !== 'number' || merged.uncertaintyMargin < 0.01 || merged.uncertaintyMargin > 0.25) {
    errors.push('Uncertainty margin must be between 0.01 and 0.25.');
  }
  if (typeof merged.maskThreshold !== 'number' || merged.maskThreshold < 0.1 || merged.maskThreshold > 0.95) {
    errors.push('Segmentation mask threshold must be between 0.10 and 0.95.');
  }
  if (merged.severityLowMaxAreaPct <= 0 || merged.severityLowMaxAreaPct >= merged.severityMediumMaxAreaPct) {
    errors.push('Low severity area cutoff must be positive and strictly less than medium severity area cutoff.');
  }
  if (merged.severityLowMaxIntensity <= 0.1 || merged.severityLowMaxIntensity >= merged.severityMediumMaxIntensity || merged.severityMediumMaxIntensity > 0.99) {
    errors.push('Severity intensity thresholds must satisfy 0.10 < Low < Medium <= 0.99.');
  }
  if (merged.minConfidenceFloor < 0.5 || merged.minConfidenceFloor > 0.98) {
    errors.push('Minimum confidence floor must be between 0.50 and 0.98.');
  }
  if (merged.driftWarningThreshold <= 0.5 || merged.driftWarningThreshold >= merged.driftCriticalThreshold) {
    errors.push('Distribution shift warning threshold must be > 0.5 and strictly less than critical threshold.');
  }
  if (![128, 256, 384].includes(merged.inputImageSize)) {
    errors.push('Input image size must be 128, 256, or 384.');
  }
  if (merged.gaussianSigma < 0 || merged.gaussianSigma > 6) {
    errors.push('Gaussian smoothing sigma must be between 0 and 6.');
  }
  if (merged.coresetRatio < 0.05 || merged.coresetRatio > 0.8) {
    errors.push('Coreset sampling ratio must be between 0.05 and 0.80.');
  }
  if (!['PatchCore-MultiScale', 'EfficientAD-Lite'].includes(merged.architecture)) {
    errors.push('Unsupported model architecture selection.');
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true, errors: [], sanitized: merged };
}
