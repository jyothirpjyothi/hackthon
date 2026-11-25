import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, ScanSearch } from 'lucide-react';
import { extractErrorMessage, fetchAnalyticsOverview } from '../services/api';
import type { AnalyticsOverview } from '../types/prometheus';
import type { AppPage } from '../components/Layout';

interface DashboardPageProps {
  onNavigate: (page: AppPage) => void;
}

const CHART_GRID = '#1E293B';
const CHART_AXIS = '#94A3B8';

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchAnalyticsOverview()
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
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-[#0F1624] border border-slate-800 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 rounded-xl bg-[#0F1624] border border-slate-800 animate-pulse" />
          <div className="h-72 rounded-xl bg-[#0F1624] border border-slate-800 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl bg-[#0F1624] border border-rose-500/40 text-sm text-rose-300">
        Failed to load dashboard metrics: {error}
      </div>
    );
  }

  const overview = data!;

  // Informative Empty State when no inspections have been recorded yet
  if (overview.totalInspected === 0) {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {[
            { label: 'Total Inspected', value: '0' },
            { label: 'Normal Products', value: '0' },
            { label: 'Anomalies Detected', value: '0' },
            { label: 'High Severity Defects', value: '0' },
            { label: 'False Positive Rate', value: '0.0%' },
            { label: 'Distribution Shift Alerts', value: '0' },
          ].map((kpi) => (
            <div key={kpi.label} className="p-4 rounded-xl bg-[#0F1624] border border-slate-800">
              <p className="text-xs text-slate-400 mb-2">{kpi.label}</p>
              <p className="text-2xl font-mono font-semibold tabular-nums text-slate-300">
                {kpi.value}
              </p>
            </div>
          ))}
        </div>

        <div className="p-10 sm:p-14 rounded-xl bg-[#0F1624] border border-slate-800 text-center max-w-2xl mx-auto">
          <div className="w-12 h-12 rounded-xl bg-blue-600/15 text-cyan-400 flex items-center justify-center mx-auto mb-5">
            <ScanSearch className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-semibold text-slate-100 mb-2">
            No inspections recorded yet
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed mb-6">
            All PROMETHEUS-X metrics and charts are computed strictly from real database inspection
            records—never fabricated statistics. Run your first AI inspection to populate live
            telemetry, severity breakdowns, and drift history.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('studio')}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap"
          >
            <span>Run First Inspection</span>
            <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  const outcomeData = [
    { name: 'Normal (PASS)', value: overview.normalCount, color: '#10B981' },
    { name: 'Anomalous (DEFECT)', value: overview.anomaliesDetected, color: '#EF4444' },
    { name: 'Uncertain (REVIEW)', value: overview.reviewRequiredCount, color: '#F59E0B' },
  ].filter((d) => d.value > 0);

  const severityColors: Record<string, string> = {
    LOW: '#06B6D4',
    MEDIUM: '#F59E0B',
    HIGH: '#EF4444',
  };

  return (
    <div className="space-y-6">
      {/* 6 Required KPI Metrics from real SQLite records */}
      <section aria-label="Key inspection metrics" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="p-4 rounded-xl bg-[#0F1624] border border-slate-800">
          <p className="text-xs text-slate-400 mb-1.5">Total Products Inspected</p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-slate-50">
            {overview.totalInspected}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#0F1624] border border-slate-800">
          <p className="text-xs text-slate-400 mb-1.5">Normal Products</p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-emerald-400">
            {overview.normalCount}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#0F1624] border border-slate-800">
          <p className="text-xs text-slate-400 mb-1.5">Anomalies Detected</p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-rose-400">
            {overview.anomaliesDetected}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#0F1624] border border-slate-800">
          <p className="text-xs text-slate-400 mb-1.5">High Severity Defects</p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-rose-300">
            {overview.highSeverityCount}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#0F1624] border border-slate-800">
          <p className="text-xs text-slate-400 mb-1.5">False Positive Rate</p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-cyan-400">
            {overview.falsePositiveRate.toFixed(1)}%
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#0F1624] border border-slate-800">
          <p className="text-xs text-slate-400 mb-1.5">Distribution Shift Alerts</p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-amber-400">
            {overview.driftAlertsCount}
          </p>
        </div>
      </section>

      {/* Row 1 Charts: Activity Over Time + Normal vs Anomalous */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 p-6 rounded-xl bg-[#0F1624] border border-slate-800">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-100">Inspection Activity Over Time</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live database volume grouped chronologically across normal, defect, and review outcomes
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={overview.trends}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="bucket" stroke={CHART_AXIS} fontSize={11} />
                <YAxis stroke={CHART_AXIS} fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0B111E',
                    borderColor: '#1E293B',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area
                  type="monotone"
                  dataKey="normal"
                  name="Normal"
                  stackId="1"
                  stroke="#10B981"
                  fill="#10B981"
                  fillOpacity={0.25}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="defect"
                  name="Anomalous"
                  stackId="1"
                  stroke="#EF4444"
                  fill="#EF4444"
                  fillOpacity={0.3}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="review"
                  name="Review"
                  stackId="1"
                  stroke="#F59E0B"
                  fill="#F59E0B"
                  fillOpacity={0.25}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 p-6 rounded-xl bg-[#0F1624] border border-slate-800">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-100">Normal vs Anomalous</h2>
            <p className="text-xs text-slate-400 mt-0.5">Distribution of inspection verdicts</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={outcomeData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={3}
                  isAnimationActive={false}
                >
                  {outcomeData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0B111E',
                    borderColor: '#1E293B',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2 Charts: Severity Distribution + False-Positive Trends + Category Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="p-6 rounded-xl bg-[#0F1624] border border-slate-800">
          <h2 className="text-base font-semibold text-slate-100 mb-1">Severity Distribution</h2>
          <p className="text-xs text-slate-400 mb-4">Estimated visual severity tiers</p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overview.severityStats}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="severity" stroke={CHART_AXIS} fontSize={11} />
                <YAxis stroke={CHART_AXIS} fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0B111E',
                    borderColor: '#1E293B',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" name="Inspections" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {overview.severityStats.map((entry) => (
                    <Cell key={entry.severity} fill={severityColors[entry.severity] || '#3B82F6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-6 rounded-xl bg-[#0F1624] border border-slate-800">
          <h2 className="text-base font-semibold text-slate-100 mb-1">False-Positive Trends</h2>
          <p className="text-xs text-slate-400 mb-4">Human-marked false positives vs anomaly score</p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={overview.trends}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="bucket" stroke={CHART_AXIS} fontSize={11} />
                <YAxis stroke={CHART_AXIS} fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0B111E',
                    borderColor: '#1E293B',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="falsePositives"
                  name="False Positives"
                  stroke="#06B6D4"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="defect"
                  name="Flagged Defects"
                  stroke="#EF4444"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-6 rounded-xl bg-[#0F1624] border border-slate-800">
          <h2 className="text-base font-semibold text-slate-100 mb-1">Product Category Statistics</h2>
          <p className="text-xs text-slate-400 mb-4">Inspected count and mean anomaly score</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 font-medium text-right">Total</th>
                  <th className="pb-2 font-medium text-right">Defects</th>
                  <th className="pb-2 font-medium text-right">Avg Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {overview.categoryStats.map((cat) => (
                  <tr key={cat.category}>
                    <td className="py-2.5 text-slate-200 font-medium">{cat.category}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-slate-300">
                      {cat.total}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-rose-400">
                      {cat.defect}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-cyan-300">
                      {cat.avgScore.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
