import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { AnomalyRegion, SeverityLevel } from '../../src/types/prometheus';
import { clamp } from './anomalyMath';

export interface VisionDefectDetection {
  isDefective: boolean;
  anomalyScore: number;
  summary: string;
  regions: AnomalyRegion[];
}

interface RawVisionBox {
  label?: string;
  severity?: string;
  confidence?: number;
  box_2d?: number[]; // [ymin, xmin, ymax, xmax] normalized 0..1000
}

interface RawVisionResponse {
  isDefective?: boolean;
  overallAnomalyScore?: number;
  summary?: string;
  defects?: RawVisionBox[];
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Server-side multimodal open-set defect detector using Gemini Vision (`gemini-4-hydrogen`).
 * Accurately isolates true physical defects on arbitrary uploaded product photographs
 * while ignoring background tables, desks, camera reflections, and studio edges.
 */
export async function detectDefectsWithVision(params: {
  imageBuffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
  category: string;
}): Promise<VisionDefectDetection | null> {
  const ai = getGeminiClient();
  if (!ai) return null;

  const base64Data = params.imageBuffer.toString('base64');

  const prompt = `You are a precision industrial quality inspection computer-vision system.
Analyze the primary manufactured product/object in this photograph (selected inspection category: "${params.category}").

CRITICAL INSPECTION RULES:
1. Inspect ONLY the physical product/object itself. COMPLETELY IGNORE background surfaces (wooden tables, desks, floors, inspection mats, walls), hands, shadows, ambient reflections on glass/metal, or image borders.
2. Identify ONLY genuine physical defects on the product: scratches, gouges, cracks, chips, fractures, broken or bent edges/leads, corrosion/rust, burn marks, dents, holes, tears, or contamination stains.
3. For each real defect found, return a TIGHT, accurate bounding box "box_2d" as [ymin, xmin, ymax, xmax] normalized to integer coordinates from 0 to 1000 tightly enclosing ONLY the defect itself (never the whole product or background).
4. If the product is clean, intact, and has no real physical defects, set "isDefective": false, "overallAnomalyScore" between 0.04 and 0.18, and "defects": [].
5. If defects are present, set "isDefective": true, "overallAnomalyScore" between 0.58 and 0.98 reflecting visual severity, and list up to 5 distinct defect boxes ordered from most severe to least severe.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: params.mimeType,
            data: base64Data,
          },
        },
        { text: prompt },
      ],
    },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isDefective: { type: Type.BOOLEAN },
          overallAnomalyScore: { type: Type.NUMBER },
          summary: { type: Type.STRING },
          defects: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                severity: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
                box_2d: {
                  type: Type.ARRAY,
                  items: { type: Type.NUMBER },
                },
              },
            },
          },
        },
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as RawVisionResponse;
  const totalPixels = Math.max(1, params.width * params.height);

  const rawDefects = Array.isArray(parsed.defects) ? parsed.defects : [];
  const regions: AnomalyRegion[] = [];

  for (const d of rawDefects) {
    if (!Array.isArray(d.box_2d) || d.box_2d.length < 4) continue;
    const [yminN, xminN, ymaxN, xmaxN] = d.box_2d;
    if (
      !Number.isFinite(yminN) ||
      !Number.isFinite(xminN) ||
      !Number.isFinite(ymaxN) ||
      !Number.isFinite(xmaxN)
    ) {
      continue;
    }

    const x0 = clamp(Math.round((xminN / 1000) * params.width), 0, params.width - 2);
    const y0 = clamp(Math.round((yminN / 1000) * params.height), 0, params.height - 2);
    const x1 = clamp(Math.round((xmaxN / 1000) * params.width), x0 + 2, params.width);
    const y1 = clamp(Math.round((ymaxN / 1000) * params.height), y0 + 2, params.height);

    const w = x1 - x0;
    const h = y1 - y0;
    const areaPixels = w * h;
    const areaPct = Number(((areaPixels / totalPixels) * 100).toFixed(2));

    // Reject degenerate boxes covering > 75% of the entire frame (whole-image hallucination guard)
    if (areaPct > 75 || areaPixels < 16) continue;

    const conf = Number.isFinite(d.confidence) ? clamp(d.confidence!, 0.5, 0.99) : 0.85;
    const sevBoost =
      (d.severity || '').toUpperCase() === 'HIGH'
        ? 0.94
        : (d.severity || '').toUpperCase() === 'MEDIUM'
          ? 0.78
          : 0.64;
    const peak = Number(clamp(Math.max(conf, sevBoost), 0.55, 0.99).toFixed(4));

    regions.push({
      id: regions.length + 1,
      label: (d.label || 'Surface defect').trim().slice(0, 48),
      x: x0,
      y: y0,
      width: w,
      height: h,
      areaPixels,
      areaPct,
      peakIntensity: peak,
      meanIntensity: Number((peak * 0.82).toFixed(4)),
      centroidX: Math.round(x0 + w / 2),
      centroidY: Math.round(y0 + h / 2),
    });
  }

  const isDefective = Boolean(parsed.isDefective) && regions.length > 0;
  const rawScore = Number.isFinite(parsed.overallAnomalyScore)
    ? clamp(parsed.overallAnomalyScore!, 0, 1)
    : isDefective
      ? Math.max(...regions.map((r) => r.peakIntensity))
      : 0.11;

  const anomalyScore = isDefective
    ? Number(clamp(Math.max(rawScore, 0.58), 0.58, 0.98).toFixed(4))
    : Number(clamp(Math.min(rawScore, 0.24), 0.04, 0.24).toFixed(4));

  return {
    isDefective,
    anomalyScore,
    summary:
      typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim().slice(0, 220)
        : isDefective
          ? `Detected ${regions.length} localized defect region(s) on the inspected surface.`
          : 'No significant physical defects detected on the inspected product surface.',
    regions,
  };
}

/**
 * Generates a localized pixel-level anomaly field & binary segmentation mask strictly inside
 * detected defect regions, modulated by local image gradient energy for realistic surface contour fidelity.
 */
export function buildLocalizedMapFromRegions(
  rgb: Uint8Array,
  width: number,
  height: number,
  regions: AnomalyRegion[]
): { pixelMap: Float32Array; mask: Uint8Array; affectedAreaPct: number; meanIntensity: number; peakIntensity: number } {
  const totalPixels = width * height;
  const pixelMap = new Float32Array(totalPixels);
  const mask = new Uint8Array(totalPixels);

  // Subtle nominal baseline across non-defective pixels
  pixelMap.fill(0.06);

  if (regions.length === 0) {
    return { pixelMap, mask, affectedAreaPct: 0, meanIntensity: 0.06, peakIntensity: 0.08 };
  }

  let activePixels = 0;
  let peakIntensity = 0;

  for (const reg of regions) {
    const cx = reg.x + reg.width / 2;
    const cy = reg.y + reg.height / 2;
    const rx = Math.max(4, reg.width / 2);
    const ry = Math.max(4, reg.height / 2);
    const padX = Math.max(6, Math.round(rx * 0.45));
    const padY = Math.max(6, Math.round(ry * 0.45));

    const yStart = clamp(reg.y - padY, 0, height - 1);
    const yEnd = clamp(reg.y + reg.height + padY, 0, height - 1);
    const xStart = clamp(reg.x - padX, 0, width - 1);
    const xEnd = clamp(reg.x + reg.width + padX, 0, width - 1);

    for (let y = yStart; y <= yEnd; y++) {
      for (let x = xStart; x <= xEnd; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const distSq = dx * dx + dy * dy;
        // Smooth elliptical Gaussian envelope centered on the localized defect
        const envelope = Math.exp(-distSq * 0.95);

        // Modulate slightly by local luminance edge contrast so scratches/cracks stand out sharply
        const idx = y * width + x;
        let localEdge = 0;
        if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
          const pLeft = (idx - 1) * 3;
          const pRight = (idx + 1) * 3;
          const pUp = (idx - width) * 3;
          const pDown = (idx + width) * 3;
          const gx = Math.abs(rgb[pRight] - rgb[pLeft]);
          const gy = Math.abs(rgb[pDown] - rgb[pUp]);
          localEdge = clamp((gx + gy) / 180, 0, 0.22);
        }

        const score = clamp(0.06 + envelope * (reg.peakIntensity - 0.06) + envelope * localEdge, 0, 1);
        if (score > pixelMap[idx]) {
          pixelMap[idx] = score;
        }
        if (score > peakIntensity) {
          peakIntensity = score;
        }
        if (distSq <= 1.0 && mask[idx] === 0) {
          mask[idx] = 255;
          activePixels++;
        }
      }
    }
  }

  let sum = 0;
  for (let i = 0; i < totalPixels; i++) sum += pixelMap[i];

  return {
    pixelMap,
    mask,
    affectedAreaPct: Number(((activePixels / totalPixels) * 100).toFixed(2)),
    meanIntensity: Number((sum / totalPixels).toFixed(4)),
    peakIntensity: Number(peakIntensity.toFixed(4)),
  };
}

export function severityFromVision(
  isDefective: boolean,
  affectedAreaPct: number,
  peakIntensity: number
): SeverityLevel {
  if (!isDefective) return 'NONE';
  if (affectedAreaPct > 5.5 || peakIntensity >= 0.85) return 'HIGH';
  if (affectedAreaPct > 1.5 || peakIntensity >= 0.68) return 'MEDIUM';
  return 'LOW';
}
