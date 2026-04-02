import { apiFetchJson } from '@/lib/api-client';
import {
  MlStatsSummarySchema,
  MlStatsDailySchema,
  MlStatsModelsSchema,
  type MlStatsSummary,
  type MlStatsDaily,
  type MlStatsModels,
} from '@/lib/zod-schemas';

export async function getMlStatsSummary(days: number): Promise<MlStatsSummary> {
  return apiFetchJson(`/ml/stats/summary?days=${days}`, MlStatsSummarySchema);
}

export async function getMlStatsDaily(days: number): Promise<MlStatsDaily> {
  return apiFetchJson(`/ml/stats/daily?days=${days}`, MlStatsDailySchema);
}

export async function getMlStatsModels(days: number): Promise<MlStatsModels> {
  return apiFetchJson(`/ml/stats/models?days=${days}`, MlStatsModelsSchema);
}
