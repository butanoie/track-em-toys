import { useQuery } from '@tanstack/react-query';
import { getMlStatsSummary, getMlStatsDaily, getMlStatsModels, getMlModelQuality } from './api';

export function useMlStatsSummary(days: number) {
  return useQuery({
    queryKey: ['admin', 'ml', 'stats', 'summary', days],
    queryFn: () => getMlStatsSummary(days),
    staleTime: 60_000,
  });
}

export function useMlStatsDaily(days: number) {
  return useQuery({
    queryKey: ['admin', 'ml', 'stats', 'daily', days],
    queryFn: () => getMlStatsDaily(days),
    staleTime: 60_000,
  });
}

export function useMlStatsModels(days: number) {
  return useQuery({
    queryKey: ['admin', 'ml', 'stats', 'models', days],
    queryFn: () => getMlStatsModels(days),
    staleTime: 60_000,
  });
}

export function useMlModelQuality() {
  return useQuery({
    queryKey: ['admin', 'ml', 'quality'],
    queryFn: getMlModelQuality,
    staleTime: 5 * 60_000,
  });
}
