import { useCallback, useRef, useState } from 'react';
import type { MlModelSummary } from '@/lib/zod-schemas';
import type { ModelCacheEntry, Prediction } from '@/ml/types';

export type IdentifyPhase =
  | { step: 'idle' }
  | { step: 'loading-model'; progress: number }
  | { step: 'classifying' }
  | { step: 'results'; predictions: Prediction[] }
  | { step: 'error'; message: string };

export function usePhotoIdentify() {
  const [phase, setPhase] = useState<IdentifyPhase>({ step: 'idle' });
  const [activeCategory, setActiveCategory] = useState<'primary' | 'secondary'>('primary');
  const fileRef = useRef<File | null>(null);
  const cacheRef = useRef<Map<string, ModelCacheEntry>>(new Map());

  const identify = useCallback(async (file: File, model: MlModelSummary) => {
    fileRef.current = file;

    if (!model.download_url) {
      setPhase({ step: 'error', message: 'Model file is not available for download.' });
      return;
    }

    try {
      // Lazy import ML modules — keeps onnxruntime-web out of the main bundle
      const [{ loadModel }, { classifyImage }] = await Promise.all([
        import('@/ml/model-cache'),
        import('@/ml/image-classifier'),
      ]);

      // Load model (from IndexedDB cache or download)
      let cacheEntry = cacheRef.current.get(model.name);
      if (!cacheEntry || cacheEntry.version !== model.version) {
        setPhase({ step: 'loading-model', progress: 0 });

        cacheEntry = await loadModel(
          {
            name: model.name,
            version: model.version,
            downloadUrl: model.download_url,
            metadataUrl: model.metadata_url,
            sizeBytes: model.size_bytes,
          },
          (loaded, total) => {
            setPhase({ step: 'loading-model', progress: total > 0 ? loaded / total : 0 });
          }
        );
        cacheRef.current.set(model.name, cacheEntry);
      }

      // Run inference
      setPhase({ step: 'classifying' });
      const predictions = await classifyImage(file, cacheEntry);

      setPhase({ step: 'results', predictions });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Classification failed';
      setPhase({ step: 'error', message });
    }
  }, []);

  const tryAltMode = useCallback(
    (models: MlModelSummary[]) => {
      const nextCategory = activeCategory === 'primary' ? 'secondary' : 'primary';
      const altModel = models.find((m) => m.category === nextCategory);
      if (!altModel || !fileRef.current) return;

      setActiveCategory(nextCategory);
      void identify(fileRef.current, altModel);
    },
    [activeCategory, identify]
  );

  const reset = useCallback(() => {
    fileRef.current = null;
    setPhase({ step: 'idle' });
    setActiveCategory('primary');
  }, []);

  return { phase, activeCategory, identify, tryAltMode, reset };
}
