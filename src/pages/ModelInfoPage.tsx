import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CheckCircle2, Cpu, Loader2, Play, Upload } from 'lucide-react';
import type { ModelVersionInfo } from '../types/prometheus';
import {
  extractErrorMessage,
  fetchModelInfo,
  runCategoryEvaluation,
  trainCategoryBaseline,
} from '../services/api';
import { formatTimestamp } from '../components/StatusText';

export function ModelInfoPage() {
  const [models, setModels] = useState<ModelVersionInfo[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Metal Nut');
  const [trainArch, setTrainArch] = useState<'PatchCore-MultiScale' | 'EfficientAD-Lite'>(
    'PatchCore-MultiScale'
  );
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<'train' | 'evaluate' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchModelInfo();
      setModels(res.models);
      setError(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const activeModel = models.find((m) => m.category === selectedCategory) || models[0] || null;

  const handleFilePick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadFiles(files);
  };

  const handleTrain = async () => {
    setBusyAction('train');
    setError(null);
    setStatusMessage(null);
    try {
      const res = await trainCategoryBaseline({
        category: selectedCategory,
        architecture: trainArch,
        files: uploadFiles.length > 0 ? uploadFiles : undefined,
      });
      setStatusMessage(res.message);
      setUploadFiles([]);
      await loadModels();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleEvaluate = async () => {
    setBusyAction('evaluate');
    setError(null);
    setStatusMessage(null);
    try {
      const res = await runCategoryEvaluation(selectedCategory);
      setStatusMessage(res.message);
      await loadModels();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  if (loading) {
    return <div className="h-96 rounded-xl bg-[#0F1624] border border-slate-800 animate-pulse" />;
  }

  const metrics = activeModel?.evaluationMetrics ?? null;

  return (
    <div className="space-y-6">
      {/* Scope & Generalization Transparency Notice */}
      <div className="p-4 rounded-xl bg-[#0F1624] border border-slate-800 text-xs text-slate-300 leading-relaxed">
        <strong className="text-slate-100 font-medium">Evaluation Transparency:</strong>{' '}
        PROMETHEUS-X reports benchmark metrics (AUROC, Average Precision, F1, Pixel AUROC, and
        Expected Calibration Error) strictly after executing the real evaluation pipeline on
        held-out images. Unseen defect evaluation demonstrates deviation sensitivity relative to
        learned normal patterns and does not constitute a guarantee against every possible
        real-world failure mode.
      </div>

      {statusMessage && (
        <div role="status" className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{statusMessage}</span>
        </div>
      )}
      {error && (
        <div role="alert" className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200">
          {error}
        </div>
      )}

      {/* Top Grid: Selected Category Model Specification + Training & Calibration Runner */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 p-6 rounded-xl bg-[#0F1624] border border-slate-800 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Model Specification</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Inspect trained checkpoint parameters and held-out calibration state
              </p>
            </div>
            <select
              aria-label="Select category model"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            >
              {models.map((m) => (
                <option key={m.category} value={m.category}>
                  {m.category} ({m.trainingStatus === 'TRAINED' ? 'Trained' : 'Untrained'})
                </option>
              ))}
            </select>
          </div>

          {activeModel && (
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 pt-3 border-t border-slate-800 text-sm">
              <div>
                <dt className="text-xs text-slate-400 mb-0.5">Model Name</dt>
                <dd className="font-medium text-slate-100">{activeModel.modelName}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400 mb-0.5">Architecture</dt>
                <dd className="text-slate-200">{activeModel.architecture}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400 mb-0.5">Model Version</dt>
                <dd className="font-mono text-cyan-300">v{activeModel.version}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400 mb-0.5">Dataset Used</dt>
                <dd className="text-slate-200 text-xs">{activeModel.datasetName}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400 mb-0.5">Input Image Size</dt>
                <dd className="font-mono tabular-nums text-slate-200">
                  {activeModel.inputSize}×{activeModel.inputSize}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400 mb-0.5">Coreset Memory Bank</dt>
                <dd className="font-mono tabular-nums text-slate-200">
                  {activeModel.coresetSize} prototypes
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400 mb-0.5">Training Status</dt>
                <dd
                  className={
                    activeModel.trainingStatus === 'TRAINED'
                      ? 'text-emerald-400 font-medium'
                      : 'text-amber-400 font-medium'
                  }
                >
                  {activeModel.trainingStatus === 'TRAINED'
                    ? `Trained (${activeModel.trainingImageCount} normal samples)`
                    : 'Not trained yet'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400 mb-0.5">Calibration Status</dt>
                <dd
                  className={
                    activeModel.calibrationStatus === 'CALIBRATED'
                      ? 'text-cyan-400 font-medium'
                      : 'text-slate-400'
                  }
                >
                  {activeModel.calibrationStatus === 'CALIBRATED'
                    ? 'Platt Calibrated'
                    : 'Uncalibrated'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400 mb-0.5">Training Date</dt>
                <dd className="font-mono text-xs text-slate-300">
                  {formatTimestamp(activeModel.trainedAt)}
                </dd>
              </div>
            </dl>
          )}
        </section>

        {/* Training & Evaluation Controls */}
        <section className="lg:col-span-5 p-6 rounded-xl bg-[#0F1624] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-100">
              Train & Evaluate ({selectedCategory})
            </h2>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Build a normal-pattern coreset memory bank from uploaded defect-free images (or the
            built-in reference image for Metal Nut and Transistor), then run held-out evaluation
            and Platt calibration.
          </p>

          <div>
            <label htmlFor="train-arch" className="block text-xs font-medium text-slate-300 mb-1">
              Model Architecture
            </label>
            <select
              id="train-arch"
              value={trainArch}
              onChange={(e) =>
                setTrainArch(e.target.value as 'PatchCore-MultiScale' | 'EfficientAD-Lite')
              }
              className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
            >
              <option value="PatchCore-MultiScale">PatchCore-MultiScale (Primary Coreset)</option>
              <option value="EfficientAD-Lite">EfficientAD-Lite (Compact Fast Coreset)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="normal-upload"
              className="block text-xs font-medium text-slate-300 mb-1"
            >
              Optional Custom Normal Training Images (JPG/PNG)
            </label>
            <label
              htmlFor="normal-upload"
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-slate-700 bg-[#070B14] text-xs text-slate-300 hover:border-slate-500 cursor-pointer transition-colors"
            >
              <Upload className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
              <span>
                {uploadFiles.length > 0
                  ? `${uploadFiles.length} normal image(s) queued for training`
                  : 'Upload normal baseline photos (optional for Metal Nut / Transistor)'}
              </span>
            </label>
            <input
              id="normal-upload"
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              onChange={handleFilePick}
              className="sr-only"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleTrain}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
            >
              {busyAction === 'train' ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <Play className="w-4 h-4 shrink-0" />
              )}
              <span>Train Normal Baseline</span>
            </button>

            <button
              type="button"
              disabled={busyAction !== null || activeModel?.trainingStatus !== 'TRAINED'}
              onClick={handleEvaluate}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              {busyAction === 'evaluate' ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-cyan-400" />
              )}
              <span>Run Evaluation & Calibration</span>
            </button>
          </div>
        </section>
      </div>

      {/* Real Evaluation Metrics & Reliability Diagram */}
      <section className="p-6 rounded-xl bg-[#0F1624] border border-slate-800 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Held-Out Evaluation & Calibration Reliability ({selectedCategory})
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Measured strictly by running the trained checkpoint against held-out validation splits
            </p>
          </div>
          {metrics && (
            <span className="text-xs font-mono text-slate-400">
              Evaluated on {metrics.sampleCount} samples ({metrics.normalCount} normal /{' '}
              {metrics.anomalyCount} unseen anomaly) · {formatTimestamp(metrics.evaluatedAt)}
            </span>
          )}
        </div>

        {!metrics ? (
          <div className="p-8 rounded-lg bg-[#070B14] border border-slate-800 text-center text-xs text-slate-400">
            No evaluation results recorded for {selectedCategory} yet. Click{' '}
            <strong className="text-slate-200 font-medium">Run Evaluation & Calibration</strong>{' '}
            above to compute genuine Image AUROC, Average Precision, F1-Score, Pixel AUROC, and
            Expected Calibration Error (ECE).
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-5 grid grid-cols-2 gap-4">
              {[
                { label: 'Image AUROC', val: metrics.imageAuroc.toFixed(4) },
                { label: 'Average Precision (AP)', val: metrics.imageAp.toFixed(4) },
                {
                  label: `F1 @ τ=${metrics.operatingThreshold}`,
                  val: metrics.f1AtThreshold.toFixed(4),
                },
                { label: 'Pixel-Level AUROC', val: metrics.pixelAuroc.toFixed(4) },
                { label: 'Pixel-Level AP', val: metrics.pixelAp.toFixed(4) },
                { label: 'Expected Calibration Error', val: metrics.ece.toFixed(4) },
              ].map((m) => (
                <div key={m.label} className="p-4 rounded-lg bg-[#070B14] border border-slate-800">
                  <p className="text-xs text-slate-400 mb-1">{m.label}</p>
                  <p className="text-xl font-mono font-semibold tabular-nums text-cyan-300">
                    {m.val}
                  </p>
                </div>
              ))}
            </div>

            <div className="lg:col-span-7">
              <p className="text-xs font-medium text-slate-300 mb-3">
                Calibration Reliability Diagram (Predicted Confidence vs Empirical Defect Rate)
              </p>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.reliabilityBins}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis dataKey="rangeLabel" stroke="#94A3B8" fontSize={10} />
                    <YAxis stroke="#94A3B8" fontSize={11} domain={[0, 1]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0B111E',
                        borderColor: '#1E293B',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar
                      dataKey="avgConfidence"
                      name="Mean Predicted Prob."
                      fill="#3B82F6"
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="empiricalAccuracy"
                      name="Empirical Frequency"
                      fill="#06B6D4"
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* All 15 MVTec AD Categories Registry */}
      <section className="rounded-xl bg-[#0F1624] border border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-slate-100">
            MVTec AD Category Checkpoint Registry
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0B111E] text-slate-400">
                <th className="py-3 px-4 font-medium">Category</th>
                <th className="py-3 px-4 font-medium">Architecture</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">Calibration</th>
                <th className="py-3 px-4 font-medium text-right">Coreset</th>
                <th className="py-3 px-4 font-medium text-right">Image AUROC</th>
                <th className="py-3 px-4 font-medium text-right">ECE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {models.map((m) => (
                <tr
                  key={m.category}
                  onClick={() => setSelectedCategory(m.category)}
                  className={`cursor-pointer transition-colors ${
                    m.category === selectedCategory
                      ? 'bg-blue-600/10'
                      : 'hover:bg-slate-800/35'
                  }`}
                >
                  <td className="py-2.5 px-4 font-medium text-slate-200">{m.category}</td>
                  <td className="py-2.5 px-4 text-slate-400">{m.architecture}</td>
                  <td className="py-2.5 px-4">
                    <span
                      className={
                        m.trainingStatus === 'TRAINED' ? 'text-emerald-400' : 'text-slate-500'
                      }
                    >
                      {m.trainingStatus === 'TRAINED' ? 'Trained' : 'Zero-shot fallback'}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span
                      className={
                        m.calibrationStatus === 'CALIBRATED' ? 'text-cyan-400' : 'text-slate-500'
                      }
                    >
                      {m.calibrationStatus === 'CALIBRATED' ? 'Calibrated' : 'Uncalibrated'}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-300">
                    {m.coresetSize}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200">
                    {m.evaluationMetrics ? m.evaluationMetrics.imageAuroc.toFixed(4) : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200">
                    {m.evaluationMetrics ? m.evaluationMetrics.ece.toFixed(4) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
