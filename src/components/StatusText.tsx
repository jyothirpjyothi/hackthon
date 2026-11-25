import { AlertTriangle, CheckCircle2, HelpCircle, ShieldAlert, XCircle } from 'lucide-react';
import type {
  DriftStatus,
  PredictionOutcome,
  ReviewStatus,
  SeverityLevel,
} from '../types/prometheus';

export function PredictionStatus({ outcome }: { outcome: PredictionOutcome }) {
  if (outcome === 'PASS') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 whitespace-nowrap">
        <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>PASS</span>
      </span>
    );
  }
  if (outcome === 'DEFECT') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-400 whitespace-nowrap">
        <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>DEFECT</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-400 whitespace-nowrap">
      <HelpCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>REVIEW</span>
    </span>
  );
}

export function SeverityText({ severity }: { severity: SeverityLevel }) {
  const map: Record<SeverityLevel, { label: string; cls: string }> = {
    NONE: { label: 'None', cls: 'text-slate-400' },
    LOW: { label: 'Low', cls: 'text-cyan-300' },
    MEDIUM: { label: 'Medium', cls: 'text-amber-400' },
    HIGH: { label: 'High', cls: 'text-rose-400 font-semibold' },
  };
  const cfg = map[severity] || map.NONE;
  return <span className={`text-sm whitespace-nowrap ${cfg.cls}`}>{cfg.label}</span>;
}

export function DriftStatusText({ status }: { status: DriftStatus }) {
  if (status === 'STABLE') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 whitespace-nowrap">
        <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Stable distribution</span>
      </span>
    );
  }
  if (status === 'POSSIBLE_SHIFT') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-400 whitespace-nowrap">
        <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Possible distribution shift</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-400 whitespace-nowrap">
      <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>Significant distribution shift</span>
    </span>
  );
}

export function ReviewStatusText({ status }: { status: ReviewStatus }) {
  const map: Record<ReviewStatus, { label: string; cls: string }> = {
    NOT_REQUIRED: { label: 'Auto-passed', cls: 'text-slate-400' },
    PENDING: { label: 'Pending review', cls: 'text-amber-400' },
    APPROVED_NORMAL: { label: 'Approved normal', cls: 'text-emerald-400' },
    CONFIRMED_DEFECT: { label: 'Confirmed defect', cls: 'text-rose-400' },
    FALSE_POSITIVE: { label: 'False positive', cls: 'text-cyan-400' },
  };
  const cfg = map[status] || map.NOT_REQUIRED;
  return <span className={`text-sm whitespace-nowrap ${cfg.cls}`}>{cfg.label}</span>;
}

export function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}
