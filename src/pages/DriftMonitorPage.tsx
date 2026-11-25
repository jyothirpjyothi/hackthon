import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Info } from 'lucide-react';
import { MVTEC_CATEGORIES, type DriftStatusResponse } from '../types/prometheus';
import { extractErrorMessage, fetchDriftStatus } from '../services/api';
import { DriftStatusText, formatTimestamp } from '../components/StatusText';

export function DriftMonitorPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [data, setData] = useState<DriftStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchDriftStatus(selectedCategory)
      .then((res) => {
        if (active) {
          setData(res);
          setError(null);
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
  }, [selectedCategory]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-28 rounded-xl bg-[#0F1624] border border-slate-800 animate-pulse" />
        <div className="h-72 rounded-xl bg-[#0F1624] border border-slate-800 animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-xl bg-[#0F1624] border border-rose-500/40 text-sm text-rose-300">
        {error || 'Failed to load distribution shift telemetry.'}
      </div>
    );
  }

  const comparisonData = data.featureComparison.map((item) => ({
    label: item.label.replace(' Channel Balance', '').replace(' Energy', ''),
    reference: item.referenceMean,
    current: item.currentValue,
    zScore: item.zScore,
  }));

  return (
    <div className="space-y-6">
      {/* Important Scientific Caveat Banner */}
      <div className="p-4 rounded-xl bg-[#0F1624] border border-slate-800 flex items-start gap-3">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-slate-300 leading-relaxed">
          Distribution shift monitoring compares incoming image feature statistics (illumination,
          color balance, contrast, Sobel edge density, and high-frequency texture energy) against
          the category&apos;s normal training reference distribution.{' '}
          <strong className="text-slate-100 font-medium">
            A shift alert detects changes in input conditions (camera, lighting, resolution, or
            material) and does not automatically prove product defectiveness or model failure.
          </strong>
        </p>
      </div>

      {/* Current Status Strip + Category Filter */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-[#0F1624] border border-slate-800">
          <p className="text-xs text-slate-400 mb-2">Current Distribution Status</p>
          <DriftStatusText status={data.overallStatus} />
          <p className="text-xs font-mono text-slate-500 mt-2">
            Baseline category: {data.activeCategory}
          </p>
        </div>

        <div className="p-5 rounded-xl bg-[#0F1624] border border-slate-800">
          <p className="text-xs text-slate-400 mb-1.5">Latest Mahalanobis Drift</p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-slate-100">
            {data.latestDistance !== null ? `${data.latestDistance.toFixed(3)} σ` : '—'}
          </p>
          <p className="text-xs font-mono text-slate-500 mt-1 tabular-nums">
            Warn: {data.warningThreshold} σ · Critical: {data.criticalThreshold} σ
          </p>
        </div>

        <div className="p-5 rounded-xl bg-[#0F1624] border border-slate-800">
          <p className="text-xs text-slate-400 mb-1.5">Historical Shift Alerts</p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-amber-400">
            {data.totalAlerts}
          </p>
          <p className="text-xs text-slate-500 mt-1">Logged in drift_events table</p>
        </div>

        <div className="p-5 rounded-xl bg-[#0F1624] border border-slate-800 flex flex-col justify-between">
          <label htmlFor="drift-cat-select" className="text-xs text-slate-400 mb-2">
            Filter Baseline Category
          </label>
          <select
            id="drift-cat-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
          >
            <option value="ALL">Latest Inspected Category</option>
            {MVTEC_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Charts: Reference vs Current Distribution + Drift Distance Trajectory */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl bg-[#0F1624] border border-slate-800">
          <h2 className="text-base font-semibold text-slate-100 mb-1">
            Reference vs Current Feature Statistics
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Global embedding channels from the latest inspection against trained normal baseline
          </p>

          {comparisonData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-slate-500">
              Run an inspection to compare live feature statistics against the reference baseline.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis dataKey="label" stroke="#94A3B8" fontSize={10} interval={0} angle={-18} textAnchor="end" height={50} />
                  <YAxis stroke="#94A3B8" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0B111E',
                      borderColor: '#1E293B',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="reference" name="Reference Baseline" fill="#3B82F6" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="current" name="Latest Inspection" fill="#06B6D4" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="p-6 rounded-xl bg-[#0F1624] border border-slate-800">
          <h2 className="text-base font-semibold text-slate-100 mb-1">
            Drift Distance History & Thresholds
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Standardized RMS feature distance across recent inspections
          </p>

          {data.trajectory.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-slate-500">
              No inspection drift measurements recorded yet.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.trajectory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis dataKey="inspectionId" stroke="#94A3B8" fontSize={11} />
                  <YAxis stroke="#94A3B8" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0B111E',
                      borderColor: '#1E293B',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <ReferenceLine
                    y={data.warningThreshold}
                    stroke="#F59E0B"
                    strokeDasharray="4 4"
                    label={{ value: 'Warn', fill: '#F59E0B', fontSize: 10, position: 'right' }}
                  />
                  <ReferenceLine
                    y={data.criticalThreshold}
                    stroke="#EF4444"
                    strokeDasharray="4 4"
                    label={{ value: 'Critical', fill: '#EF4444', fontSize: 10, position: 'right' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="distance"
                    name="Drift Distance (σ)"
                    stroke="#06B6D4"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Historical Drift Alerts Table */}
      <div className="rounded-xl bg-[#0F1624] border border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-slate-100">Historical Drift Alerts</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Inspections exceeding the configured distribution shift warning threshold
          </p>
        </div>

        {data.history.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No distribution shift alerts have been triggered. All recorded inspections remained
            within normal baseline imaging tolerances.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-[#0B111E] text-xs text-slate-400">
                  <th className="py-3 px-4 font-medium">Event ID</th>
                  <th className="py-3 px-4 font-medium">Inspection</th>
                  <th className="py-3 px-4 font-medium">Category</th>
                  <th className="py-3 px-4 font-medium">Shift Severity</th>
                  <th className="py-3 px-4 font-medium text-right">Drift Distance</th>
                  <th className="py-3 px-4 font-medium">Dominant Factor</th>
                  <th className="py-3 px-4 font-medium">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {data.history.map((ev) => (
                  <tr key={ev.id}>
                    <td className="py-3 px-4 font-mono text-xs text-slate-300">{ev.id}</td>
                    <td className="py-3 px-4 font-mono text-xs text-cyan-300">{ev.inspectionId}</td>
                    <td className="py-3 px-4 text-slate-200">{ev.category}</td>
                    <td className="py-3 px-4">
                      <DriftStatusText status={ev.driftStatus} />
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-300">
                      {ev.driftDistance.toFixed(3)} σ
                    </td>
                    <td className="py-3 px-4 text-slate-300 text-xs">{ev.dominantFactor}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-400">
                      {formatTimestamp(ev.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
