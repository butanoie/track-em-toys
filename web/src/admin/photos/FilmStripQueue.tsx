import { buildPhotoUrl } from '@/lib/photo-url';
import { cn } from '@/lib/utils';
import type { PhotoApprovalItem } from '@/lib/zod-schemas';

interface FilmStripQueueProps {
  photos: PhotoApprovalItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

/**
 * Bottom queue navigation — a horizontal strip of thumbnails with the
 * active photo outlined. Click jumps to that index. The page wires
 * `S`/`D` keyboard navigation to the same `onSelect` callback.
 *
 * Includes a "{n} / {total}" position counter that doubles as the
 * accessible name for the strip's bounding region.
 */
export function FilmStripQueue({ photos, activeIndex, onSelect }: FilmStripQueueProps) {
  const total = photos.length;
  const positionLabel = total === 0 ? '0 / 0' : `${activeIndex + 1} / ${total}`;

  return (
    <nav
      aria-label={`Pending photo queue, position ${positionLabel}`}
      className="space-y-2"
    >
      <div className="text-xs font-medium text-muted-foreground">{positionLabel}</div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {photos.map((photo, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={photo.id}
              type="button"
              onClick={() => onSelect(index)}
              aria-current={isActive ? 'true' : undefined}
              aria-label={`Photo ${index + 1} of ${total}: ${photo.item.name}`}
              className={cn(
                'h-16 w-16 shrink-0 overflow-hidden rounded border transition',
                isActive
                  ? 'border-primary ring-2 ring-primary/40'
                  : 'border-border opacity-70 hover:opacity-100',
              )}
            >
              <img
                src={buildPhotoUrl(photo.photo.url)}
                alt=""
                loading="lazy"
                className="h-full w-full object-contain"
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
