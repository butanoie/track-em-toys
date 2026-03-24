export const MAX_EXPORT_VERSION = 1;

export interface ImportPreviewData {
  schemaVersion: number;
  exportedAt: string;
  itemCount: number;
  franchiseCounts: Array<{ slug: string; count: number }>;
}
