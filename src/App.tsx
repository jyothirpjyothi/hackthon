import { useCallback, useEffect, useState } from 'react';
import { WorkspaceLayout, type AppPage } from './components/Layout';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { InspectionStudioPage } from './pages/InspectionStudioPage';
import { LocalizationPage } from './pages/LocalizationPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { HistoryPage } from './pages/HistoryPage';
import { DriftMonitorPage } from './pages/DriftMonitorPage';
import { ReviewCenterPage } from './pages/ReviewCenterPage';
import { ModelInfoPage } from './pages/ModelInfoPage';
import { SettingsPage } from './pages/SettingsPage';
import { fetchReviewsQueue } from './services/api';
import type { InspectionRecord } from './types/prometheus';

function getInitialPage(): AppPage {
  if (typeof window === 'undefined') return 'landing';
  const params = new URLSearchParams(window.location.search);
  if (params.get('autostart') === '1') {
    const target = params.get('page') as AppPage | null;
    if (
      target &&
      [
        'dashboard',
        'studio',
        'localization',
        'analytics',
        'history',
        'drift',
        'review',
        'model',
        'settings',
      ].includes(target)
    ) {
      return target;
    }
    return 'studio';
  }
  return 'landing';
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>(getInitialPage);
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  const refreshPendingCount = useCallback(() => {
    fetchReviewsQueue()
      .then((res) => setPendingReviewCount(res.pending.length))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  const handleNavigate = (page: AppPage) => {
    setCurrentPage(page);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (page !== 'landing') {
      refreshPendingCount();
    }
  };

  const handleInspectionCompleted = (record: InspectionRecord) => {
    setSelectedInspectionId(record.id);
    refreshPendingCount();
  };

  const handleOpenLocalization = (record: InspectionRecord) => {
    setSelectedInspectionId(record.id);
    handleNavigate('localization');
  };

  if (currentPage === 'landing') {
    return <LandingPage onNavigate={handleNavigate} />;
  }

  return (
    <WorkspaceLayout
      currentPage={currentPage}
      onNavigate={handleNavigate}
      pendingReviewCount={pendingReviewCount}
    >
      {currentPage === 'dashboard' && <DashboardPage onNavigate={handleNavigate} />}
      {currentPage === 'studio' && (
        <InspectionStudioPage
          onInspectionCompleted={handleInspectionCompleted}
          onOpenLocalization={handleOpenLocalization}
          onNavigate={handleNavigate}
        />
      )}
      {currentPage === 'localization' && (
        <LocalizationPage
          selectedInspectionId={selectedInspectionId}
          onSelectInspectionId={setSelectedInspectionId}
          onNavigate={handleNavigate}
        />
      )}
      {currentPage === 'analytics' && <AnalyticsPage onNavigate={handleNavigate} />}
      {currentPage === 'history' && (
        <HistoryPage
          onOpenLocalization={handleOpenLocalization}
          onNavigate={handleNavigate}
          onDataMutated={refreshPendingCount}
        />
      )}
      {currentPage === 'drift' && <DriftMonitorPage />}
      {currentPage === 'review' && (
        <ReviewCenterPage
          onNavigate={handleNavigate}
          onReviewSubmitted={refreshPendingCount}
        />
      )}
      {currentPage === 'model' && <ModelInfoPage />}
      {currentPage === 'settings' && <SettingsPage />}
    </WorkspaceLayout>
  );
}
