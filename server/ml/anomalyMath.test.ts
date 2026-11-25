import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SYSTEM_SETTINGS,
  applyCalibration,
  buildMemoryBank,
  computeAnomalyMap,
  computeDistributionShift,
  computeEvaluationMetrics,
  decideRecommendation,
  estimateSeverity,
  extractDefectRegions,
  extractPatchFeatures,
  fitPlattCalibration,
  upsampleAndSmoothMap,
  validateSystemSettings,
} from './anomalyMath';

function makeSyntheticImage(
  width: number,
  height: number,
  options: {
    baseGray?: number;
    brightnessDelta?: number;
    defectBox?: { x: number; y: number; w: number; h: number; r: number; g: number; b: number };
  } = {}
): Uint8Array {
  const base = (options.baseGray ?? 120) + (options.brightnessDelta ?? 0);
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      // Subtle brushed metallic horizontal grain
      const grain = Math.round(Math.sin(y * 0.4) * 4 + Math.cos(x * 0.15) * 2);
      const val = Math.max(0, Math.min(255, base + grain));
      rgb[idx] = val;
      rgb[idx + 1] = val;
      rgb[idx + 2] = Math.min(255, val + 4);

      if (options.defectBox) {
        const d = options.defectBox;
        if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) {
          // Sharp jagged rust/scratch defect
          const noise = ((x * 37 + y * 17) % 35) - 15;
          rgb[idx] = Math.max(0, Math.min(255, d.r + noise));
          rgb[idx + 1] = Math.max(0, Math.min(255, d.g + noise));
          rgb[idx + 2] = Math.max(0, Math.min(255, d.b + noise));
        }
      }
    }
  }
  return rgb;
}

test('PatchCore memory bank separates normal vs unseen defect and localizes the defect region', () => {
  const W = 128;
  const H = 128;
  const normalImgs = [-3, 0, 3, -2, 2].map((delta) =>
    extractPatchFeatures(makeSyntheticImage(W, H, { brightnessDelta: delta }), W, H, 16)
  );

  const bank = buildMemoryBank('Metal Nut', normalImgs, {
    architecture: 'PatchCore-MultiScale',
    version: '1.0.0',
    inputSize: 128,
    coresetRatio: 0.3,
  });

  assert.ok(bank.coreset.length >= 48, 'Coreset should retain representative normal patches');

  const queryNormal = extractPatchFeatures(makeSyntheticImage(W, H, { brightnessDelta: 1 }), W, H, 16);
  const normalResult = computeAnomalyMap(queryNormal, bank);

  const defectBox = { x: 76, y: 24, w: 28, h: 28, r: 195, g: 70, b: 20 };
  const queryDefect = extractPatchFeatures(makeSyntheticImage(W, H, { defectBox }), W, H, 16);
  const defectResult = computeAnomalyMap(queryDefect, bank);

  assert.equal(normalResult.baselineMode, 'TRAINED_PATCHCORE');
  assert.ok(
    defectResult.anomalyScore > normalResult.anomalyScore + 0.35,
    `Expected defect score (${defectResult.anomalyScore}) >> normal score (${normalResult.anomalyScore})`
  );
  assert.ok(normalResult.anomalyScore < 0.3, `Normal score should stay low, got ${normalResult.anomalyScore}`);
  assert.ok(defectResult.anomalyScore > 0.65, `Defect score should be high, got ${defectResult.anomalyScore}`);

  // Verify localization hits the upper-right defect box
  const pixelMap = upsampleAndSmoothMap(defectResult.gridMap, 16, W, H, 1.5);
  const { regions, affectedAreaPct } = extractDefectRegions(pixelMap, W, H, 0.45);
  assert.ok(regions.length >= 1, 'Should detect at least one localized anomaly region');
  assert.ok(affectedAreaPct > 1.0, 'Affected area percentage should reflect defect region');
  const main = regions[0];
  assert.ok(
    main.centroidX >= 68 && main.centroidX <= 112 && main.centroidY >= 16 && main.centroidY <= 60,
    `Localized centroid (${main.centroidX}, ${main.centroidY}) should fall inside defect area`
  );
});

test('Distribution shift monitor stays STABLE under normal lighting and flags SIGNIFICANT_SHIFT under strong illumination drift', () => {
  const W = 128;
  const H = 128;
  const normalImgs = [-4, -1, 0, 2, 4].map((delta) =>
    extractPatchFeatures(makeSyntheticImage(W, H, { brightnessDelta: delta }), W, H, 16)
  );
  const bank = buildMemoryBank('Bottle', normalImgs, {
    architecture: 'PatchCore-MultiScale',
    version: '1.0.0',
    inputSize: 128,
    coresetRatio: 0.25,
  });

  const stableQuery = extractPatchFeatures(makeSyntheticImage(W, H, { brightnessDelta: 1 }), W, H, 16);
  const stableShift = computeDistributionShift(
    stableQuery.globalStats,
    bank.globalRefMean,
    bank.globalRefStd,
    DEFAULT_SYSTEM_SETTINGS
  );
  assert.equal(stableShift.driftStatus, 'STABLE');

  const darkShiftQuery = extractPatchFeatures(makeSyntheticImage(W, H, { brightnessDelta: -85 }), W, H, 16);
  const strongShift = computeDistributionShift(
    darkShiftQuery.globalStats,
    bank.globalRefMean,
    bank.globalRefStd,
    DEFAULT_SYSTEM_SETTINGS
  );
  assert.equal(strongShift.driftStatus, 'SIGNIFICANT_SHIFT');
  assert.ok(strongShift.driftDistance > DEFAULT_SYSTEM_SETTINGS.driftCriticalThreshold);
});

test('Platt calibration, AUROC/AP/F1, ECE, Severity and Recommendation decision logic work accurately', () => {
  const valScores = [0.08, 0.11, 0.14, 0.18, 0.21, 0.68, 0.74, 0.82, 0.89, 0.94];
  const valLabels = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];

  const cal = fitPlattCalibration(valScores, valLabels);
  const evalMetrics = computeEvaluationMetrics(valScores, valLabels, 0.48, cal);

  assert.equal(evalMetrics.imageAuroc, 1);
  assert.equal(evalMetrics.imageAp, 1);
  assert.equal(evalMetrics.f1AtThreshold, 1);
  assert.ok(evalMetrics.ece < 0.25, `ECE should be low on separable validation set, got ${evalMetrics.ece}`);
  assert.equal(evalMetrics.reliabilityBins.length, 10);

  const highConf = applyCalibration(0.91, cal);
  assert.equal(highConf.isCalibrated, true);
  assert.ok((highConf.calibratedConfidence ?? 0) > 0.8);

  const recPass = decideRecommendation(0.12, 0.92, true, 'STABLE', DEFAULT_SYSTEM_SETTINGS);
  const recReviewBorder = decideRecommendation(0.49, 0.75, true, 'STABLE', DEFAULT_SYSTEM_SETTINGS);
  const recDefect = decideRecommendation(0.84, 0.95, true, 'STABLE', DEFAULT_SYSTEM_SETTINGS);
  const recDriftReview = decideRecommendation(0.22, 0.9, true, 'SIGNIFICANT_SHIFT', DEFAULT_SYSTEM_SETTINGS);

  assert.equal(recPass, 'PASS');
  assert.equal(recReviewBorder, 'REVIEW');
  assert.equal(recDefect, 'DEFECT');
  assert.equal(recDriftReview, 'REVIEW');

  const sevHigh = estimateSeverity('DEFECT', 7.2, 0.89, DEFAULT_SYSTEM_SETTINGS);
  const sevMed = estimateSeverity('DEFECT', 2.4, 0.68, DEFAULT_SYSTEM_SETTINGS);
  const sevLow = estimateSeverity('DEFECT', 0.8, 0.54, DEFAULT_SYSTEM_SETTINGS);
  const sevNone = estimateSeverity('PASS', 0.0, 0.12, DEFAULT_SYSTEM_SETTINGS);

  assert.equal(sevHigh.severity, 'HIGH');
  assert.equal(sevMed.severity, 'MEDIUM');
  assert.equal(sevLow.severity, 'LOW');
  assert.equal(sevNone.severity, 'NONE');
});

test('System settings validator rejects invalid thresholds and accepts valid configuration', () => {
  const bad = validateSystemSettings({
    anomalyThreshold: 1.5,
    severityLowMaxAreaPct: 10,
    severityMediumMaxAreaPct: 5,
    driftWarningThreshold: 4.5,
    driftCriticalThreshold: 3.0,
  });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.length >= 3);

  const good = validateSystemSettings({
    anomalyThreshold: 0.52,
    driftWarningThreshold: 2.0,
    driftCriticalThreshold: 3.5,
  });
  assert.equal(good.valid, true);
  assert.equal(good.sanitized?.anomalyThreshold, 0.52);
});

test('renderVisualizations preserves crisp original image and draws clean green Rectangle or Circle defect markers', async () => {
  const { renderVisualizations } = await import('./anomalyMath');
  const W = 128;
  const H = 128;
  const rgb = makeSyntheticImage(W, H, { baseGray: 130 });
  const pixelMap = new Float32Array(W * H).fill(0.08);
  const mask = new Uint8Array(W * H);
  const region = {
    id: 1,
    x: 44,
    y: 44,
    width: 32,
    height: 32,
    areaPixels: 32 * 32,
    areaPct: 6.25,
    peakIntensity: 0.92,
    meanIntensity: 0.81,
    centroidX: 60,
    centroidY: 60,
  };

  // Rectangle mode
  const rectVis = renderVisualizations(rgb, pixelMap, mask, [region], W, H, 'rectangle');
  // Top-left corner far from defect must remain identical to original (no red heatmap wash!)
  const bgIdx = (4 * W + 4) * 3;
  assert.equal(rectVis.overlayRgb[bgIdx], rgb[bgIdx]);
  assert.equal(rectVis.overlayRgb[bgIdx + 1], rgb[bgIdx + 1]);
  assert.equal(rectVis.overlayRgb[bgIdx + 2], rgb[bgIdx + 2]);

  // Top edge of rectangle (y = 42, x = 60) must be bright green [74, 222, 128]
  const rectEdgeIdx = (42 * W + 60) * 3;
  assert.equal(rectVis.overlayRgb[rectEdgeIdx], 74);
  assert.equal(rectVis.overlayRgb[rectEdgeIdx + 1], 222);
  assert.equal(rectVis.overlayRgb[rectEdgeIdx + 2], 128);

  // Circle mode
  const circVis = renderVisualizations(rgb, pixelMap, mask, [region], W, H, 'circle');
  assert.equal(circVis.overlayRgb[bgIdx], rgb[bgIdx]);
  // Count bright green circle pixels around the defect region
  let greenCount = 0;
  for (let i = 0; i < W * H; i++) {
    const p3 = i * 3;
    if (
      circVis.overlayRgb[p3] === 74 &&
      circVis.overlayRgb[p3 + 1] === 222 &&
      circVis.overlayRgb[p3 + 2] === 128
    ) {
      greenCount++;
    }
  }
  assert.ok(greenCount > 100, `Expected crisp circle outline pixels > 100, got ${greenCount}`);
});
