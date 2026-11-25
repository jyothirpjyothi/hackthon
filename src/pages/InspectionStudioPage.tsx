import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  Circle,
  Crosshair,
  Download,
  FileImage,
  Loader2,
  Play,
  Square,
  Upload,
} from 'lucide-react';
import {
  MVTEC_CATEGORIES,
  type InspectionRecord,
  type MarkerShape,
  type ModelVersionInfo,
  type SampleSpecimen,
} from '../types/prometheus';
import {
  extractErrorMessage,
  fetchModelInfo,
  fetchSampleSpecimens,
  getReportDownloadUrl,
  runInspection,
} from '../services/api';
import { DefectOverlayImage } from '../components/DefectOverlayImage';
import {
  DriftStatusText,
  PredictionStatus,
  SeverityText,
  formatTimestamp,
} from '../components/StatusText';
import type { AppPage } from '../components/Layout';

interface InspectionStudioPageProps {
  onInspectionCompleted: (record: InspectionRecord) => void;
  onOpenLocalization: (record: InspectionRecord) => void;
  onNavigate: (page: AppPage) => void;
}

const PROCESSING_STAGES = [
  'Validating image format and decoding pixel tensor',
  'Extracting multi-scale locally-aware patch descriptors',
  'Computing k-NN distances against normal coreset memory bank',
  'Generating pixel-level anomaly heatmap, overlay, and defect mask',
  'Evaluating severity, Platt calibration, and distribution shift',
];

export function InspectionStudioPage({
  onInspectionCompleted,
  onOpenLocalization,
  onNavigate,
}: InspectionStudioPageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [category, setCategory] = useState<string>('Metal Nut');
  const [markerShape, setMarkerShape] = useState<MarkerShape>('rectangle');
  const [showHeatmapTint, setShowHeatmapTint] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedSampleKey, setSelectedSampleKey] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);

  const [samples, setSamples] = useState<SampleSpecimen[]>([]);
  const [models, setModels] = useState<ModelVersionInfo[]>([]);
  const [running, setRunning] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InspectionRecord | null>(null);

  useEffect(() => {
    fetchSampleSpecimens().then(setSamples).catch(() => {});
    fetchModelInfo()
      .then((res) => setModels(res.models))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!running) {
      setStageIdx(0);
      return;
    }
    const timer = window.setInterval(() => {
      setStageIdx((prev) => Math.min(PROCESSING_STAGES.length - 1, prev + 1));
    }, 220);
    return () => window.clearInterval(timer);
  }, [running]);

  const activeModel = models.find((m) => m.category === category);

  const validateAndAttachFile = (file: File) => {
    setError(null);
    const ext = file.name.toLowerCase().split('.').pop() || '';
    if (!['jpg', 'jpeg', 'png'].includes(ext) && !['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Unsupported file format. Please upload a JPG, JPEG, or PNG image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image exceeds the 10 MB maximum upload limit.');
      return;
    }
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(file);
    setSelectedSampleKey(null);
    setCategory('General Surface');
    setPreviewUrl(URL.createObjectURL(file));
    setPreviewLabel(`${file.name} · ${(file.size / 1024).toFixed(0)} KB`);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndAttachFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndAttachFile(file);
  };

  const handleSelectSpecimen = (spec: SampleSpecimen) => {
    setError(null);
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setSelectedSampleKey(spec.key);
    setCategory(spec.category);
    setPreviewUrl(spec.imageUrl);
    setPreviewLabel(`${spec.label} · ${spec.expectedKind}`);
  };

  const handleStartInspection = async () => {
    if (!selectedFile && !selectedSampleKey) {
      setError('Upload a product image or choose a calibration specimen before starting inspection.');
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const inspection = await runInspection({
        file: selectedFile,
        sampleKey: selectedSampleKey,
        category,
        markerShape,
      });
      setResult(inspection);
      onInspectionCompleted(inspection);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Input & Configuration Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Upload & Controls */}
        <section
          aria-label="Image upload and category selection"
          className="lg:col-span-5 p-6 rounded-xl bg-[#0F1624] border border-slate-800 space-y-5"
        >
          <div>
            <h2 className="text-base font-semibold text-slate-100">Inspection Input</h2>
            <p className="text-xs text-slate-400 mt-1">
              Upload a JPG, JPEG, or PNG product photograph (max 10 MB) for open-set anomaly analysis.
            </p>
          </div>

          {/* Product Category Selector */}
          <div>
            <label htmlFor="category-select" className="block text-xs font-medium text-slate-300 mb-1.5">
              Product Category (MVTec AD)
            </label>
            <select
              id="category-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#070B14] border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            >
              {MVTEC_CATEGORIES.map((cat) => {
                const m = models.find((item) => item.category === cat);
                const statusTag =
                  cat === 'General Surface'
                    ? ' — Open-Set Vision (Any Product)'
                    : m?.trainingStatus === 'TRAINED'
                      ? m.calibrationStatus === 'CALIBRATED'
                        ? ' — Trained & Calibrated'
                        : ' — Trained Baseline'
                      : ' — Zero-Shot Open-Set';
                return (
                  <option key={cat} value={cat}>
                    {cat}
                    {statusTag}
                  </option>
                );
              })}
            </select>
            {activeModel && (
              <p className="text-xs text-slate-400 mt-2 font-mono">
                {category === 'General Surface'
                  ? 'Open-Set Vision localizer: isolates physical defects on any product surface while ignoring desks, backgrounds, and reflections.'
                  : activeModel.trainingStatus === 'TRAINED'
                    ? `Active baseline: ${activeModel.architecture} v${activeModel.version} · ${activeModel.coresetSize} coreset patches · ${activeModel.calibrationStatus === 'CALIBRATED' ? 'Platt calibrated' : 'Uncalibrated'}`
                    : 'No normal checkpoint trained yet — runs zero-shot open-set anomaly detection (uncalibrated).'}
              </p>
            )}
          </div>

          {/* Defect Marker Shape Selector */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-slate-300">Defect Marker Style</span>
            <div className="inline-flex items-center p-0.5 rounded-lg bg-[#070B14] border border-slate-800">
              <button
                type="button"
                onClick={() => setMarkerShape('rectangle')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  markerShape === 'rectangle'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                <Square className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>Rectangle</span>
              </button>
              <button
                type="button"
                onClick={() => setMarkerShape('circle')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  markerShape === 'circle'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                <Circle className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>Circle</span>
              </button>
            </div>
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`rounded-xl border border-dashed p-5 text-center transition-colors ${
              dragActive
                ? 'border-cyan-400 bg-cyan-500/10'
                : 'border-slate-700 bg-[#070B14]/70 hover:border-slate-500'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              onChange={handleFileChange}
              aria-label="Upload product image"
              className="sr-only"
            />
            {previewUrl ? (
              <div className="space-y-3">
                <div className="w-44 h-44 mx-auto rounded-lg overflow-hidden border border-slate-700 bg-[#070B14]">
                  <img
                    src={previewUrl}
                    alt="Selected product preview"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="text-xs text-slate-300 truncate">{previewLabel}</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-medium underline underline-offset-4"
                >
                  Choose a different image
                </button>
              </div>
            ) : (
              <div className="py-4 space-y-3">
                <Upload className="w-7 h-7 text-slate-400 mx-auto" aria-hidden="true" />
                <div>
                  <p className="text-sm text-slate-200 font-medium">
                    Drag and drop an industrial product image
                  </p>
                  <p className="text-xs text-slate-500 mt-1">JPG, JPEG, or PNG up to 10 MB</p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  Browse Files
                </button>
              </div>
            )}
          </div>

          {error && (
            <div role="alert" className="p-3.5 rounded-lg bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200">
              {error}
            </div>
          )}

          {/* Primary Action Button */}
          <button
            type="button"
            disabled={running}
            onClick={handleStartInspection}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
                <span>Running PatchCore Inference...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Start AI Inspection</span>
              </>
            )}
          </button>

          {running && (
            <div className="pt-2 space-y-1.5" aria-live="polite">
              <p className="text-xs font-mono text-cyan-400">
                Stage {stageIdx + 1} / {PROCESSING_STAGES.length}
              </p>
              <p className="text-xs text-slate-300">{PROCESSING_STAGES[stageIdx]}</p>
            </div>
          )}
        </section>

        {/* Right: Quick Test Industrial Specimens */}
        <section
          aria-label="Industrial test specimens"
          className="lg:col-span-7 p-6 rounded-xl bg-[#0F1624] border border-slate-800 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Reference & Unseen-Defect Test Specimens
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Load a real industrial specimen photo to verify live PatchCore inference, pixel
                localization, and open-set detection without leaving the studio.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {samples.map((spec) => {
              const selected = selectedSampleKey === spec.key;
              return (
                <button
                  key={spec.key}
                  type="button"
                  onClick={() => handleSelectSpecimen(spec)}
                  className={`text-left p-3 rounded-lg border transition-colors flex items-start gap-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    selected
                      ? 'bg-blue-600/15 border-cyan-400/70'
                      : 'bg-[#070B14]/70 border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <img
                    src={spec.imageUrl}
                    alt={spec.label}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-md object-cover border border-slate-700 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-cyan-400 truncate">
                      {spec.category} · {spec.expectedKind}
                    </p>
                    <p className="text-sm font-medium text-slate-100 leading-snug mt-0.5">
                      {spec.label.replace(/^[^—]+—\s*/, '')}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{spec.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>
              Want to train a custom normal baseline for another MVTec AD category?
            </span>
            <button
              type="button"
              onClick={() => onNavigate('model')}
              className="text-cyan-400 hover:text-cyan-300 font-medium whitespace-nowrap"
            >
              Open Model Training
            </button>
          </div>
        </section>
      </div>

      {/* Inspection Output Results */}
      {result ? (
        <section
          aria-label="Inspection results"
          data-testid="inspection-result-panel"
          className="p-6 rounded-xl bg-[#0F1624] border border-slate-800 space-y-6"
        >
          {/* Header Summary Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
            <div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-slate-400 mb-1.5">
                <span>{result.id}</span>
                <span aria-hidden="true">·</span>
                <span>{result.category}</span>
                <span aria-hidden="true">·</span>
                <span>{result.architecture}</span>
                <span aria-hidden="true">·</span>
                <span>{result.inferenceMs} ms</span>
                <span aria-hidden="true">·</span>
                <span>{formatTimestamp(result.createdAt)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <h2 className="text-lg font-semibold text-slate-100">Inspection Verdict</h2>
                <PredictionStatus outcome={result.prediction} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => onOpenLocalization(result)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
              >
                <Crosshair className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Inspect Localization</span>
              </button>
              <a
                href={getReportDownloadUrl(result.id)}
                download
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Download Report</span>
              </a>
            </div>
          </div>

          {/* 3 Visual Inspection Outputs: Original, Anomaly Heatmap, Clean Defect Marker Overlay */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between h-6">
                <p className="text-xs font-medium text-slate-300">1. Original Specimen</p>
                <span className="text-[11px] font-mono text-slate-500">
                  {result.imageWidth}×{result.imageHeight}
                </span>
              </div>
              <div className="aspect-square rounded-lg overflow-hidden border border-slate-800 bg-[#070B14]">
                <img
                  src={result.originalUrl}
                  alt="Original inspected product"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between h-6">
                <p className="text-xs font-medium text-slate-300">2. Pixel Anomaly Heatmap</p>
              </div>
              <div className="aspect-square rounded-lg overflow-hidden border border-slate-800 bg-[#070B14]">
                <img
                  src={result.heatmapUrl}
                  alt="Pixel-level anomaly intensity heatmap"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 h-6">
                <p className="text-xs font-medium text-slate-300 whitespace-nowrap">
                  3. Defect Localization
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <label className="inline-flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showHeatmapTint}
                      onChange={(e) => setShowHeatmapTint(e.target.checked)}
                      className="accent-cyan-400 rounded"
                    />
                    <span>Heatmap</span>
                  </label>
                  <div className="inline-flex items-center p-0.5 rounded bg-[#070B14] border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setMarkerShape('rectangle')}
                      aria-label="Highlight defects with rectangle"
                      title="Rectangle marker"
                      className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        markerShape === 'rectangle'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      Rect
                    </button>
                    <button
                      type="button"
                      onClick={() => setMarkerShape('circle')}
                      aria-label="Highlight defects with circle"
                      title="Circle marker"
                      className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        markerShape === 'circle'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      Circle
                    </button>
                  </div>
                </div>
              </div>
              <div className="aspect-square rounded-lg overflow-hidden border border-slate-800 bg-[#070B14]">
                <DefectOverlayImage
                  originalUrl={result.originalUrl}
                  heatmapUrl={result.heatmapUrl}
                  imageWidth={result.imageWidth}
                  imageHeight={result.imageHeight}
                  regions={result.regions}
                  prediction={result.prediction}
                  markerShape={markerShape}
                  showHeatmapTint={showHeatmapTint}
                  showLabels={result.regions.some((r) => Boolean(r.label))}
                  alt="Defect localization overlay with crisp rectangle or circle markers"
                />
              </div>
            </div>
          </div>

          {/* Structured Quantitative Readouts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 pt-4 border-t border-slate-800">
            <div>
              <p className="text-xs text-slate-400 mb-1">Anomaly Score</p>
              <p className="text-2xl font-mono font-semibold tabular-nums text-slate-50">
                {result.anomalyScore.toFixed(4)}
              </p>
              <p className="text-xs font-mono text-slate-500 mt-1">
                Raw k-NN dist: {result.rawDistance.toFixed(3)} · Peak: {result.peakIntensity.toFixed(3)}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-400 mb-1">Estimated Severity</p>
              <div className="mt-1">
                <SeverityText severity={result.severity} />
              </div>
              <p className="text-xs font-mono text-slate-400 mt-1.5 tabular-nums">
                Affected area: {result.affectedAreaPct.toFixed(2)}% ({result.regions.length} region
                {result.regions.length === 1 ? '' : 's'})
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-400 mb-1">Confidence Calibration</p>
              {result.calibrationStatus === 'CALIBRATED' && result.calibratedConfidence !== null ? (
                <>
                  <p className="text-2xl font-mono font-semibold tabular-nums text-cyan-300">
                    {(result.calibratedConfidence * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs font-mono text-slate-400 mt-1 tabular-nums">
                    Platt calibrated · Uncertainty: {(result.uncertaintyScore ?? 0).toFixed(3)}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-amber-300 mt-1">Uncalibrated score</p>
                  <p className="text-xs text-slate-400 mt-1">
                    No held-out calibration fitted for {result.category}; score is raw anomaly intensity.
                  </p>
                </>
              )}
            </div>

            <div>
              <p className="text-xs text-slate-400 mb-1">Distribution Shift Status</p>
              <div className="mt-1">
                <DriftStatusText status={result.driftStatus} />
              </div>
              <p className="text-xs font-mono text-slate-400 mt-1.5 tabular-nums">
                Drift distance: {result.driftDistance.toFixed(3)} σ
              </p>
            </div>
          </div>

          {/* Recommendation & Scientific Disclaimers */}
          <div className="pt-4 border-t border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-400">
            <div>
              <span className="text-slate-200 font-medium">Final Recommendation: </span>
              {result.prediction === 'PASS' &&
                'PASS — No significant deviation from learned normal manufacturing patterns detected.'}
              {result.prediction === 'DEFECT' &&
                'DEFECT — Localized structural or surface anomaly exceeds the operating threshold. Quarantine for quality verification.'}
              {result.prediction === 'REVIEW' &&
                'REVIEW — Borderline score, elevated uncertainty, or input distribution shift detected. Routed to Human Review Center.'}
            </div>
            <div>
              <span className="text-slate-200 font-medium">Inspection Note: </span>
              {result.severityNote}
              {result.driftStatus !== 'STABLE' &&
                ' A distribution shift warning indicates changed imaging or material conditions and does not automatically prove product damage.'}
            </div>
          </div>
        </section>
      ) : (
        <section className="p-8 rounded-xl bg-[#0F1624] border border-slate-800 flex items-center gap-4 text-sm text-slate-400">
          <FileImage className="w-5 h-5 text-slate-500 shrink-0" aria-hidden="true" />
          <p>
            Select a product category and upload an image (or load a reference specimen above), then
            click <strong className="text-slate-200 font-medium">Start AI Inspection</strong> to run
            real PatchCore anomaly detection and pixel-level localization.
          </p>
        </section>
      )}
    </div>
  );
}
