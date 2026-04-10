import { Link } from '@tanstack/react-router';
import { buildPhotoUrl } from '@/lib/photo-url';
import type { PhotoApprovalItem } from '@/lib/zod-schemas';

interface PhotoMetadataPanelProps {
  photo: PhotoApprovalItem;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  // toLocaleString does NOT throw on invalid dates — it returns "Invalid Date".
  // Guard with isNaN(getTime()) so we fall back to the raw ISO string instead.
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

function intentLabel(intent: 'training_only' | 'catalog_and_training'): string {
  return intent === 'catalog_and_training' ? 'Catalog + training' : 'Training only';
}

/**
 * Sidebar content for the triage view. Shows the catalog item, the
 * contributor (with GDPR-tombstone fallback), the contribution intent,
 * and up to 3 most recent approved photos for the same item.
 *
 * Per the base plan: when `existing_photos` is empty the entire
 * "Existing photos" section is omitted from the DOM — no placeholder,
 * no empty heading.
 */
export function PhotoMetadataPanel({ photo }: PhotoMetadataPanelProps) {
  const { item, uploader, contribution, existing_photos: existingPhotos } = photo;

  return (
    <aside className="space-y-6" aria-label="Photo metadata">
      <section className="space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Item
        </h3>
        <Link
          to="/catalog/$franchise/items/$slug"
          params={{ franchise: item.franchise_slug, slug: item.slug }}
          className="text-base font-medium text-foreground underline-offset-2 hover:underline"
        >
          {item.name}
        </Link>
      </section>

      <section className="space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Contributor
        </h3>
        {uploader ? (
          <div>
            <div className="text-sm font-medium text-foreground">{uploader.display_name}</div>
            <div className="text-xs text-muted-foreground">{uploader.email}</div>
          </div>
        ) : (
          <div className="text-sm italic text-muted-foreground">Deleted user</div>
        )}
      </section>

      {contribution && (
        <section className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Consent
          </h3>
          <div className="text-sm text-foreground">{intentLabel(contribution.intent)}</div>
          <div className="text-xs text-muted-foreground">
            v{contribution.consent_version} · {formatTimestamp(contribution.consent_granted_at)}
          </div>
        </section>
      )}

      <section className="space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Submitted
        </h3>
        <div className="text-sm text-foreground">{formatTimestamp(photo.created_at)}</div>
      </section>

      {existingPhotos.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Existing approved photos
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {existingPhotos.map((existing) => (
              <Link
                key={existing.id}
                to="/catalog/$franchise/items/$slug"
                params={{ franchise: item.franchise_slug, slug: item.slug }}
                className="block overflow-hidden rounded border border-border"
              >
                <img
                  src={buildPhotoUrl(existing.url)}
                  alt={`Existing approved photo for ${item.name}`}
                  loading="lazy"
                  className="h-20 w-full object-contain"
                />
              </Link>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}
