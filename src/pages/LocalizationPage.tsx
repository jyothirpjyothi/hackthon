import { useEffect, useState, type MouseEvent } from 'react';
import { Circle, Crosshair, Download, Layers, ScanSearch, Square } from 'lucide-react';
import {
  extractErrorMessage,
  fetchInspections,
  getReportDownloadUrl,
} from '../services/api';
import type { InspectionRecord, MarkerShape } from '../types/prometheus';
import { DefectOverlayImage } from '../components/DefectOverlayImage';
import {
  PredictionStatus,
  SeverityText,
  formatTimestamp,
} from '../components/StatusText';
import type { AppPage } from '../components/Layout';

interface LocalizationPageProps {
  selectedInspectionId: string | null;
  onSelectInspectionId: (id: string) => void;
  onNavigate: (page: AppPage) => void;
}

type ViewMode = 'quad' | 'compare' | 'overlay';

export function LocalizationPage({
  selectedInspectionId,
  onSelectInspectionId,
  onNavigate,
}: LocalizationPageProps) {
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('compare');
  const [markerShape, setMarkerShape] = useState<MarkerShape>('rectangle');
  const [splitPct, setSplitPct] = useState(50);
  const [overlayOpacity, setOverlayOpacity] = useState(75);
  const [compareLayer, setCompareLayer] = useState<'overlay' | 'heatmap' | 'mask'>('overlay');
  const [probeCoords, setProbeCoords] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchInspections()
      .then((list) => {
        if (!active) return;
        setInspections(list);
        if (list.length > 0 && (!selectedInspectionId || !list.some((i) => i.id === selectedInspectionId))) {
          onSelectInspectionId(list[0].id);
        }
      })
      .catch((err) => {
        if (active) setError(extractErrorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedInspectionId, onSelectInspectionId]);

  const current =
    inspections.find((i) => i.id === selectedInspectionId) || inspections[0] || null;

  const handleProbeMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setProbeCoords({
      x: Math.round(nx * current.imageWidth),
      y: Math.round(ny * current.imageHeight),
    });
  };

  if (loading) {
    return <div className="h-96 rounded-xl bg-[#0F1624] border border-slate-800 animate-pulse" />;
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl bg-[#0F1624] border border-rose-500/40 text-sm text-rose-300">
        {error}
      </div>
    );
  }

  if (!current) {
    return (
      <div className="p-12 rounded-xl bg-[#0F1624] border border-slate-800 text-center max-w-xl mx-auto">
        <Crosshair className="w-8 h-8 text-cyan-400 mx-auto mb-3" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-100 mb-2">No localized inspections yet</h2>
        <p className="text-sm text-slate-400 mb-6">
          Run an inspection in the AI Inspection Studio to generate pixel-level heatmaps,
          overlays, binary segmentation masks, and bounding-box region statistics.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('studio')}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap"
        >
          <ScanSearch className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Go to AI Inspection Studio</span>
        </button>
      </div>
    );
  }

  const compareLayerUrl =
    compareLayer === 'overlay'
      ? current.overlayUrl
      : compareLayer === 'heatmap'
        ? current.heatmapUrl
        : current.maskUrl;

  return (
    <div className="space-y-6">
      {/* Top Inspection Selector & View Controls */}
      <div className="p-4 sm:p-5 rounded-xl bg-[#0F1624] border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
          <label htmlFor="loc-inspection-select" className="text-xs font-medium text-slate-400 whitespace-nowrap">
            Inspection Record
          </label>
          <select
            id="loc-inspection-select"
            value={current.id}
            onChange={(e) => onSelectInspectionId(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 text-xs sm:text-sm font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
          >
            {inspections.map((ins) => (
              <option key={ins.id} value={ins.id}>
                {ins.id} · {ins.category} · {ins.prediction} ({ins.anomalyScore.toFixed(3)})
              </option>
            ))}
          </select>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <PredictionStatus outcome={current.prediction} />
            <span aria-hidden="true">·</span>
            <SeverityText severity={current.severity} />
          </div>
        </div>

        {/* Interactive View Mode & Marker Shape Controls */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="inline-flex items-center p-1 rounded-lg bg-[#070B14] border border-slate-800">
            <button
              type="button"
              onClick={() => setMarkerShape('rectangle')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
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
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                markerShape === 'circle'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <Circle className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span>Circle</span>
            </button>
          </div>

          <div className="inline-flex items-center p-1 rounded-lg bg-[#070B14] border border-slate-800">
            {(
              [
                { id: 'compare', label: 'Split Compare' },
                { id: 'quad', label: 'Quad View' },
                { id: 'overlay', label: 'Opacity Blend' },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setViewMode(mode.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  viewMode === mode.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <a
            href={getReportDownloadUrl(current.id)}
            download
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 border border-slate-700 hover:border-slate-500 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Report</span>
          </a>
        </div>
      </div>

      {/* Main Visual Inspection Stage + Side Statistics */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 p-6 rounded-xl bg-[#0F1624] border border-slate-800 space-y-5">
          {viewMode === 'compare' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <Layers className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                  <span className="text-slate-300 font-medium">Right-Side Layer:</span>
                  {(
                    [
                      { id: 'overlay', label: 'Overlay' },
                      { id: 'heatmap', label: 'Heatmap' },
                      { id: 'mask', label: 'Segmentation Mask' },
                    ] as const
                  ).map((layer) => (
                    <button
                      key={layer.id}
                      type="button"
                      onClick={() => setCompareLayer(layer.id)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                        compareLayer === layer.id
                          ? 'bg-slate-800 text-cyan-300 border border-cyan-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {layer.label}
                    </button>
                  ))}
                </div>
                {probeCoords && (
                  <span className="font-mono text-xs text-cyan-300 tabular-nums">
                    Cursor: ({probeCoords.x}px, {probeCoords.y}px)
                  </span>
                )}
              </div>

              {/* Split-Slider Comparison Canvas */}
              <div
                className="relative aspect-square max-w-[540px] mx-auto rounded-lg overflow-hidden border border-slate-700 bg-[#070B14] cursor-crosshair select-none"
                onMouseMove={handleProbeMove}
                onMouseLeave={() => setProbeCoords(null)}
              >
                {compareLayer === 'overlay' ? (
                  <div className="absolute inset-0">
                    <DefectOverlayImage
                      originalUrl={current.originalUrl}
                      heatmapUrl={current.heatmapUrl}
                      imageWidth={current.imageWidth}
                      imageHeight={current.imageHeight}
                      regions={current.regions}
                      prediction={current.prediction}
                      markerShape={markerShape}
                      showLabels={current.regions.some((r) => Boolean(r.label))}
                      alt="Defect localization marker overlay"
                    />
                  </div>
                ) : (
                  <img
                    src={compareLayerUrl}
                    alt="Anomaly visualization layer"
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                )}
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
                >
                  <img
                    src={current.originalUrl}
                    alt="Original product image"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 pointer-events-none"
                  style={{ left: `${splitPct}%` }}
                />
                <div className="absolute top-3 left-3 px-2 py-1 rounded bg-[#070B14]/85 text-[11px] font-mono text-slate-200 pointer-events-none">
                  Original
                </div>
                <div className="absolute top-3 right-3 px-2 py-1 rounded bg-[#070B14]/85 text-[11px] font-mono text-cyan-300 pointer-events-none capitalize">
                  {compareLayer === 'overlay' ? `${markerShape} Marker` : compareLayer}
                </div>
              </div>

              <div className="max-w-[540px] mx-auto">
                <label htmlFor="split-slider" className="flex justify-between text-xs text-slate-400 mb-1.5">
                  <span>Comparison Split Position</span>
                  <span className="font-mono tabular-nums">{splitPct}%</span>
                </label>
                <input
                  id="split-slider"
                  type="range"
                  min={0}
                  max={100}
                  value={splitPct}
                  onChange={(e) => setSplitPct(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>
            </div>
          )}

          {viewMode === 'quad' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-300">Original Image</p>
                <div className="aspect-square rounded-lg overflow-hidden border border-slate-800 bg-[#070B14]">
                  <img
                    src={current.originalUrl}
                    alt="Original Image"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-300">Anomaly Heatmap</p>
                <div className="aspect-square rounded-lg overflow-hidden border border-slate-800 bg-[#070B14]">
                  <img
                    src={current.heatmapUrl}
                    alt="Anomaly Heatmap"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-300">
                  Defect Localization ({markerShape === 'circle' ? 'Circle' : 'Rectangle'})
                </p>
                <div className="aspect-square rounded-lg overflow-hidden border border-slate-800 bg-[#070B14]">
                  <DefectOverlayImage
                    originalUrl={current.originalUrl}
                    heatmapUrl={current.heatmapUrl}
                    imageWidth={current.imageWidth}
                    imageHeight={current.imageHeight}
                    regions={current.regions}
                    prediction={current.prediction}
                    markerShape={markerShape}
                    showLabels={current.regions.some((r) => Boolean(r.label))}
                    alt="Defect Localization Marker Overlay"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-300">Thresholded Segmentation Mask</p>
                <div className="aspect-square rounded-lg overflow-hidden border border-slate-800 bg-[#070B14]">
                  <img
                    src={current.maskUrl}
                    alt="Thresholded Segmentation Mask"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            </div>
          )}

          {viewMode === 'overlay' && (
            <div className="space-y-4">
              <div
                className="relative aspect-square max-w-[540px] mx-auto rounded-lg overflow-hidden border border-slate-700 bg-[#070B14] cursor-crosshair"
                onMouseMove={handleProbeMove}
                onMouseLeave={() => setProbeCoords(null)}
              >
                <img
                  src={current.originalUrl}
                  alt="Original product"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-contain"
                />
                <img
                  src={current.heatmapUrl}
                  alt="Thermal anomaly heatmap layer"
                  referrerPolicy="no-referrer"
                  style={{ opacity: overlayOpacity / 100 }}
                  className="absolute inset-0 w-full h-full object-contain"
                />
              </div>
              <div className="max-w-[540px] mx-auto">
                <label htmlFor="opacity-slider" className="flex justify-between text-xs text-slate-400 mb-1.5">
                  <span>Heatmap Blend Opacity</span>
                  <span className="font-mono tabular-nums">{overlayOpacity}%</span>
                </label>
                <input
                  id="opacity-slider"
                  type="range"
                  min={0}
                  max={100}
                  value={overlayOpacity}
                  onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>
            </div>
          )}

          {/* Anomaly Intensity Legend */}
          <div className="pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
              <span className="font-medium">Anomaly Intensity Legend (Normalized PatchCore Deviation)</span>
              <span className="font-mono text-slate-400">
                {current.imageWidth}×{current.imageHeight}px
              </span>
            </div>
            <div
              className="h-3 w-full rounded"
              style={{
                background:
                  'linear-gradient(90deg, rgb(12,22,48) 0%, rgb(22,92,185) 25%, rgb(16,185,196) 50%, rgb(245,168,28) 75%, rgb(232,36,48) 100%)',
              }}
              aria-hidden="true"
            />
            <div className="flex justify-between text-[11px] font-mono text-slate-400 mt-1.5 tabular-nums">
              <span>0.00 Normal</span>
              <span>0.25 Low Variance</span>
              <span>0.50 Elevated</span>
              <span>0.75 Severe</span>
              <span>1.00 Peak Anomaly</span>
            </div>
          </div>
        </div>

        {/* Right: Region Statistics & Coordinates */}
        <div className="xl:col-span-4 space-y-6">
          <div className="p-6 rounded-xl bg-[#0F1624] border border-slate-800 space-y-4">
            <h2 className="text-base font-semibold text-slate-100">Spatial Anomaly Summary</h2>
            <dl className="divide-y divide-slate-800 text-sm">
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-400">Affected Surface Area</dt>
                <dd className="font-mono tabular-nums text-slate-100">
                  {current.affectedAreaPct.toFixed(2)}%
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-400">Peak Pixel Intensity</dt>
                <dd className="font-mono tabular-nums text-rose-300">
                  {current.peakIntensity.toFixed(4)}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-400">Mean Field Intensity</dt>
                <dd className="font-mono tabular-nums text-slate-200">
                  {current.meanAnomalyIntensity.toFixed(4)}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-400">Detected Regions</dt>
                <dd className="font-mono tabular-nums text-cyan-300">{current.regions.length}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-400">Inspected At</dt>
                <dd className="font-mono text-xs text-slate-300">
                  {formatTimestamp(current.createdAt)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="p-6 rounded-xl bg-[#0F1624] border border-slate-800 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Localized Defect Regions</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Connected components exceeding segmentation mask threshold
              </p>
            </div>

            {current.regions.length === 0 ? (
              <p className="text-xs text-slate-400 py-4">
                No localized connected anomaly regions exceeded the mask threshold for this specimen.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-2 font-medium">#</th>
                      <th className="pb-2 font-medium">BBox (x,y,w,h)</th>
                      <th className="pb-2 font-medium text-right">Area</th>
                      <th className="pb-2 font-medium text-right">Peak</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
                    {current.regions.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 text-cyan-400">
                          <div>R{r.id}</div>
                          {r.label && (
                            <div className="text-[10px] font-sans text-slate-400 max-w-[90px] truncate">
                              {r.label}
                            </div>
                          )}
                        </td>
                        <td className="py-2 text-slate-300">
                          [{r.x}, {r.y}, {r.width}, {r.height}]
                        </td>
                        <td className="py-2 text-right text-slate-200">{r.areaPct.toFixed(2)}%</td>
                        <td className="py-2 text-right text-rose-300">
                          {r.peakIntensity.toFixed(3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
