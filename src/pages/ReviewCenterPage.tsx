import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Flag, ShieldCheck, XCircle } from 'lucide-react';
import type { InspectionRecord, MarkerShape } from '../types/prometheus';
import {
  extractErrorMessage,
  fetchReviewsQueue,
  submitReviewDecision,
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

interface ReviewCenterPageProps {
  onNavigate: (page: AppPage) => void;
  onReviewSubmitted: () => void;
}

export function ReviewCenterPage({
  onNavigate,
  onReviewSubmitted,
}: ReviewCenterPageProps) {
  const [tab, setTab] = useState<'pending' | 'reviewed'>('pending');
  const [pending, setPending] = useState<InspectionRecord[]>([]);
  const [reviewed, setReviewed] = useState<InspectionRecord[]>([]);
  const [summary, setSummary] = useState({
    totalInspected: 0,
    falsePositiveCount: 0,
    confirmedDefectCount: 0,
    humanReviewedCount: 0,
    reviewRequiredCount: 0,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [markerShape, setMarkerShape] = useState<MarkerShape>('rectangle');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchReviewsQueue();
      setPending(res.pending);
      setReviewed(res.reviewed);
      setSummary(res.summary);
      setError(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const activeList = tab === 'pending' ? pending : reviewed;
  const activeItem =
    activeList.find((item) => item.id === selectedId) || activeList[0] || null;

  useEffect(() => {
    setNotes(activeItem?.reviewNotes || '');
  }, [activeItem?.id, activeItem?.reviewNotes]);

  const handleDecision = async (
    decision: 'APPROVED_NORMAL' | 'CONFIRMED_DEFECT' | 'FALSE_POSITIVE'
  ) => {
    if (!activeItem) return;
    setSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      await submitReviewDecision(activeItem.id, decision, notes);
      setFeedback(`Saved human verification decision (${decision.replace('_', ' ')}) for ${activeItem.id}.`);
      setNotes('');
      await loadQueue();
      onReviewSubmitted();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* False-Positive Analytics Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl bg-[#0F1624] border border-slate-800">
          <p className="text-xs text-slate-400 mb-1">Total Inspections</p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-slate-50">
            {summary.totalInspected}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-[#0F1624] border border-slate-800">
          <p className="text-xs text-slate-400 mb-1">Review Required</p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-amber-400">
            {summary.reviewRequiredCount}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-[#0F1624] border border-slate-800">
          <p className="text-xs text-slate-400 mb-1">Human Reviewed</p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-emerald-400">
            {summary.humanReviewedCount}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-[#0F1624] border border-slate-800">
          <p className="text-xs text-slate-400 mb-1">Confirmed Defects</p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-rose-400">
            {summary.confirmedDefectCount}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-[#0F1624] border border-slate-800">
          <p className="text-xs text-slate-400 mb-1">False Positives</p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-cyan-400">
            {summary.falsePositiveCount}
          </p>
        </div>
      </div>

      {/* Queue Mode Toggle + Governance Notice */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="inline-flex items-center p-1 rounded-lg bg-[#0F1624] border border-slate-800 self-start">
          <button
            type="button"
            onClick={() => {
              setTab('pending');
              setSelectedId(null);
            }}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === 'pending'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Pending Review ({pending.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('reviewed');
              setSelectedId(null);
            }}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === 'reviewed'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Reviewed Archive ({reviewed.length})
          </button>
        </div>

        <p className="text-xs text-slate-400">
          Governance: Reviewer decisions are logged for audit and false-positive tracking; models are
          never auto-retrained from unverified labels.
        </p>
      </div>

      {feedback && (
        <div role="status" className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200">
          {feedback}
        </div>
      )}
      {error && (
        <div role="alert" className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200">
          {error}
        </div>
      )}

      {/* Split Review Workstation */}
      {loading ? (
        <div className="h-80 rounded-xl bg-[#0F1624] border border-slate-800 animate-pulse" />
      ) : activeList.length === 0 ? (
        <div className="p-12 rounded-xl bg-[#0F1624] border border-slate-800 text-center max-w-xl mx-auto">
          <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-100 mb-1.5">
            {tab === 'pending'
              ? 'No flagged inspections awaiting review'
              : 'No archived human review decisions yet'}
          </h2>
          <p className="text-xs text-slate-400 mb-5">
            {tab === 'pending'
              ? 'Inspections predicted as DEFECT or REVIEW appear here for quality engineer verification.'
              : 'Once a flagged specimen is approved, rejected, or marked false positive, it appears here.'}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('studio')}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap"
          >
            Inspect New Specimen
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Queue Column */}
          <div className="lg:col-span-4 rounded-xl bg-[#0F1624] border border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 text-xs font-medium text-slate-400">
              {tab === 'pending' ? 'Flagged Queue' : 'Reviewed Records'}
            </div>
            <div className="divide-y divide-slate-800/70 max-h-[600px] overflow-y-auto">
              {activeList.map((item) => {
                const isSelected = activeItem?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full text-left p-4 transition-colors flex items-center gap-3 ${
                      isSelected ? 'bg-blue-600/15' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <img
                      src={item.overlayUrl}
                      alt={item.id}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded object-cover border border-slate-700 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-cyan-300 truncate">{item.id}</span>
                        <span className="font-mono text-xs text-slate-300 tabular-nums">
                          {item.anomalyScore.toFixed(3)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 mt-0.5 truncate">{item.category}</p>
                      <div className="flex items-center gap-2 mt-1 text-[11px]">
                        <PredictionStatus outcome={item.prediction} />
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <ReviewStatusText status={item.reviewStatus} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Inspection Review Stage */}
          {activeItem && (
            <div className="lg:col-span-8 p-6 rounded-xl bg-[#0F1624] border border-slate-800 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-base font-semibold text-slate-100">
                    {activeItem.id} · {activeItem.category}
                  </h2>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">
                    {activeItem.originalFilename} · {formatTimestamp(activeItem.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <PredictionStatus outcome={activeItem.prediction} />
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <SeverityText severity={activeItem.severity} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <p className="text-xs text-slate-400">Original Image</p>
                  <div className="aspect-square rounded-lg overflow-hidden border border-slate-800 bg-[#070B14]">
                    <img
                      src={activeItem.originalUrl}
                      alt="Original Image"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-slate-400">Anomaly Heatmap</p>
                  <div className="aspect-square rounded-lg overflow-hidden border border-slate-800 bg-[#070B14]">
                    <img
                      src={activeItem.heatmapUrl}
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
                      originalUrl={activeItem.originalUrl}
                      heatmapUrl={activeItem.heatmapUrl}
                      imageWidth={activeItem.imageWidth}
                      imageHeight={activeItem.imageHeight}
                      regions={activeItem.regions}
                      prediction={activeItem.prediction}
                      markerShape={markerShape}
                      showLabels={activeItem.regions.some((r) => Boolean(r.label))}
                      alt="Defect Localization Overlay"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-2 border-t border-slate-800">
                <div>
                  <p className="text-slate-400 mb-0.5">Anomaly Score</p>
                  <p className="font-mono text-sm text-slate-100 tabular-nums">
                    {activeItem.anomalyScore.toFixed(4)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 mb-0.5">Affected Area</p>
                  <p className="font-mono text-sm text-slate-100 tabular-nums">
                    {activeItem.affectedAreaPct.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 mb-0.5">Calibration</p>
                  <p className="font-mono text-sm text-cyan-300 tabular-nums">
                    {activeItem.calibrationStatus === 'CALIBRATED' &&
                    activeItem.calibratedConfidence !== null
                      ? `${(activeItem.calibratedConfidence * 100).toFixed(1)}%`
                      : 'Uncalibrated'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 mb-0.5">Distribution Shift</p>
                  <DriftStatusText status={activeItem.driftStatus} />
                </div>
              </div>

              {/* Reviewer Notes & Action Controls */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <label htmlFor="reviewer-notes" className="block text-xs font-medium text-slate-300">
                  Quality Engineer Inspection Notes
                </label>
                <textarea
                  id="reviewer-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Record defect root cause, lighting artifacts, or false-positive justification..."
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#070B14] border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                />

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleDecision('CONFIRMED_DEFECT')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Reject (Confirm Defect)</span>
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleDecision('FALSE_POSITIVE')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-100 bg-slate-700 hover:bg-slate-600 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Flag className="w-4 h-4 shrink-0 text-cyan-400" aria-hidden="true" />
                    <span>Mark False Positive</span>
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleDecision('APPROVED_NORMAL')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Approve Normal Product</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
