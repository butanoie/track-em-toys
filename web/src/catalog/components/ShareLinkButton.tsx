import { useState } from 'react';
import { Link2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ShareLinkButtonProps {
  url?: string;
}

export function ShareLinkButton({ url }: ShareLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = url ?? window.location.href;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be blocked — fail silently
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        void handleCopy();
      }}
      aria-label={copied ? 'Link copied' : 'Copy link'}
      className="flex-shrink-0"
    >
      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Link2 className="h-4 w-4" />}
    </Button>
  );
}
