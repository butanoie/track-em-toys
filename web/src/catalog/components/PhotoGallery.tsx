import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { buildPhotoUrl } from '@/catalog/photos/api';
import type { Photo } from '@/lib/zod-schemas';

interface PhotoGalleryProps {
  photos: Photo[];
  itemName: string;
}

export function PhotoGallery({ photos, itemName }: PhotoGalleryProps) {
  const sortedPhotos = useMemo(
    () =>
      [...photos].sort((a, b) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        return a.sort_order - b.sort_order;
      }),
    [photos]
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const goToPrev = useCallback(() => {
    setLightboxIndex((prev) => (prev !== null ? (prev - 1 + sortedPhotos.length) % sortedPhotos.length : prev));
  }, [sortedPhotos.length]);

  const goToNext = useCallback(() => {
    setLightboxIndex((prev) => (prev !== null ? (prev + 1) % sortedPhotos.length : prev));
  }, [sortedPhotos.length]);

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

  const displayedPhoto = sortedPhotos[selectedIndex] ?? sortedPhotos[0];

  return (
    <>
      <div className="mb-4 space-y-2">
        <button
          type="button"
          className="relative w-full rounded-md overflow-hidden bg-muted flex items-center justify-center cursor-pointer group hover:opacity-90 transition-opacity"
          onClick={() => setLightboxIndex(selectedIndex)}
          aria-label={`Enlarge photo: ${displayedPhoto.caption ?? itemName}`}
        >
          <img
            src={buildPhotoUrl(displayedPhoto.url)}
            alt={displayedPhoto.caption ?? itemName}
            className="object-contain w-full max-h-[32rem]"
          />
          <span className="absolute bottom-2 right-2 rounded-full bg-background/80 p-1.5 text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity">
            <ZoomIn className="h-4 w-4" />
          </span>
        </button>

        {sortedPhotos.length > 1 && (
          <div className="flex gap-1.5 flex-wrap">
            {sortedPhotos.map((photo, idx) => (
              <button
                key={photo.id}
                type="button"
                className={`w-14 h-14 rounded overflow-hidden bg-muted flex items-center justify-center cursor-pointer border-2 transition-colors ${
                  idx === selectedIndex ? 'border-primary' : 'border-transparent hover:border-border'
                }`}
                onClick={() => setSelectedIndex(idx)}
                aria-label={`View photo ${idx + 1}: ${photo.caption ?? itemName}`}
                aria-pressed={idx === selectedIndex}
              >
                <img
                  src={buildPhotoUrl(photo.url)}
                  alt={photo.caption ?? `${itemName} photo ${idx + 1}`}
                  className="object-contain max-h-full max-w-full"
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
            {lightboxIndex !== null ? (sortedPhotos[lightboxIndex].caption ?? `${itemName} photo`) : 'Photo'}
          </DialogTitle>
          {lightboxIndex !== null && (
            <div className="relative flex items-center justify-center min-h-[300px]">
              <img
                src={buildPhotoUrl(sortedPhotos[lightboxIndex].url)}
                alt={sortedPhotos[lightboxIndex].caption ?? `${itemName} photo ${lightboxIndex + 1}`}
                className="max-h-[80vh] max-w-full object-contain"
              />

              {sortedPhotos.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-1 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background"
                    onClick={goToPrev}
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background"
                    onClick={goToNext}
                    aria-label="Next photo"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </>
              )}

              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-muted-foreground bg-background/80 px-2 py-0.5 rounded">
                {lightboxIndex + 1} / {sortedPhotos.length}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
