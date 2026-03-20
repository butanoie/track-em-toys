import { useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface Photo {
  id: string;
  url: string;
  caption: string | null;
  is_primary: boolean;
  sort_order: number;
}

interface PhotoGalleryProps {
  photos: Photo[];
  itemName: string;
}

export function PhotoGallery({ photos, itemName }: PhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const goToPrev = useCallback(() => {
    setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
  }, []);

  const goToNext = useCallback(() => {
    setLightboxIndex((prev) => (prev !== null && prev < photos.length - 1 ? prev + 1 : prev));
  }, [photos.length]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      }
    },
    [goToPrev, goToNext]
  );

  if (photos.length === 0) return null;

  const primaryPhoto = photos[0];

  return (
    <>
      <div className="mb-4 space-y-2">
        <button
          type="button"
          className="w-full rounded-md overflow-hidden bg-muted aspect-square flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => setLightboxIndex(0)}
          aria-label={`View photo: ${primaryPhoto.caption ?? itemName}`}
        >
          <img
            src={primaryPhoto.url}
            alt={primaryPhoto.caption ?? itemName}
            className="object-contain max-h-full max-w-full"
          />
        </button>

        {photos.length > 1 && (
          <div className="flex gap-1.5 flex-wrap">
            {photos.map((photo, idx) => (
              <button
                key={photo.id}
                type="button"
                className={`w-14 h-14 rounded overflow-hidden bg-muted flex items-center justify-center cursor-pointer border-2 transition-colors ${
                  idx === (lightboxIndex ?? 0) ? 'border-primary' : 'border-transparent hover:border-border'
                }`}
                onClick={() => setLightboxIndex(idx)}
                aria-label={`View photo ${idx + 1}: ${photo.caption ?? itemName}`}
                aria-pressed={idx === (lightboxIndex ?? 0)}
              >
                <img
                  src={photo.url}
                  alt={photo.caption ?? `${itemName} photo ${idx + 1}`}
                  className="object-cover w-full h-full"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={lightboxIndex !== null}
        onOpenChange={(open) => {
          if (!open) setLightboxIndex(null);
        }}
      >
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] p-2 sm:p-4" onKeyDown={handleKeyDown}>
          <DialogTitle className="sr-only">
            {lightboxIndex !== null ? (photos[lightboxIndex].caption ?? `${itemName} photo`) : 'Photo'}
          </DialogTitle>
          {lightboxIndex !== null && (
            <div className="relative flex items-center justify-center min-h-[300px]">
              <img
                src={photos[lightboxIndex].url}
                alt={photos[lightboxIndex].caption ?? `${itemName} photo ${lightboxIndex + 1}`}
                className="max-h-[80vh] max-w-full object-contain"
              />

              {photos.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-1 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background"
                    onClick={goToPrev}
                    disabled={lightboxIndex === 0}
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background"
                    onClick={goToNext}
                    disabled={lightboxIndex === photos.length - 1}
                    aria-label="Next photo"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </>
              )}

              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-muted-foreground bg-background/80 px-2 py-0.5 rounded">
                {lightboxIndex + 1} / {photos.length}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
