import { useCallback, useEffect, useState } from 'react';
import {
  Crosshair,
  Download,
  Eye,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { MVTEC_CATEGORIES, type InspectionRecord, type MarkerShape } from '../types/prometheus';
import {
  deleteInspection,
  extractErrorMessage,
  fetchInspections,
  getReportDownloadUrl,
} from '../services/api';
import { DefectOverlayImage } from '../components/DefectOverlayImage';
import {
  DriftStatusText,
  PredictionStatus,
  ReviewStatusText,
  SeverityText,
  formatTimestamp,
} from '../components/StatusText';
import type { AppPage } from '../components/Layout';

interface HistoryPageProps {
  onOpenLocalization: (record: InspectionRecord) => void;
  onNavigate: (page: AppPage) => void;
  onDataMutated: () => void;
}

export function HistoryPage({
  onOpenLocalization,
  onNavigate,
  onDataMutated,
}: HistoryPageProps) {
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [predictionFilter, setPredictionFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [detailRecord, setDetailRecord] = useState<InspectionRecord | null>(null);
  const [markerShape, setMarkerShape] = useState<MarkerShape>('rectangle');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchInspections({
        search: search || undefined,
        category: categoryFilter,
        prediction: predictionFilter,
        sortBy,
        sortDir,
      });
      setRecords(list);
      setError(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, predictionFilter, sortBy, sortDir]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async (id: string) => {
    try {
      await deleteInspection(id);
      if (detailRecord?.id === id) setDetailRecord(null);
      await loadData();
      onDataMutated();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      {/* Search, Filter & Sort Toolbar */}
      <div className="p-4 rounded-xl bg-[#0F1624] border border-slate-800 flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by inspection ID, filename, category, or notes..."
            aria-label="Search inspection history"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Filter by product category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
          >
            <option value="ALL">All Categories</option>
            {MVTEC_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center p-0.5 rounded-lg bg-[#070B14] border border-slate-800">
            {(['ALL', 'PASS', 'DEFECT', 'REVIEW'] as const).map((pred) => (
              <button
                key={pred}
                type="button"
                onClick={() => setPredictionFilter(pred)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  predictionFilter === pred
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {pred === 'ALL' ? 'All' : pred}
              </button>
            ))}
          </div>

          <select
            aria-label="Sort inspections"
            value={`${sortBy}:${sortDir}`}
            onChange={(e) => {
              const [col, dir] = e.target.value.split(':');
              setSortBy(col);
              setSortDir(dir as 'asc' | 'desc');
            }}
            className="px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
          >
            <option value="createdAt:desc">Newest First</option>
            <option value="createdAt:asc">Oldest First</option>
            <option value="anomalyScore:desc">Highest Anomaly Score</option>
            <option value="anomalyScore:asc">Lowest Anomaly Score</option>
            <option value="severity:desc">Highest Severity</option>
          </select>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200">
          {error}
        </div>
      )}

      {/* Inspection Table */}
      <div className="rounded-xl bg-[#0F1624] border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-slate-800/60 animate-pulse" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center">
            <h2 className="text-base font-semibold text-slate-200 mb-1">
              No inspection records match your criteria
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              Run a new inspection in AI Inspection Studio or clear active filters.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('studio')}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap"
            >
              Start AI Inspection
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-400 bg-[#0B111E]">
                  <th className="py-3 px-4 font-medium">Inspection ID</th>
                  <th className="py-3 px-4 font-medium">Product Category</th>
                  <th className="py-3 px-4 font-medium">Date & Time</th>
                  <th className="py-3 px-4 font-medium">Prediction</th>
                  <th className="py-3 px-4 font-medium">Severity</th>
                  <th className="py-3 px-4 font-medium text-right">Anomaly Score</th>
                  <th className="py-3 px-4 font-medium">Review Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-800/35 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-cyan-300 whitespace-nowrap">
                      {rec.id}
                    </td>
                    <td className="py-3 px-4 text-slate-200 whitespace-nowrap">{rec.category}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-400 whitespace-nowrap">
                      {formatTimestamp(rec.createdAt)}
                    </td>
                    <td className="py-3 px-4">
                      <PredictionStatus outcome={rec.prediction} />
                    </td>
                    <td className="py-3 px-4">
                      <SeverityText severity={rec.severity} />
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-100">
                      {rec.anomalyScore.toFixed(4)}
                    </td>
                    <td className="py-3 px-4">
                      <ReviewStatusText status={rec.reviewStatus} />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDetailRecord(rec)}
                          aria-label={`View details for ${rec.id}`}
                          className="p-1.5 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenLocalization(rec)}
                          aria-label={`Open localization for ${rec.id}`}
                          className="p-1.5 text-slate-400 hover:text-cyan-300 rounded hover:bg-slate-800 transition-colors"
                        >
                          <Crosshair className="w-4 h-4" />
                        </button>
                        <a
                          href={getReportDownloadUrl(rec.id)}
                          download
                          aria-label={`Download report for ${rec.id}`}
                          className="p-1.5 text-slate-400 hover:text-blue-400 rounded hover:bg-slate-800 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDelete(rec.id)}
                          aria-label={`Delete ${rec.id}`}
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspection Detail Dialog */}
      {detailRecord && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
        >
          <div className="bg-[#0F1624] border border-slate-700 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 id="detail-modal-title" className="text-lg font-semibold text-slate-100">
                  Inspection {detailRecord.id}
                </h2>
                <p className="text-xs font-mono text-slate-400 mt-1">
                  {detailRecord.category} · {detailRecord.originalFilename} ·{' '}
                  {formatTimestamp(detailRecord.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailRecord(null)}
                aria-label="Close inspection details"
                className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <p className="text-xs text-slate-400">Original</p>
                <div className="aspect-square rounded-lg overflow-hidden border border-slate-800 bg-[#070B14]">
                  <img
                    src={detailRecord.originalUrl}
                    alt="Original"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-slate-400">Anomaly Heatmap</p>
                <div className="aspect-square rounded-lg overflow-hidden border border-slate-800 bg-[#070B14]">
                  <img
                    src={detailRecord.heatmapUrl}
                    alt="Anomaly Heatmap"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-400">Defect Localization</p>
                  <div className="inline-flex items-center p-0.5 rounded bg-[#070B14] border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setMarkerShape('rectangle')}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
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
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        markerShape === 'circle'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      Circle
                    </button>
                  </div>
                </div>
                <div className="aspect-square rounded-lg overflow-hidden border border-slate-800 bg-[#070B14]">
                  <DefectOverlayImage
                    originalUrl={detailRecord.originalUrl}
                    heatmapUrl={detailRecord.heatmapUrl}
                    imageWidth={detailRecord.imageWidth}
                    imageHeight={detailRecord.imageHeight}
                    regions={detailRecord.regions}
                    prediction={detailRecord.prediction}
                    markerShape={markerShape}
                    showLabels={detailRecord.regions.some((r) => Boolean(r.label))}
                    alt="Localization Overlay"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-2 border-t border-slate-800">
              <div>
                <p className="text-slate-400 mb-1">Verdict</p>
                <PredictionStatus outcome={detailRecord.prediction} />
              </div>
              <div>
                <p className="text-slate-400 mb-1">Anomaly Score</p>
                <p className="font-mono text-sm text-slate-100 tabular-nums">
                  {detailRecord.anomalyScore.toFixed(4)}
                </p>
              </div>
              <div>
                <p className="text-slate-400 mb-1">Severity / Area</p>
                <p className="text-slate-200">
                  {detailRecord.severity} ({detailRecord.affectedAreaPct.toFixed(2)}%)
                </p>
              </div>
              <div>
                <p className="text-slate-400 mb-1">Distribution Shift</p>
                <DriftStatusText status={detailRecord.driftStatus} />
              </div>
            </div>

            {detailRecord.reviewNotes && (
              <div className="p-3.5 rounded-lg bg-[#070B14] border border-slate-800 text-xs text-slate-300">
                <span className="text-slate-400 font-medium">Reviewer Notes: </span>
                {detailRecord.reviewNotes}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  const rec = detailRecord;
                  setDetailRecord(null);
                  onOpenLocalization(rec);
                }}
                className="px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
              >
                Open Localization Viewer
              </button>
              <a
                href={getReportDownloadUrl(detailRecord.id)}
                download
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap"
              >
                Download JSON Report
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
