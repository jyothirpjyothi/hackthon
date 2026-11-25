import axios from 'axios';
import type {
  AnalyticsOverview,
  DriftStatusResponse,
  EvaluationMetrics,
  InspectionRecord,
  MarkerShape,
  ModelVersionInfo,
  SampleSpecimen,
  SystemSettings,
} from '../types/prometheus';

const http = axios.create({
  baseURL: '/api',
  timeout: 60000,
});

export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined;
    if (data?.error) return data.error;
    if (data?.message) return data.message;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'An unexpected error occurred while communicating with the server.';
}

export async function fetchSystemInfo() {
  const { data } = await http.get<{
    name: string;
    engine: string;
    architecture: string;
    inputImageSize: number;
    supportedCategories: string[];
    trainedCategoriesCount: number;
    calibratedCategoriesCount: number;
    maxUploadSizeMb: number;
    allowedFormats: string[];
  }>('/system/info');
  return data;
}

export async function fetchSampleSpecimens(): Promise<SampleSpecimen[]> {
  const { data } = await http.get<{ samples: SampleSpecimen[] }>('/samples');
  return data.samples;
}

export async function runInspection(params: {
  file?: File | null;
  sampleKey?: string | null;
  category: string;
  markerShape?: MarkerShape;
}): Promise<InspectionRecord> {
  const form = new FormData();
  form.append('category', params.category);
  if (params.markerShape) {
    form.append('markerShape', params.markerShape);
  }
  if (params.file) {
    form.append('image', params.file);
  } else if (params.sampleKey) {
    form.append('sampleKey', params.sampleKey);
  }
  const { data } = await http.post<{ inspection: InspectionRecord }>('/inspect', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.inspection;
}

export async function fetchInspections(filters?: {
  search?: string;
  category?: string;
  prediction?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}): Promise<InspectionRecord[]> {
  const { data } = await http.get<{ inspections: InspectionRecord[] }>('/inspections', {
    params: filters,
  });
  return data.inspections;
}

export async function fetchInspectionById(id: string): Promise<InspectionRecord> {
  const { data } = await http.get<{ inspection: InspectionRecord }>(`/inspections/${encodeURIComponent(id)}`);
  return data.inspection;
}

export async function deleteInspection(id: string): Promise<void> {
  await http.delete(`/inspections/${encodeURIComponent(id)}`);
}

export async function fetchAnalyticsOverview(): Promise<AnalyticsOverview> {
  const { data } = await http.get<AnalyticsOverview>('/analytics/overview');
  return data;
}

export async function fetchDriftStatus(category?: string): Promise<DriftStatusResponse> {
  const { data } = await http.get<DriftStatusResponse>('/drift/status', {
    params: category && category !== 'ALL' ? { category } : undefined,
  });
  return data;
}

export async function fetchReviewsQueue(): Promise<{
  pending: InspectionRecord[];
  reviewed: InspectionRecord[];
  summary: {
    totalInspected: number;
    falsePositiveCount: number;
    confirmedDefectCount: number;
    humanReviewedCount: number;
    reviewRequiredCount: number;
  };
}> {
  const { data } = await http.get('/reviews/pending');
  return data;
}

export async function submitReviewDecision(
  inspectionId: string,
  decision: 'APPROVED_NORMAL' | 'CONFIRMED_DEFECT' | 'FALSE_POSITIVE',
  notes: string
): Promise<InspectionRecord> {
  const { data } = await http.post<{ inspection: InspectionRecord }>(
    `/reviews/${encodeURIComponent(inspectionId)}/decision`,
    { decision, notes }
  );
  return data.inspection;
}

export async function fetchModelInfo(): Promise<{
  activeArchitecture: string;
  inputImageSize: number;
  coresetRatio: number;
  models: ModelVersionInfo[];
}> {
  const { data } = await http.get('/model/info');
  return data;
}

export async function trainCategoryBaseline(params: {
  category: string;
  architecture: 'PatchCore-MultiScale' | 'EfficientAD-Lite';
  files?: File[];
}): Promise<{ message: string; model: ModelVersionInfo }> {
  const form = new FormData();
  form.append('category', params.category);
  form.append('architecture', params.architecture);
  if (params.files && params.files.length > 0) {
    for (const f of params.files) {
      form.append('images', f);
    }
  }
  const { data } = await http.post<{ message: string; model: ModelVersionInfo }>('/model/train', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function runCategoryEvaluation(category: string): Promise<{
  message: string;
  metrics: EvaluationMetrics;
  model: ModelVersionInfo;
}> {
  const { data } = await http.post('/model/evaluate', { category });
  return data;
}

export async function fetchSettings(): Promise<SystemSettings> {
  const { data } = await http.get<{ settings: SystemSettings }>('/settings');
  return data.settings;
}

export async function updateSettings(settings: SystemSettings): Promise<SystemSettings> {
  const { data } = await http.put<{ settings: SystemSettings }>('/settings', settings);
  return data.settings;
}

export function getReportDownloadUrl(inspectionId: string): string {
  return `/api/reports/${encodeURIComponent(inspectionId)}`;
}
