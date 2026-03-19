import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { X } from 'lucide-react';
import type { SearchCharacterResult } from '@/lib/zod-schemas';

interface CharacterStubPanelProps {
  character: SearchCharacterResult | undefined;
  onClose: () => void;
}

export function CharacterStubPanel({ character, onClose }: CharacterStubPanelProps) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (character && panelRef.current) {
      panelRef.current.focus();
    }
  }, [character]);

  useEffect(() => {
    if (!character) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [character, onClose]);

  if (!character) {
    return (
      <aside
        role="complementary"
        aria-label="Character detail"
        className="hidden lg:flex items-center justify-center text-center p-8 text-muted-foreground"
      >
        <p className="text-sm">Select a result to view details</p>
      </aside>
    );
  }

  return (
    <aside
      ref={panelRef}
      role="complementary"
      aria-label={`Character detail: ${character.name}`}
      tabIndex={-1}
      className="p-4 overflow-y-auto focus:outline-none"
    >
      <div className="flex items-start justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold text-foreground">{character.name}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close detail panel" className="flex-shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Separator className="mb-4" />

      <dl className="space-y-3">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Franchise</dt>
          <dd className="text-sm mt-0.5">{character.franchise.name}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</dt>
          <dd className="text-sm mt-0.5">Character</dd>
        </div>
      </dl>

      <div className="mt-8 p-4 rounded-md bg-muted text-center">
        <p className="text-sm text-muted-foreground">Character detail pages coming soon.</p>
      </div>
    </aside>
  );
}
