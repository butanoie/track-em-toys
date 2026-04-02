import { useCallback, useRef, useState } from 'react';
import type { MlModelSummary } from '@/lib/zod-schemas';
import type { ModelCacheEntry, Prediction } from '@/ml/types';
import { emitMlEvent } from '@/ml/telemetry';

export type IdentifyPhase =
  | { step: 'idle' }
  | { step: 'loading-model'; progress: number }
  | { step: 'classifying' }
  | { step: 'results'; predictions: Prediction[] }
  | { step: 'error'; message: string };

/** E2E test hook — set window.__ML_TEST_PREDICTIONS__ to bypass ONNX inference. */
function getTestPredictions(): Prediction[] | null {
  try {
    const w = window as unknown as { __ML_TEST_PREDICTIONS__?: Prediction[] };
    return Array.isArray(w.__ML_TEST_PREDICTIONS__) ? w.__ML_TEST_PREDICTIONS__ : null;
  } catch {
    return null;
  }
}

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
      emitMlEvent('scan_started', model.name, {
        model_version: model.version,
        model_category: model.category,
      });

      // E2E test bypass — skip ONNX inference when test predictions are injected
      const testPredictions = getTestPredictions();
      if (testPredictions) {
        setPhase({ step: 'classifying' });
        await new Promise((r) => setTimeout(r, 50));
        emitMlEvent('scan_completed', model.name, {
          model_version: model.version,
          model_category: model.category,
          inference_ms: 50,
          top1_confidence: testPredictions[0]?.confidence ?? 0,
          top5_labels: testPredictions.map((p) => p.label),
        });
        setPhase({ step: 'results', predictions: testPredictions });
        return;
      }

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
      const t0 = performance.now();
      const predictions = await classifyImage(file, cacheEntry);
      const inferenceMs = Math.round(performance.now() - t0);

      emitMlEvent('scan_completed', model.name, {
        model_version: model.version,
        model_category: model.category,
        inference_ms: inferenceMs,
        top1_confidence: predictions[0]?.confidence ?? 0,
        top5_labels: predictions.map((p) => p.label),
      });

      setPhase({ step: 'results', predictions });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Classification failed';
      emitMlEvent('scan_failed', model.name, {
        model_version: model.version,
        model_category: model.category,
        error_message: message,
      });
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
