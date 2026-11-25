import { useState, type ReactNode } from 'react';
import {
  Activity,
  BarChart3,
  Clock,
  Cpu,
  Crosshair,
  LayoutDashboard,
  Menu,
  ScanSearch,
  Settings,
  UserCheck,
  X,
} from 'lucide-react';

export type AppPage =
  | 'landing'
  | 'dashboard'
  | 'studio'
  | 'localization'
  | 'analytics'
  | 'history'
  | 'drift'
  | 'review'
  | 'model'
  | 'settings';

interface NavItem {
  id: Exclude<AppPage, 'landing'>;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'studio', label: 'AI Inspection Studio', icon: ScanSearch },
  { id: 'localization', label: 'Defect Localization', icon: Crosshair },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'history', label: 'Inspection History', icon: Clock },
  { id: 'drift', label: 'Distribution Shift', icon: Activity },
  { id: 'review', label: 'Human Review Center', icon: UserCheck },
  { id: 'model', label: 'Model Information', icon: Cpu },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const PAGE_TITLES: Record<Exclude<AppPage, 'landing'>, string> = {
  dashboard: 'Main Dashboard',
  studio: 'AI Inspection Studio',
  localization: 'Defect Localization',
  analytics: 'Analytics',
  history: 'Inspection History',
  drift: 'Distribution Shift Monitor',
  review: 'Human Review Center',
  model: 'Model Information',
  settings: 'Settings',
};

interface LayoutProps {
  currentPage: Exclude<AppPage, 'landing'>;
  onNavigate: (page: AppPage) => void;
  pendingReviewCount: number;
  children: ReactNode;
}

export function WorkspaceLayout({
  currentPage,
  onNavigate,
  pendingReviewCount,
  children,
}: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSelect = (page: AppPage) => {
    setMobileMenuOpen(false);
    onNavigate(page);
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-[#0B111E] border-r border-slate-800/80 sticky top-0 h-screen">
        <div className="h-16 px-6 flex items-center border-b border-slate-800/80">
          <button
            type="button"
            onClick={() => handleSelect('landing')}
            className="text-base font-bold tracking-tight text-slate-100 hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded"
          >
            PROMETHEUS-X
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto" aria-label="Workspace navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  active
                    ? 'bg-blue-600/15 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.id === 'review' && pendingReviewCount > 0 && (
                  <span className="font-mono tabular-nums text-xs text-amber-400 shrink-0">
                    {pendingReviewCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-6 py-4 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => handleSelect('landing')}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap"
          >
            Back to Overview
          </button>
        </div>
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-72 max-w-[85vw] bg-[#0B111E] border-r border-slate-800 flex flex-col h-full">
            <div className="h-14 px-5 flex items-center justify-between border-b border-slate-800">
              <button
                type="button"
                onClick={() => handleSelect('landing')}
                className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap"
              >
                PROMETHEUS-X
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 text-slate-400 hover:text-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Mobile navigation">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-blue-600/15 text-cyan-300'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.id === 'review' && pendingReviewCount > 0 && (
                      <span className="font-mono tabular-nums text-xs text-amber-400">
                        {pendingReviewCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Contextual Header (<= 64px desktop, 56px mobile to respect 15% sticky cap) */}
        <header className="h-14 lg:h-16 px-4 sm:px-6 lg:px-8 border-b border-slate-800/80 bg-[#070B14]/95 backdrop-blur-sm sticky top-0 z-30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-slate-300 hover:text-white rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 hidden sm:inline whitespace-nowrap">PROMETHEUS-X</span>
              <span className="text-slate-700 hidden sm:inline" aria-hidden="true">/</span>
              <h1 className="text-sm sm:text-base font-semibold text-slate-100 truncate">
                {PAGE_TITLES[currentPage]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {currentPage !== 'studio' && (
              <button
                type="button"
                onClick={() => onNavigate('studio')}
                className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                New Inspection
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
