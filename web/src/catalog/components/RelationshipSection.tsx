import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';

export interface RelationshipGroupItem {
  key: string;
  name: string;
  role: string | null;
  subtype: string | null;
  isCurrent?: boolean;
  renderLink: () => ReactNode;
}

export interface RelationshipGroup {
  type: string;
  heading: string;
  groupSubtype: string | null;
  renderHeading?: () => ReactNode;
  items: RelationshipGroupItem[];
}

interface RelationshipSectionProps {
  groups: RelationshipGroup[];
}

export function RelationshipSection({ groups }: RelationshipSectionProps) {
  if (groups.length === 0) return null;

  return (
    <>
      {groups.map((group) => (
        <section key={group.type} className="mt-6">
          <h3 className="text-sm font-semibold text-foreground mb-2">
            {group.renderHeading ? group.renderHeading() : group.heading}
            {group.groupSubtype && (
              <Badge variant="secondary" className="ml-2 text-xs font-normal">
                {group.groupSubtype}
              </Badge>
            )}
          </h3>
          <ul className="space-y-1.5">
            {group.items.map((item) => (
              <li key={item.key}>
                {item.isCurrent ? (
                  <span aria-current="true" className="text-sm font-medium text-muted-foreground">
                    {item.name}
                  </span>
                ) : (
                  item.renderLink()
                )}
                {!group.groupSubtype && item.subtype && (
                  <Badge variant="secondary" className="ml-1.5 text-xs font-normal">
                    {item.subtype}
                  </Badge>
                )}
                {item.role && <span className="text-xs text-muted-foreground ml-1.5">({item.role})</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
