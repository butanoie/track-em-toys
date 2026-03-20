#!/usr/bin/env python3
"""
Migration script: Extract combiner and vehicle-crew data from character records
into separate relationship files.

Two-phase operation:
  Phase 1 (--extract): Read character files, generate relationship files
  Phase 2 (--strip):   Remove old fields from character records

Run Phase 1 first, verify relationship files, then run Phase 2.
"""

import json
import glob
import os
import sys
from collections import defaultdict

SEED_DIR = os.path.join(os.path.dirname(__file__), '..')
CHAR_DIR = os.path.join(SEED_DIR, 'characters')
REL_DIR = os.path.join(SEED_DIR, 'relationships')


def load_all_characters():
    """Load all character records from all files, grouped by continuity."""
    by_continuity = defaultdict(list)
    all_chars = {}
    for f in sorted(glob.glob(os.path.join(CHAR_DIR, '*.json'))):
        with open(f) as fh:
            data = json.load(fh)
        for c in data['characters']:
            all_chars[c['slug']] = c
            cont = c.get('continuity_family_slug', 'unknown')
            by_continuity[cont].append(c)
    return all_chars, by_continuity


def extract_combiner_relationships(all_chars):
    """Extract combiner-component relationships from combined_form_slug fields."""
    rels_by_continuity = defaultdict(list)

    for slug, c in all_chars.items():
        cf_slug = c.get('combined_form_slug')
        if cf_slug is None:
            continue

        # Check if target is a combined form (combiner) or vehicle
        target = all_chars.get(cf_slug)
        if target is None:
            print(f'  WARNING: {slug} points to unknown {cf_slug}', file=sys.stderr)
            continue

        if target.get('is_combined_form'):
            # This is a combiner relationship
            rel = {
                'type': 'combiner-component',
                'subtype': None,
                'entity1': {'slug': cf_slug, 'role': 'gestalt'},
                'entity2': {'slug': slug, 'role': c.get('combiner_role')},
                'metadata': {},
            }
            cont = c.get('continuity_family_slug', 'unknown')
            rels_by_continuity[cont].append(rel)

        elif target.get('character_type') == 'Vehicle':
            # This is a vehicle-crew relationship
            role = c.get('combiner_role')  # 'pilot', 'driver', etc.
            rel = {
                'type': 'vehicle-crew',
                'subtype': 'packaged-with',
                'entity1': {'slug': cf_slug, 'role': 'vehicle'},
                'entity2': {'slug': slug, 'role': role},
                'metadata': {},
            }
            cont = c.get('continuity_family_slug', 'unknown')
            rels_by_continuity[cont].append(rel)

        else:
            print(
                f'  WARNING: {slug} has combined_form_slug={cf_slug} but target is neither combined form nor vehicle',
                file=sys.stderr,
            )

    return rels_by_continuity


def sort_relationships(rels):
    """Sort relationships: by type, then entity1.slug, then entity2.slug."""
    type_order = {
        'combiner-component': 0,
        'binary-bond': 1,
        'vehicle-crew': 2,
        'rival': 3,
        'sibling': 4,
        'mentor-student': 5,
        'evolution': 6,
    }
    return sorted(
        rels,
        key=lambda r: (
            type_order.get(r['type'], 99),
            r['entity1']['slug'],
            r['entity2']['slug'],
        ),
    )


def write_relationship_file(continuity_slug, relationships):
    """Write a relationship file for a continuity family."""
    os.makedirs(REL_DIR, exist_ok=True)
    sorted_rels = sort_relationships(relationships)
    data = {
        '_metadata': {
            'description': f'Character relationships for {continuity_slug} continuity family',
            'total': len(sorted_rels),
        },
        'relationships': sorted_rels,
    }
    path = os.path.join(REL_DIR, f'{continuity_slug}-relationships.json')
    with open(path, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(f'  Wrote {path}: {len(sorted_rels)} relationships')


def strip_old_fields():
    """Remove combined_form_slug, combiner_role, component_slugs from all character files."""
    fields_to_remove = ['combined_form_slug', 'combiner_role', 'component_slugs']
    for filepath in sorted(glob.glob(os.path.join(CHAR_DIR, '*.json'))):
        with open(filepath) as fh:
            data = json.load(fh)
        stripped = 0
        for c in data['characters']:
            for field in fields_to_remove:
                if field in c:
                    del c[field]
                    stripped += 1
        if stripped > 0:
            with open(filepath, 'w') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write('\n')
            fname = os.path.basename(filepath)
            print(f'  Stripped {stripped} fields from {fname}')


def verify_no_data_loss(all_chars, rels_by_continuity):
    """Verify every combined_form_slug reference became a relationship."""
    original_refs = 0
    migrated_refs = 0

    for c in all_chars.values():
        if c.get('combined_form_slug') is not None:
            original_refs += 1

    for rels in rels_by_continuity.values():
        migrated_refs += len(rels)

    print(f'\n  Verification:')
    print(f'    Original combined_form_slug references: {original_refs}')
    print(f'    Migrated relationship records: {migrated_refs}')

    if original_refs != migrated_refs:
        print(f'    *** MISMATCH: {original_refs - migrated_refs} references lost! ***')
        return False
    else:
        print(f'    All references migrated successfully.')
        return True


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ('--extract', '--strip', '--both'):
        print('Usage: python migrate-to-relationships.py [--extract|--strip|--both]')
        print('  --extract  Phase 1: Generate relationship files from character data')
        print('  --strip    Phase 2: Remove old fields from character records')
        print('  --both     Run both phases sequentially')
        sys.exit(1)

    mode = sys.argv[1]

    if mode in ('--extract', '--both'):
        print('Phase 1: Extracting relationships from character data...')
        all_chars, by_continuity = load_all_characters()
        rels_by_continuity = extract_combiner_relationships(all_chars)

        for cont, rels in sorted(rels_by_continuity.items()):
            write_relationship_file(cont, rels)

        if not verify_no_data_loss(all_chars, rels_by_continuity):
            print('ERROR: Data loss detected. Aborting.')
            sys.exit(1)

        print(f'\nPhase 1 complete. Review the relationship files in {REL_DIR}/')

    if mode in ('--strip', '--both'):
        print('\nPhase 2: Stripping old fields from character records...')
        strip_old_fields()
        print('Phase 2 complete.')


if __name__ == '__main__':
    main()
