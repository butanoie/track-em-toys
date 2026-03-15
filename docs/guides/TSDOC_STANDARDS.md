# Documentation Standards (JSDoc/TSDoc)

Templates and conventions for documenting TypeScript code across the API and Web modules. These standards apply to all exported functions, classes, interfaces, and components.

> **Swift documentation** follows standard Swift Markup (triple-slash `///` comments with `- Parameters:`, `- Returns:`, `- Throws:` directives). See Apple's documentation for conventions.

---

## Functions

```typescript
/**
 * Calculates the final price for a toy listing including condition multiplier.
 *
 * @param basePrice - The catalog base price in cents
 * @param condition - Item condition grade (mint, near-mint, good, fair, poor)
 * @param yearProduced - Production year, used for vintage premium calculation
 * @returns The adjusted price in cents, rounded to the nearest cent
 * @throws {ValidationError} If condition is not a recognized grade
 *
 * @example
 * ```typescript
 * calculateListingPrice(5000, 'mint', 1985); // 7500 (vintage mint premium)
 * calculateListingPrice(5000, 'good', 2020); // 4000 (modern good condition)
 * ```
 */
function calculateListingPrice(
  basePrice: number,
  condition: ConditionGrade,
  yearProduced: number
): number { ... }
```

### Rules

- Every `@param` must include a description, not just a name
- `@returns` is required when the return type is not `void`
- `@throws` is required for any function that can throw
- `@example` is recommended for complex functions or non-obvious behavior

---

## Interfaces and Types

```typescript
/** A toy in the shared catalog, visible to all users. */
interface CatalogToy {
  /** UUID primary key */
  id: string;
  /** Display name (e.g., "1985 Optimus Prime G1") */
  name: string;
  /** Manufacturer name, null if unknown */
  manufacturer: string | null;
  /** Production year, null if undated */
  year: number | null;
  /** Average market price in cents, updated daily */
  avgPriceCents: number;
}
```

### Rules

- Every interface and type alias needs a top-level description
- Every property needs a `/** doc */` comment
- Include default values in the description when applicable
- Document nullability — explain *when* a field is null, not just *that* it can be

---

## Fastify Route Handlers

```typescript
/**
 * Creates a new toy in the user's private collection.
 *
 * Validates the request body against the collection item schema,
 * links to a catalog entry if one exists, and returns the created item.
 *
 * @route POST /api/collections/items
 * @param request - Fastify request with validated body
 * @param reply - Fastify reply
 * @returns 201 with the created collection item
 * @throws {HttpError} 400 if validation fails, 401 if unauthenticated
 */
async function createCollectionItem(
  request: FastifyRequest<{ Body: CreateItemBody }>,
  reply: FastifyReply
): Promise<void> { ... }
```

---

## Fastify Plugins

```typescript
/**
 * Registers authentication routes (signin, refresh, logout, JWKS).
 *
 * @param fastify - Fastify instance with cookie and JWT decorators
 * @param _opts - Plugin options (unused)
 */
async function authRoutes(
  fastify: FastifyInstance,
  _opts: object
): Promise<void> { ... }
```

---

## React Components

```typescript
/**
 * Displays a toy card with image, name, condition badge, and estimated price.
 *
 * @param props - Component props
 * @param props.toy - The catalog toy to display
 * @param props.showPrice - Whether to show the price estimate (default: true)
 * @param props.onAddToCollection - Callback when the "Add" button is clicked
 */
function ToyCard({
  toy,
  showPrice = true,
  onAddToCollection,
}: ToyCardProps): JSX.Element { ... }
```

---

## React Hooks

```typescript
/**
 * Manages debounced search across the toy catalog with loading state.
 *
 * @param initialQuery - Starting search query (default: '')
 * @param debounceMs - Debounce delay in milliseconds (default: 300)
 * @returns Object containing query state, setter, results, and loading indicator
 *
 * **Dependencies:** `[debouncedQuery]` — re-fetches when the debounced value changes
 */
function useToySearch(initialQuery = '', debounceMs = 300) { ... }
```

---

## Async / Database Functions

```typescript
/**
 * Finds a user's collection items with optional filtering and pagination.
 *
 * @param client - Database client (from pool or transaction)
 * @param userId - The authenticated user's ID
 * @param options - Pagination and filter options
 * @param options.limit - Max items to return (default: 20, max: 100)
 * @param options.offset - Number of items to skip (default: 0)
 * @param options.condition - Filter by condition grade
 * @returns Promise resolving to the paginated collection response
 * @throws {Error} If the query fails
 */
async function findCollectionItems(
  client: QueryOnlyClient,
  userId: string,
  options: CollectionQueryOptions
): Promise<PaginatedResponse<CollectionItem>> { ... }
```

---

## Zod Schemas

```typescript
/** Request body schema for creating a collection item. */
const createItemBodySchema = z.object({
  /** UUID of the catalog toy to add (must exist in the catalog) */
  catalogToyId: z.string().uuid(),
  /** Item condition grade */
  condition: z.enum(['mint', 'near-mint', 'good', 'fair', 'poor']),
  /** Purchase price in cents, null if unknown */
  purchasePriceCents: z.number().int().positive().nullable(),
  /** Free-form notes about the item */
  notes: z.string().max(1000).optional(),
});
```

---

## Anti-Patterns

**Don't restate the obvious:**

```typescript
// BAD — adds no information
/** Gets the name. */
function getName(): string { ... }

// GOOD — explains context
/** Returns the display name, falling back to email prefix if no name is set. */
function getName(): string { ... }
```

**Don't duplicate the type signature:**

```typescript
// BAD — duplicates what TypeScript already tells you
/** @param id {string} The ID */

// GOOD — adds semantic meaning
/** @param id - The user's UUID from the OAuth provider */
```

**Don't let documentation go stale:**

If you modify a function's behavior, update its TSDoc in the same commit. Stale documentation is worse than no documentation — it actively misleads. Treat outdated TSDoc as a bug.

**Don't document internal helpers the same way as exports:**

Internal (non-exported) helper functions don't need full TSDoc. A brief `//` comment explaining *why* is sufficient. Save the ceremony for the public API surface.
