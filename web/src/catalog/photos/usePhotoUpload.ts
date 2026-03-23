import { useCallback, useEffect, useReducer, useRef } from 'react';
import { uploadPhoto, validateFile, DuplicateUploadError } from './api';
import { toast } from 'sonner';

export type UploadItemStatus = 'queued' | 'uploading' | 'done' | 'error';

export interface UploadItem {
  id: string;
  fileName: string;
  status: UploadItemStatus;
  progress: number;
  errorMessage?: string;
}

type Action =
  | { type: 'ENQUEUE'; items: Array<{ id: string; fileName: string }> }
  | { type: 'START'; id: string }
  | { type: 'PROGRESS'; id: string; percent: number }
  | { type: 'DONE'; id: string }
  | { type: 'ERROR'; id: string; message: string }
  | { type: 'REMOVE'; id: string };

function reducer(state: UploadItem[], action: Action): UploadItem[] {
  switch (action.type) {
    case 'ENQUEUE':
      return [
        ...state,
        ...action.items.map((item) => ({
          id: item.id,
          fileName: item.fileName,
          status: 'queued' as const,
          progress: 0,
        })),
      ];
    case 'START':
      return state.map((item) => (item.id === action.id ? { ...item, status: 'uploading' as const } : item));
    case 'PROGRESS':
      return state.map((item) => (item.id === action.id ? { ...item, progress: action.percent } : item));
    case 'DONE':
      return state.map((item) => (item.id === action.id ? { ...item, status: 'done' as const, progress: 100 } : item));
    case 'ERROR':
      return state.map((item) =>
        item.id === action.id ? { ...item, status: 'error' as const, errorMessage: action.message } : item
      );
    case 'REMOVE':
      return state.filter((item) => item.id !== action.id);
    default:
      return state;
  }
}

interface UsePhotoUploadOptions {
  franchise: string;
  itemSlug: string;
  onUploadComplete: () => void;
}

export interface UsePhotoUploadReturn {
  items: UploadItem[];
  isUploading: boolean;
  uploadFiles: (files: File[]) => void;
}

export function usePhotoUpload({ franchise, itemSlug, onUploadComplete }: UsePhotoUploadOptions): UsePhotoUploadReturn {
  const [items, dispatch] = useReducer(reducer, []);
  const isUploading = items.some((item) => item.status === 'uploading');
  const processingRef = useRef(false);
  const filesMapRef = useRef(new Map<string, File>());

  const uploadFiles = useCallback((files: File[]) => {
    const validItems: Array<{ id: string; fileName: string }> = [];

    for (const file of files) {
      const error = validateFile(file);
      if (error) {
        toast.error(error);
        continue;
      }
      const id = crypto.randomUUID();
      filesMapRef.current.set(id, file);
      validItems.push({ id, fileName: file.name });
    }

    if (validItems.length > 0) {
      dispatch({ type: 'ENQUEUE', items: validItems });
    }
  }, []);

  useEffect(() => {
    if (processingRef.current) return;

    const nextQueued = items.find((item) => item.status === 'queued');
    if (!nextQueued) return;

    const file = filesMapRef.current.get(nextQueued.id);
    if (!file) return;

    processingRef.current = true;
    dispatch({ type: 'START', id: nextQueued.id });

    uploadPhoto(franchise, itemSlug, file, (p) => {
      dispatch({ type: 'PROGRESS', id: nextQueued.id, percent: p.percent });
    })
      .then(() => {
        processingRef.current = false;
        dispatch({ type: 'DONE', id: nextQueued.id });
        filesMapRef.current.delete(nextQueued.id);
        toast.success(`${nextQueued.fileName} uploaded`);
        onUploadComplete();

        setTimeout(() => {
          dispatch({ type: 'REMOVE', id: nextQueued.id });
        }, 3000);
      })
      .catch((err: unknown) => {
        processingRef.current = false;
        filesMapRef.current.delete(nextQueued.id);

        if (err instanceof DuplicateUploadError) {
          dispatch({ type: 'ERROR', id: nextQueued.id, message: err.message });
          toast.error(`${nextQueued.fileName} is a duplicate`, {
            description: 'This image matches an existing photo for this item.',
          });
          return;
        }

        const message = err instanceof Error ? err.message : 'Upload failed';
        dispatch({ type: 'ERROR', id: nextQueued.id, message });
        toast.error(`Failed to upload ${nextQueued.fileName}`);
      });
  }, [items, franchise, itemSlug, onUploadComplete]);

  return { items, isUploading, uploadFiles };
}
