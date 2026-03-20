import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { DetailField } from '@/catalog/components/DetailField';
import { dataQualityStyle } from '@/catalog/components/data-quality-style';
import { PhotoGallery } from '@/catalog/components/PhotoGallery';
import type { CatalogItemDetail } from '@/lib/zod-schemas';

interface ItemDetailContentProps {
  data: CatalogItemDetail;
  franchise: string;
}

export function ItemDetailContent({ data, franchise }: ItemDetailContentProps) {
  return (
    <>
      <PhotoGallery photos={data.photos} itemName={data.name} />

      <dl className="space-y-3">
        <DetailField label="Character">
          <Link
            to="/catalog/$franchise/characters/$slug"
            params={{ franchise, slug: data.character.slug }}
            className="text-primary hover:underline"
          >
            {data.character.name}
          </Link>
        </DetailField>

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

        <DetailField label="Size Class" value={data.size_class} />
        <DetailField label="Year Released" value={data.year_released?.toString()} />
        <DetailField label="Product Code" value={data.product_code} />

        {data.appearance && <DetailField label="Appearance" value={data.appearance.name} />}

        <DetailField label="Status">
          <Badge variant="outline" className={dataQualityStyle(data.data_quality)}>
            {data.data_quality.replace(/_/g, ' ')}
          </Badge>
        </DetailField>

        {data.is_third_party && (
          <div>
            <Badge
              variant="outline"
              className="border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300"
            >
              Third Party
            </Badge>
          </div>
        )}

        {data.description && <DetailField label="Description">{data.description}</DetailField>}
      </dl>
    </>
  );
}
