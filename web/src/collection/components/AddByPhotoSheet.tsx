import { useCallback, useMemo, useRef } from 'react';
import { Camera, RefreshCw, Search } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { DropZone } from '@/catalog/photos/DropZone';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useMlModels } from '@/collection/hooks/useMlModels';
import { usePhotoIdentify } from '@/collection/hooks/usePhotoIdentify';
import { emitMlEvent } from '@/ml/telemetry';
import { PredictionCard } from './PredictionCard';
import type { CollectionMutations } from '@/collection/hooks/useCollectionMutations';

interface AddByPhotoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mutations: CollectionMutations;
}

export function AddByPhotoSheet({ open, onOpenChange, mutations }: AddByPhotoSheetProps) {
  const { data: modelsData, isPending: modelsLoading } = useMlModels();
  const { phase, activeCategory, identify, tryAltMode, reset } = usePhotoIdentify();

  // Track whether a terminal event (accepted/browse) already fired this session
  const hasTerminalEventRef = useRef(false);

  const models = useMemo(() => modelsData?.models ?? [], [modelsData]);
  const primaryModel = useMemo(() => models.find((m) => m.category === 'primary'), [models]);
  const secondaryModel = useMemo(() => models.find((m) => m.category === 'secondary'), [models]);
  const activeModel = activeCategory === 'primary' ? primaryModel : secondaryModel;
  const hasAltModel = activeCategory === 'primary' ? !!secondaryModel : !!primaryModel;

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file || !activeModel) return;
      hasTerminalEventRef.current = false;
      void identify(file, activeModel);
    },
    [activeModel, identify]
  );

  const handleAltMode = useCallback(() => {
    hasTerminalEventRef.current = false;
    tryAltMode(models);
  }, [tryAltMode, models]);

  const handlePredictionAccepted = useCallback(() => {
    hasTerminalEventRef.current = true;
  }, []);

  const handleBrowseCatalog = useCallback(() => {
    hasTerminalEventRef.current = true;
    emitMlEvent('browse_catalog', activeModel?.name, {
      model_version: activeModel?.version,
      model_category: activeModel?.category,
    });
  }, [activeModel]);

  const handleClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        // Fire scan_abandoned if sheet closes without a terminal event
        if (!hasTerminalEventRef.current && phase.step !== 'idle' && phase.step !== 'error') {
          emitMlEvent('scan_abandoned', activeModel?.name, {
            model_version: activeModel?.version,
            model_category: activeModel?.category,
            had_results: phase.step === 'results',
          });
        }
        hasTerminalEventRef.current = false;
        reset();
      }
      onOpenChange(isOpen);
    },
    [onOpenChange, reset, phase.step, activeModel]
  );

  const noModels = !modelsLoading && models.length === 0;

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            Identify by Photo
          </SheetTitle>
          <SheetDescription>Upload a photo of a toy to find matching catalog items.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {modelsLoading && <LoadingSpinner className="py-8" />}

          {noModels && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-3">Photo identification is not yet available.</p>
              <Link to="/catalog">
                <Button variant="outline" size="sm">
                  <Search className="h-4 w-4 mr-1.5" />
                  Browse Catalog
                </Button>
              </Link>
            </div>
          )}

          {/* Idle — show drop zone */}
          {!modelsLoading && !noModels && phase.step === 'idle' && <DropZone onFilesSelected={handleFilesSelected} />}

          {/* Loading model — show progress bar */}
          {phase.step === 'loading-model' && (
            <div className="py-8 space-y-3">
              <p className="text-sm text-center text-muted-foreground">Downloading model{'\u2026'}</p>
              <Progress value={Math.round(phase.progress * 100)} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">
                {Math.round(phase.progress * 100)}%
                {activeModel && ` of ${(activeModel.size_bytes / 1024 / 1024).toFixed(1)} MB`}
              </p>
            </div>
          )}

          {/* Classifying — show spinner */}
          {phase.step === 'classifying' && (
            <div className="py-8 text-center">
              <LoadingSpinner className="mb-3" />
              <p className="text-sm text-muted-foreground">Analyzing photo{'\u2026'}</p>
            </div>
          )}

          {/* Results */}
          {phase.step === 'results' && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">
                Possible matches
                <span className="text-muted-foreground font-normal ml-1">({activeCategory} model)</span>
              </p>

              {phase.predictions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No matches found. Try a different photo.
                </p>
              ) : (
                <div className="space-y-2">
                  {phase.predictions.map((prediction, i) => (
                    <PredictionCard
                      key={prediction.label}
                      prediction={prediction}
                      predictionRank={i + 1}
                      activeModel={activeModel}
                      mutations={mutations}
                      onAccepted={handlePredictionAccepted}
                    />
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                <div className="flex items-center gap-2">
                  {hasAltModel && (
                    <Button variant="outline" size="sm" onClick={handleAltMode}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Try {activeCategory === 'primary' ? 'alt-mode' : 'robot mode'}
                    </Button>
                  )}
                  <Link to="/catalog" onClick={handleBrowseCatalog}>
                    <Button variant="outline" size="sm">
                      <Search className="h-3.5 w-3.5 mr-1.5" />
                      Browse catalog
                    </Button>
                  </Link>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    hasTerminalEventRef.current = false;
                    reset();
                  }}
                >
                  Try another photo
                </Button>
              </div>
            </div>
          )}

          {/* Error */}
          {phase.step === 'error' && (
            <div className="py-6 text-center space-y-3">
              <p className="text-sm text-destructive">{phase.message}</p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" size="sm" onClick={reset}>
                  Try again
                </Button>
                <Link to="/catalog">
                  <Button variant="ghost" size="sm">
                    Browse catalog
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
