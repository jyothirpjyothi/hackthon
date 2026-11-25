import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, ScanSearch } from 'lucide-react';
import {
  extractErrorMessage,
  fetchAnalyticsOverview,
  fetchDriftStatus,
} from '../services/api';
import type { AnalyticsOverview, DriftStatusResponse } from '../types/prometheus';
import type { AppPage } from '../components/Layout';

interface AnalyticsPageProps {
  onNavigate: (page: AppPage) => void;
}

export function AnalyticsPage({ onNavigate }: AnalyticsPageProps) {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [drift, setDrift] = useState<DriftStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchAnalyticsOverview(), fetchDriftStatus()])
      .then(([ov, dr]) => {
        if (!active) return;
        setOverview(ov);
        setDrift(dr);
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-72 rounded-xl bg-[#0F1624] border border-slate-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="p-6 rounded-xl bg-[#0F1624] border border-rose-500/40 text-sm text-rose-300">
        {error || 'Unable to load analytics.'}
      </div>
    );
  }

  if (overview.totalInspected === 0) {
    return (
      <div className="p-12 rounded-xl bg-[#0F1624] border border-slate-800 text-center max-w-xl mx-auto">
        <BarChart3 className="w-8 h-8 text-cyan-400 mx-auto mb-3" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-100 mb-2">No analytics data yet</h2>
        <p className="text-sm text-slate-400 mb-6">
          Analytics charts compute real detection rates, category breakdowns, false-positive
          statistics, and drift history directly from recorded SQLite inspections.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('studio')}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap"
        >
          <ScanSearch className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Run First Inspection</span>
        </button>
      </div>
    );
  }

  const fpBreakdown = [
    { label: 'Confirmed Defects', count: overview.confirmedDefectCount, color: '#EF4444' },
    { label: 'False Positives', count: overview.falsePositiveCount, color: '#06B6D4' },
    { label: 'Human Reviewed', count: overview.humanReviewedCount, color: '#10B981' },
    { label: 'Review Required', count: overview.reviewRequiredCount, color: '#F59E0B' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Analytical Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl bg-[#0F1624] border border-slate-800">
          <p className="text-xs text-slate-400 mb-1">Total Inspected</p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-slate-50">
            {overview.totalInspected}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-[#0F1624] border border-slate-800">
          <p className="text-xs text-slate-400 mb-1">Defect Detection Rate</p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-rose-400">
            {overview.defectDetectionRate.toFixed(1)}%
          </p>
        </div>
        <div className="p-4 rounded-xl bg-[#0F1624] border border-slate-800">
          <p className="text-xs text-slate-400 mb-1">Confirmed Defects</p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-slate-100">
            {overview.confirmedDefectCount}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-[#0F1624] border border-slate-800">
          <p className="text-xs text-slate-400 mb-1">False Positive Rate</p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-cyan-400">
            {overview.falsePositiveRate.toFixed(1)}%
          </p>
        </div>
        <div className="p-4 rounded-xl bg-[#0F1624] border border-slate-800">
          <p className="text-xs text-slate-400 mb-1">Drift Events Logged</p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-amber-400">
            {overview.driftAlertsCount}
          </p>
        </div>
      </div>

      {/* Category-wise Defect Distribution + False-Positive Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl bg-[#0F1624] border border-slate-800">
          <h2 className="text-base font-semibold text-slate-100 mb-1">
            Category-Wise Defect Distribution
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Normal, anomalous, and review outcomes segmented by product category
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overview.categoryStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="category" stroke="#94A3B8" fontSize={11} />
                <YAxis stroke="#94A3B8" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0B111E',
                    borderColor: '#1E293B',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="normal" name="Normal" fill="#10B981" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="defect" name="Defect" fill="#EF4444" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="review" name="Review" fill="#F59E0B" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-6 rounded-xl bg-[#0F1624] border border-slate-800">
          <h2 className="text-base font-semibold text-slate-100 mb-1">
            False-Positive & Human Review Breakdown
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Human-in-the-loop verification outcomes recorded in review_decisions
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fpBreakdown} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis type="number" stroke="#94A3B8" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="label" stroke="#94A3B8" fontSize={11} width={115} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0B111E',
                    borderColor: '#1E293B',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" name="Records" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {fpBreakdown.map((item) => (
                    <Cell key={item.label} fill={item.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Inspection Score Trend + Distribution Shift History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl bg-[#0F1624] border border-slate-800">
          <h2 className="text-base font-semibold text-slate-100 mb-1">Mean Anomaly Score Trend</h2>
          <p className="text-xs text-slate-400 mb-4">Average anomaly intensity over inspection intervals</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={overview.trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="bucket" stroke="#94A3B8" fontSize={11} />
                <YAxis stroke="#94A3B8" fontSize={11} domain={[0, 1]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0B111E',
                    borderColor: '#1E293B',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="avgScore"
                  name="Mean Anomaly Score"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-6 rounded-xl bg-[#0F1624] border border-slate-800">
          <h2 className="text-base font-semibold text-slate-100 mb-1">Distribution Shift Trajectory</h2>
          <p className="text-xs text-slate-400 mb-4">
            Feature-space Mahalanobis distance across recent inspections
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={drift?.trajectory || []}>
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
                <Line
                  type="monotone"
                  dataKey="distance"
                  name="Drift Distance (σ)"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
