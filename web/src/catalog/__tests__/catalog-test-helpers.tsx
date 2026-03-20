import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  FranchiseStatsItem,
  FranchiseDetail,
  CatalogItem,
  CatalogItemDetail,
  CatalogItemList,
  CharacterDetail,
  CharacterListItem,
  CharacterAppearance,
  FacetValue,
  ItemFacets,
  CharacterFacets,
  ManufacturerStatsItem,
  ManufacturerDetail,
  ManufacturerItemFacets,
} from '@/lib/zod-schemas';

// --- Helpers ---

function slugName(slug: string, name: string) {
  return { slug, name };
}

export function makeFacetValue(value: string, label: string, count: number): FacetValue {
  return { value, label, count };
}

// --- Franchise fixtures ---

export const mockFranchise: FranchiseStatsItem = {
  slug: 'transformers',
  name: 'Transformers',
  sort_order: 1,
  notes: null,
  item_count: 42,
  continuity_family_count: 3,
  manufacturer_count: 2,
};

export const mockFranchiseDetail: FranchiseDetail = {
  id: 'f-001',
  slug: 'transformers',
  name: 'Transformers',
  sort_order: 1,
  notes: 'Classic Hasbro franchise',
  created_at: '2026-01-01T00:00:00.000Z',
};

// --- Manufacturer fixtures ---

export const mockManufacturer: ManufacturerStatsItem = {
  slug: 'hasbro',
  name: 'Hasbro',
  is_official_licensee: true,
  country: 'US',
  item_count: 100,
  toy_line_count: 5,
  franchise_count: 3,
};

export const mockManufacturerDetail: ManufacturerDetail = {
  id: 'm-001',
  slug: 'hasbro',
  name: 'Hasbro',
  is_official_licensee: true,
  country: 'US',
  website_url: 'https://hasbro.com',
  aliases: ['Hasbro Inc'],
  notes: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

// --- CatalogItem fixtures ---

export const mockCatalogItem: CatalogItem = {
  id: 'i-001',
  name: 'Optimus Prime',
  slug: 'optimus-prime',
  franchise: slugName('transformers', 'Transformers'),
  character: slugName('optimus-prime', 'Optimus Prime'),
  manufacturer: slugName('hasbro', 'Hasbro'),
  toy_line: slugName('generation-1', 'Generation 1'),
  size_class: 'Leader',
  year_released: 1984,
  is_third_party: false,
  data_quality: 'verified',
};

export const mockCatalogItemNoManufacturer: CatalogItem = {
  ...mockCatalogItem,
  id: 'i-002',
  name: 'Mystery Figure',
  slug: 'mystery-figure',
  manufacturer: null,
};

export const mockCatalogItemDetail: CatalogItemDetail = {
  ...mockCatalogItem,
  appearance: null,
  description: 'Leader of the Autobots',
  barcode: null,
  sku: null,
  product_code: 'G1-001',
  photos: [],
  metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

export const mockCatalogItemList: CatalogItemList = {
  data: [mockCatalogItem],
  next_cursor: null,
  total_count: 1,
};

// --- Character fixtures ---

export const mockAppearance: CharacterAppearance = {
  id: 'a-001',
  slug: 'the-transformers-s1',
  name: 'The Transformers Season 1',
  source_media: 'Animated TV series',
  source_name: null,
  year_start: 1984,
  year_end: 1985,
  description: null,
};

export const mockCharacterListItem: CharacterListItem = {
  id: 'c-001',
  name: 'Optimus Prime',
  slug: 'optimus-prime',
  franchise: slugName('transformers', 'Transformers'),
  faction: slugName('autobot', 'Autobot'),
  continuity_family: slugName('g1', 'Generation 1'),
  character_type: 'Transformer',
  alt_mode: 'Semi-truck',
  is_combined_form: false,
};

export const mockCharacterDetail: CharacterDetail = {
  id: 'c-001',
  name: 'Optimus Prime',
  slug: 'optimus-prime',
  franchise: slugName('transformers', 'Transformers'),
  faction: slugName('autobot', 'Autobot'),
  continuity_family: slugName('g1', 'Generation 1'),
  character_type: 'Transformer',
  alt_mode: 'Semi-truck',
  is_combined_form: false,
  combiner_role: null,
  combined_form: null,
  component_characters: [],
  sub_groups: [],
  appearances: [mockAppearance],
  metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

// --- Facet fixtures ---

export const mockItemFacets: ItemFacets = {
  manufacturers: [makeFacetValue('hasbro', 'Hasbro', 10)],
  size_classes: [makeFacetValue('Leader', 'Leader', 5)],
  toy_lines: [makeFacetValue('generation-1', 'Generation 1', 8)],
  continuity_families: [makeFacetValue('g1', 'Generation 1', 12)],
  is_third_party: [makeFacetValue('false', 'Official', 40)],
};

export const mockCharacterFacets: CharacterFacets = {
  factions: [makeFacetValue('autobot', 'Autobot', 20)],
  character_types: [makeFacetValue('Transformer', 'Transformer', 25)],
  sub_groups: [makeFacetValue('dinobots', 'Dinobots', 5)],
};

export const mockManufacturerItemFacets: ManufacturerItemFacets = {
  franchises: [makeFacetValue('transformers', 'Transformers', 50)],
  size_classes: [makeFacetValue('Leader', 'Leader', 10)],
  toy_lines: [makeFacetValue('generation-1', 'Generation 1', 20)],
  continuity_families: [makeFacetValue('g1', 'Generation 1', 30)],
  is_third_party: [makeFacetValue('false', 'Official', 45)],
};

// --- Test wrapper ---

export function createCatalogTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function CatalogTestWrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}
