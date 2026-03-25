import { Link } from '@tanstack/react-router';
import { DetailField } from '@/catalog/components/DetailField';
import { PhotoGallery } from '@/catalog/components/PhotoGallery';
import { ItemRelationships } from '@/catalog/components/ItemRelationships';
import type { CatalogItemDetail } from '@/lib/zod-schemas';

interface ItemDetailContentProps {
  data: CatalogItemDetail;
  franchise: string;
}

export function ItemDetailContent({ data, franchise }: ItemDetailContentProps) {
  const primary = data.characters.find((c) => c.is_primary) ?? data.characters[0];

  return (
    <>
      <PhotoGallery photos={data.photos} itemName={data.name} />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        {primary?.appearance_name && <DetailField label="Appearance" value={primary.appearance_name} />}

        {data.manufacturer && (
          <DetailField label="Manufacturer">
            <Link
              to="/catalog/manufacturers/$slug"
              params={{ slug: data.manufacturer.slug }}
              className="text-primary hover:underline"
            >
              {data.manufacturer.name}
            </Link>
          </DetailField>
        )}

        <DetailField label="Size Class" value={data.size_class ?? '—'} />

        <DetailField label="Toy Line">
          <Link
            to="/catalog/$franchise/items"
            params={{ franchise }}
            search={{ toy_line: data.toy_line.slug }}
            className="text-primary hover:underline"
          >
            {data.toy_line.name}
          </Link>
        </DetailField>

        <DetailField label="Year Released" value={data.year_released?.toString() ?? '—'} />
        <DetailField label="Product Code" value={data.product_code} />

        {data.description && (
          <DetailField label="Description" className="col-span-2">
            {data.description}
          </DetailField>
        )}
      </dl>

      <ItemRelationships franchise={franchise} itemSlug={data.slug} />
    </>
  );
}
