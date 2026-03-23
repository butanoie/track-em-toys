import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Star, Trash2 } from 'lucide-react';
import { buildPhotoUrl } from './api';
import type { Photo } from '@/lib/zod-schemas';

interface PhotoGridProps {
  photos: Photo[];
  onReorder: (photos: Array<{ id: string; sort_order: number }>) => void;
  onSetPrimary: (photoId: string) => void;
  onDelete: (photoId: string) => void;
  disabled?: boolean;
}

export function PhotoGrid({ photos, onReorder, onSetPrimary, onDelete, disabled = false }: PhotoGridProps) {
  const [orderedPhotos, setOrderedPhotos] = useState(photos);

  useEffect(() => {
    setOrderedPhotos(photos);
  }, [photos]);

  const posOf = useCallback((id: string | number) => orderedPhotos.findIndex((p) => p.id === id) + 1, [orderedPhotos]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIdx = orderedPhotos.findIndex((p) => p.id === active.id);
      const newIdx = orderedPhotos.findIndex((p) => p.id === over.id);
      const reordered = arrayMove(orderedPhotos, oldIdx, newIdx);

      setOrderedPhotos(reordered);
      onReorder(reordered.map((p, i) => ({ id: p.id, sort_order: i })));
    },
    [orderedPhotos, onReorder]
  );

  if (photos.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground">
        Photos <span className="text-muted-foreground">({photos.length})</span>
      </h3>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => `Picked up photo ${posOf(active.id)}. Use arrow keys to move.`,
            onDragOver: ({ active, over }) =>
              over
                ? `Photo ${posOf(active.id)} is over position ${posOf(over.id)}.`
                : `Photo ${posOf(active.id)} is no longer over a droppable area.`,
            onDragEnd: ({ active, over }) =>
              over
                ? `Photo ${posOf(active.id)} was moved to position ${posOf(over.id)}.`
                : `Photo ${posOf(active.id)} was dropped.`,
            onDragCancel: ({ active }) =>
              `Drag cancelled. Photo ${posOf(active.id)} returned to its original position.`,
          },
        }}
      >
        <SortableContext items={orderedPhotos.map((p) => p.id)} strategy={rectSortingStrategy} disabled={disabled}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {orderedPhotos.map((photo) => (
              <SortablePhotoCard
                key={photo.id}
                photo={photo}
                onSetPrimary={onSetPrimary}
                onDelete={onDelete}
                disabled={disabled}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {photos.length > 1 && (
        <p className="text-xs text-muted-foreground text-center">Drag to reorder &middot; Star marks primary</p>
      )}
    </div>
  );
}

interface SortablePhotoCardProps {
  photo: Photo;
  onSetPrimary: (photoId: string) => void;
  onDelete: (photoId: string) => void;
  disabled?: boolean;
}

function SortablePhotoCard({ photo, onSetPrimary, onDelete, disabled }: SortablePhotoCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: photo.id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-md overflow-hidden bg-muted max-h-48 flex items-center justify-center cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-70 scale-95 shadow-lg ring-2 ring-primary z-10' : ''
      }`}
      {...attributes}
      {...listeners}
    >
      <img
        src={buildPhotoUrl(photo.url)}
        alt={photo.caption ?? 'Photo'}
        className="object-contain max-h-full max-w-full pointer-events-none"
        loading="lazy"
      />

      {photo.is_primary && (
        <div
          className="absolute top-1 left-1 z-10 flex items-center gap-0.5 rounded-full bg-amber-600 px-1.5 py-0.5 text-xs font-semibold text-white dark:bg-amber-500 dark:text-amber-950"
          role="status"
          aria-label="Primary photo"
        >
          <Star className="h-3 w-3" fill="currentColor" aria-hidden="true" />
        </div>
      )}

      {!photo.is_primary && (
        <button
          type="button"
          className="absolute top-1 left-1 z-10 rounded-full bg-black/50 p-1 text-white/80 hover:text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          aria-label="Set as primary photo"
          onClick={() => onSetPrimary(photo.id)}
        >
          <Star className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}

      <div className="absolute bottom-0 inset-x-0 flex items-end justify-end p-1.5 bg-gradient-to-t from-black/50 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          className="text-white/80 hover:text-white"
          aria-label="Delete photo"
          onClick={() => onDelete(photo.id)}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
