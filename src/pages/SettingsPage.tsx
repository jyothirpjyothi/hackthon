import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, RotateCcw, Save } from 'lucide-react';
import type { SystemSettings } from '../types/prometheus';
import {
  extractErrorMessage,
  fetchSettings,
  updateSettings,
} from '../services/api';

const DEFAULT_RESET: SystemSettings = {
  anomalyThreshold: 0.48,
  uncertaintyMargin: 0.08,
  maskThreshold: 0.45,
  severityLowMaxAreaPct: 1.5,
  severityMediumMaxAreaPct: 5.5,
  severityLowMaxIntensity: 0.62,
  severityMediumMaxIntensity: 0.80,
  calibrationEnabled: true,
  minConfidenceFloor: 0.62,
  driftWarningThreshold: 2.2,
  driftCriticalThreshold: 3.6,
  inputImageSize: 256,
  gaussianSigma: 2.2,
  normalizationMode: 'standard',
  architecture: 'PatchCore-MultiScale',
  coresetRatio: 0.25,
  datasetPathLabel: 'datasets/mvtec_ad',
};

export function SettingsPage() {
  const [form, setForm] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings()
      .then((s) => setForm(s))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setSavedMsg(null);

    // Client-side validation mirroring server rules
    if (form.anomalyThreshold < 0.05 || form.anomalyThreshold > 0.95) {
      setError('Anomaly threshold must be between 0.05 and 0.95.');
      return;
    }
    if (form.severityLowMaxAreaPct >= form.severityMediumMaxAreaPct) {
      setError('Low severity area cutoff must be strictly less than medium severity area cutoff.');
      return;
    }
    if (form.severityLowMaxIntensity >= form.severityMediumMaxIntensity) {
      setError('Low severity intensity cutoff must be strictly less than medium severity intensity cutoff.');
      return;
    }
    if (form.driftWarningThreshold >= form.driftCriticalThreshold) {
      setError('Distribution shift warning threshold must be strictly less than critical threshold.');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateSettings(form);
      setForm(updated);
      setSavedMsg('System configuration validated and saved to database.');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) {
    return <div className="h-96 rounded-xl bg-[#0F1624] border border-slate-800 animate-pulse" />;
  }

  const setNum = (key: keyof SystemSettings, raw: string) => {
    const val = Number(raw);
    if (!Number.isNaN(val)) {
      setForm((prev) => (prev ? { ...prev, [key]: val } : prev));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {savedMsg && (
        <div role="status" className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{savedMsg}</span>
        </div>
      )}
      {error && (
        <div role="alert" className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200">
          {error}
        </div>
      )}

      {/* 1. Anomaly & Uncertainty Thresholds */}
      <section className="p-6 rounded-xl bg-[#0F1624] border border-slate-800 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Anomaly Decision Thresholds</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Controls PASS / DEFECT / REVIEW classification and binary defect mask cutoff
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <label htmlFor="anomaly-threshold" className="block text-xs font-medium text-slate-300 mb-1.5">
              Anomaly Operating Threshold (0.05 – 0.95)
            </label>
            <input
              id="anomaly-threshold"
              type="number"
              step="0.01"
              min="0.05"
              max="0.95"
              value={form.anomalyThreshold}
              onChange={(e) => setNum('anomalyThreshold', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 font-mono text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label htmlFor="uncertainty-margin" className="block text-xs font-medium text-slate-300 mb-1.5">
              Review Uncertainty Margin (±)
            </label>
            <input
              id="uncertainty-margin"
              type="number"
              step="0.01"
              min="0.01"
              max="0.25"
              value={form.uncertaintyMargin}
              onChange={(e) => setNum('uncertaintyMargin', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 font-mono text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label htmlFor="mask-threshold" className="block text-xs font-medium text-slate-300 mb-1.5">
              Pixel Mask Threshold (0.10 – 0.95)
            </label>
            <input
              id="mask-threshold"
              type="number"
              step="0.01"
              min="0.10"
              max="0.95"
              value={form.maskThreshold}
              onChange={(e) => setNum('maskThreshold', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 font-mono text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>
      </section>

      {/* 2. Severity Estimation Thresholds */}
      <section className="p-6 rounded-xl bg-[#0F1624] border border-slate-800 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Severity Estimation Thresholds</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Defines LOW, MEDIUM, and HIGH visual severity boundaries from affected surface area and
            peak anomaly intensity
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label htmlFor="sev-low-area" className="block text-xs font-medium text-slate-300 mb-1.5">
              Low Max Area (%)
            </label>
            <input
              id="sev-low-area"
              type="number"
              step="0.1"
              min="0.1"
              max="40"
              value={form.severityLowMaxAreaPct}
              onChange={(e) => setNum('severityLowMaxAreaPct', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 font-mono text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label htmlFor="sev-med-area" className="block text-xs font-medium text-slate-300 mb-1.5">
              Medium Max Area (%)
            </label>
            <input
              id="sev-med-area"
              type="number"
              step="0.1"
              min="0.2"
              max="80"
              value={form.severityMediumMaxAreaPct}
              onChange={(e) => setNum('severityMediumMaxAreaPct', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 font-mono text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label htmlFor="sev-low-int" className="block text-xs font-medium text-slate-300 mb-1.5">
              Low Max Peak Intensity
            </label>
            <input
              id="sev-low-int"
              type="number"
              step="0.01"
              min="0.15"
              max="0.95"
              value={form.severityLowMaxIntensity}
              onChange={(e) => setNum('severityLowMaxIntensity', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 font-mono text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label htmlFor="sev-med-int" className="block text-xs font-medium text-slate-300 mb-1.5">
              Medium Max Peak Intensity
            </label>
            <input
              id="sev-med-int"
              type="number"
              step="0.01"
              min="0.2"
              max="0.99"
              value={form.severityMediumMaxIntensity}
              onChange={(e) => setNum('severityMediumMaxIntensity', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 font-mono text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>
      </section>

      {/* 3. Confidence Calibration & Distribution Shift */}
      <section className="p-6 rounded-xl bg-[#0F1624] border border-slate-800 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Confidence Calibration & Distribution Shift
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Controls Platt calibration gating and Mahalanobis drift alert limits
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div className="flex items-center gap-2.5 pb-2">
            <input
              id="cal-enabled"
              type="checkbox"
              checked={form.calibrationEnabled}
              onChange={(e) => setForm({ ...form, calibrationEnabled: e.target.checked })}
              className="w-4 h-4 accent-cyan-400 rounded"
            />
            <label htmlFor="cal-enabled" className="text-xs font-medium text-slate-200">
              Enable Platt Calibration
            </label>
          </div>

          <div>
            <label htmlFor="min-conf" className="block text-xs font-medium text-slate-300 mb-1.5">
              Min Confidence Floor
            </label>
            <input
              id="min-conf"
              type="number"
              step="0.01"
              min="0.50"
              max="0.98"
              value={form.minConfidenceFloor}
              onChange={(e) => setNum('minConfidenceFloor', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 font-mono text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label htmlFor="drift-warn" className="block text-xs font-medium text-slate-300 mb-1.5">
              Drift Warning Threshold (σ)
            </label>
            <input
              id="drift-warn"
              type="number"
              step="0.1"
              min="0.6"
              max="10"
              value={form.driftWarningThreshold}
              onChange={(e) => setNum('driftWarningThreshold', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 font-mono text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label htmlFor="drift-crit" className="block text-xs font-medium text-slate-300 mb-1.5">
              Drift Critical Threshold (σ)
            </label>
            <input
              id="drift-crit"
              type="number"
              step="0.1"
              min="1.0"
              max="15"
              value={form.driftCriticalThreshold}
              onChange={(e) => setNum('driftCriticalThreshold', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 font-mono text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>
      </section>

      {/* 4. Image Preprocessing, Dataset & Model Configuration */}
      <section className="p-6 rounded-xl bg-[#0F1624] border border-slate-800 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Preprocessing, Dataset & Model Configuration
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configures tensor dimensions, heatmap smoothing, coreset sampling, and dataset directory
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label htmlFor="input-size" className="block text-xs font-medium text-slate-300 mb-1.5">
              Input Resolution (px)
            </label>
            <select
              id="input-size"
              value={form.inputImageSize}
              onChange={(e) =>
                setForm({
                  ...form,
                  inputImageSize: Number(e.target.value) as 128 | 256 | 384,
                })
              }
              className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 font-mono text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            >
              <option value={128}>128 × 128</option>
              <option value={256}>256 × 256</option>
              <option value={384}>384 × 384</option>
            </select>
          </div>

          <div>
            <label htmlFor="gauss-sigma" className="block text-xs font-medium text-slate-300 mb-1.5">
              Heatmap Gaussian Sigma
            </label>
            <input
              id="gauss-sigma"
              type="number"
              step="0.1"
              min="0"
              max="6"
              value={form.gaussianSigma}
              onChange={(e) => setNum('gaussianSigma', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 font-mono text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label htmlFor="arch-select" className="block text-xs font-medium text-slate-300 mb-1.5">
              Default Architecture
            </label>
            <select
              id="arch-select"
              value={form.architecture}
              onChange={(e) =>
                setForm({
                  ...form,
                  architecture: e.target.value as 'PatchCore-MultiScale' | 'EfficientAD-Lite',
                })
              }
              className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
            >
              <option value="PatchCore-MultiScale">PatchCore-MultiScale</option>
              <option value="EfficientAD-Lite">EfficientAD-Lite</option>
            </select>
          </div>

          <div>
            <label htmlFor="coreset-ratio" className="block text-xs font-medium text-slate-300 mb-1.5">
              Coreset Subsampling Ratio
            </label>
            <input
              id="coreset-ratio"
              type="number"
              step="0.05"
              min="0.05"
              max="0.80"
              value={form.coresetRatio}
              onChange={(e) => setNum('coresetRatio', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 font-mono text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        <div>
          <label htmlFor="dataset-label" className="block text-xs font-medium text-slate-300 mb-1.5">
            Dataset Configuration Reference
          </label>
          <input
            id="dataset-label"
            type="text"
            value={form.datasetPathLabel}
            onChange={(e) => setForm({ ...form, datasetPathLabel: e.target.value })}
            className="w-full max-w-md px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
          />
        </div>
      </section>

      {/* Save / Reset Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <button
          type="button"
          onClick={() => {
            setForm(DEFAULT_RESET);
            setSavedMsg(null);
            setError(null);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-300 border border-slate-700 hover:border-slate-500 rounded-lg transition-colors whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Reset Defaults</span>
        </button>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
        >
          <Save className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{saving ? 'Saving Settings...' : 'Save Settings'}</span>
        </button>
      </div>
    </form>
  );
}
