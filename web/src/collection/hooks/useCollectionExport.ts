import { useState } from 'react';
import { toast } from 'sonner';
import { exportCollection } from '@/collection/api';
import { downloadJsonBlob } from '@/collection/lib/download';
import { CollectionExportPayloadSchema } from '@/lib/zod-schemas';

export function useCollectionExport() {
  const [isExporting, setIsExporting] = useState(false);

  async function runExport(includeDeleted = false): Promise<void> {
    setIsExporting(true);
    try {
      const response = await exportCollection(includeDeleted);
      const data: unknown = await response.json();
      const parsed = CollectionExportPayloadSchema.safeParse(data);
      if (!parsed.success) {
        throw new Error('Unexpected export format from server');
      }
      const itemCount = parsed.data.items.length;

      const date = new Date().toISOString().slice(0, 10);
      downloadJsonBlob(JSON.stringify(data, null, 2), `collection-export-${date}.json`);

      toast.success('Collection exported', {
        description: `${itemCount} ${itemCount === 1 ? 'item' : 'items'} saved to file`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not export collection. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }

  return { runExport, isExporting };
}
