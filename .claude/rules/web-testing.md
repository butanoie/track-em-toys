---
paths:
  - "web/e2e/**"
  - "web/src/**/*.test.*"
---

# Web Testing Patterns

## Playwright E2E

- **Per-test real auth**: Each test gets a fresh refresh token via `freshTestSignin()` (Node.js `fetch()` to `POST /auth/test-signin`) + `context.addCookies()`. The `e2e-fixtures.ts` custom `test` fixture handles this automatically based on project name. Import `test` and `expect` from `./fixtures/e2e-fixtures` (not `@playwright/test`) in authenticated tests.
- **API data still mocked**: Auth is real but domain API data (catalog, admin) is still mocked via `page.route()`. Only auth endpoints (`/auth/refresh`, `/auth/logout`) hit the real API.
- **Test-only endpoint**: `POST /auth/test-signin` accepts `{ email, role }` with `@e2e.test` TLD constraint. Returns real JWT + refresh token cookie. Gated behind `NODE_ENV !== 'production'` in `server.ts`.
- **Four projects**: `unauthenticated` (login/redirect tests), `user` (catalog browsing, session), `admin` (admin dashboard), `curator` (future). Tests are matched to projects via `testMatch` regex.
- **Cross-role tests**: Use `createAuthenticatedContext(browser, 'user')` from `e2e-fixtures.ts` for tests that need a different role than their project (e.g., non-admin access guard in the admin spec). This handles cookie injection, `baseURL`, localStorage, and sessionStorage.
- **session-persistence.spec.ts stays mocked**: Tests that explicitly test auth failure paths (expired refresh, session expiry) keep their `page.route()` mocking approach — failure scenarios can't be deterministically triggered against a real API.
- NEVER use `route.continue()` as a fallthrough in catch-all `page.route()` handlers — with a real API running, it forwards the request to the server. Use `route.fallback()` to chain to the next mock handler. Add a catch-all `**/catalog/**` route (registered FIRST = lowest priority) that returns empty data for unhandled API requests.
- Playwright `page.route()` glob patterns do NOT match query strings — `**/collection` matches `/collection` but NOT `/collection?page=1`. Use regex patterns (e.g., `/\/collection(\?.*)?$/`) for endpoints that always include query params
- When mocking API paths that collide with SPA routes (e.g., `/admin/users` is both a page and an API path), filter by `resourceType`: `if (route.request().resourceType() === 'document') return route.continue()`
- Prefer `getByRole('cell', { name: /.../ })` over `getByText()` for table data — text appears in both cell content and row accessible names, causing ambiguity
- When a page has multiple Radix `Select` components (e.g., filter + per-row role selector), `getByRole('combobox')` fails Playwright strict mode — disambiguate with `getByRole('combobox', { name: /aria-label pattern/ })`
- `vite.config.ts` `preview` section does NOT inherit from `server` — host, port, and https must be set explicitly in both. Without this, preview defaults to `localhost` while dev uses the custom hostname, causing SameSite cookie mismatches in E2E tests.
- `mockEmptyCollection(page)` in `e2e/fixtures/mock-helpers.ts` — shared helper that mocks empty collection endpoints (check, stats, list). Required in any E2E spec that renders item detail components (they call `useCollectionCheck`).
- `MockCollectionState` in `e2e/fixtures/mock-helpers.ts` — stateful mock for collection E2E tests. Route handlers close over the instance, so mutations (`addItem`, `removeItem`) are reflected in subsequent GET responses without re-registering routes.
- When adding a field to a Zod schema (e.g., `CatalogItemSchema`), also update mock data in E2E spec files — E2E mocks go through Zod parse in the browser and will fail if required fields are missing.
- `ConditionSelector` renders `<button>` elements (not Radix `Select`) — E2E tests click `getByRole('button', { name: /OC Opened Complete/ })` (buttons show short code prefix + full label). The collection page has two condition filter dropdowns: package condition (`getByRole('combobox', { name: /Filter by package condition/ })`) and item grade (`getByRole('combobox', { name: /Filter by item grade/ })`).
- `MockCollectionState` also handles export/import routes — `GET /collection/export` derives payload from `liveItems`, `POST /collection/import` resolves slugs against known items and mutates state. Overwrite mode snapshots + soft-deletes all live items before import.
- File download assertions: `page.waitForEvent('download')` must be started **before** the click that triggers the download — use `Promise.all([page.waitForEvent('download'), button.click()])` or assign the promise first. Read content via `download.createReadStream()`.
- File upload in tests: `page.locator('[role="dialog"] input[type="file"]').setInputFiles({ name, mimeType, buffer })` — the buffer form avoids temp files on disk, works on hidden inputs without `force: true`
- Radix AlertDialog portals: scope assertions with `page.getByRole('alertdialog')` — the portal renders outside the parent `Dialog`, so `page.getByRole('dialog')` won't contain it
- Error injection pattern: register a `page.route()` override **after** `state.register(page)` to intercept specific endpoints with error responses — Playwright's last-registered-wins rule gives the override higher priority
- Import test helpers in `e2e/fixtures/import-helpers.ts` — `buildExportFileDescriptor`, `buildRawFileDescriptor`, `selectImportFile`, `clickAppend`/`clickReplace`, `confirmAppendDialog`/`confirmReplaceDialog`, `readDownloadJson`
- E2E tests bypass ONNX inference via `window.__ML_TEST_PREDICTIONS__` — set by `injectTestPredictions()` in `e2e/fixtures/ml-helpers.ts`, checked by `getTestPredictions()` in `usePhotoIdentify.ts`. New ML inference paths must check this hook.
- "Add by Photo" button only renders in `CollectionStatsBar` actions (non-empty collection). E2E tests needing this button must use `MockCollectionState` with at least one item.
- E2E tests use `npm run preview` (serves built bundle). After modifying source, run `npm run build` before `npm run test:e2e` — changes won't appear otherwise.
- Scope E2E assertions inside Sheet/Dialog via `const sheet = page.getByRole('dialog')` to avoid strict mode violations when items appear in both the sheet and the page behind it.
- ML mock helpers in `e2e/fixtures/ml-helpers.ts`: `mockMlModels`, `mockMlModelsEmpty`, `mockMlEvents`, `injectTestPredictions`, `mockPredictionItemDetails`, `mockMlStats`
- Rate limiting: running with 3 workers can exhaust `test-signin` rate limits (60/min). Use `--workers=1` when debugging or after many retries.

## Pre-Submission Checklist

Before reporting any task complete, run these verifications and fix all failures.

### 1. Build, tests, lint, and typecheck

```bash
cd web && npm run build 2>&1 | tail -10
cd web && npm test 2>&1 | tail -20
cd web && npm run lint 2>&1 | tail -10
cd web && npm run typecheck 2>&1 | tail -10
```

All four must complete with zero errors.

### 2. No `any` type

```bash
grep -rn ": any\b\|as any\b\| any\b" src/ --include="*.ts" --include="*.tsx"
```

Must return zero results. Use proper types, generics, or `unknown` with type guards.

### 3. No useState + fetch for server state

```bash
grep -rn "useState\|useEffect" src/ --include="*.tsx" --include="*.ts" | grep -i "fetch\|axios\|api\|http"
```

Must return zero results. All data fetching goes through TanStack Query.

### 4. API calls only in dedicated hooks

```bash
grep -rn "fetch(\|axios\." src/ --include="*.tsx" | grep -v "hooks/\|queries/\|api/"
```

API calls must be in query hooks or API client files, never inline in components.

### 5. Zod validation for all external data

```bash
grep -rn "JSON\.parse\|response\.json()" src/ --include="*.ts" --include="*.tsx"
```

Every result must be immediately followed by a Zod `.parse()` or `.safeParse()` call.

### 6. Type assertions require runtime checks

```bash
grep -rn " as [A-Z][a-zA-Z]*[^;,\)]" src/ --include="*.ts" --include="*.tsx" | grep -v "\.test\."
```

Each `as SomeType` in production code must be preceded by a runtime check or Zod parse.

### 7. New components have tests

Every new component or hook must have a test file covering: renders without crashing,
key user interactions, error and loading states.

### 8. No `sessionStorage.clear()`

```bash
grep -rn "sessionStorage\.clear()" src/ --include="*.ts" --include="*.tsx"
```

Must return zero results. Use `sessionStorage.removeItem(SESSION_KEYS.keyName)` for targeted removal.

### 9. CSRF conditionals must fail-closed

```bash
grep -rn "returnedState && storedState\|nonce && stored" src/ --include="*.ts" --include="*.tsx"
```

Must return zero results. Use fail-closed logic: `if (!a || !b || a !== b) { reject }`.

### 10. Single auth refresh implementation

```bash
grep -rn "POST.*auth/refresh\|/auth/refresh" src/ --include="*.ts" --include="*.tsx" | grep -v "\.test\."
```

Must return exactly one non-test result (in `api-client.ts`). Token refresh must live in a
single shared function with a refresh mutex.
`attemptRefresh()` must deduplicate concurrent calls via a shared in-flight promise —
React Strict Mode double-mount sends two simultaneous refresh requests that trigger
server-side token reuse detection and revoke all user sessions.

### 11. Redirect params must be relative paths

TanStack Router's `location.href` is already relative (no origin) — safe to use with
`startsWith('/')` validators. Do NOT use `window.location.href` (absolute). Do NOT use
`location.pathname + location.search` — `location.search` is a parsed object in TanStack
Router, not a string. Validators must reject `//` prefixes with `/^\/[^/]/`.

### 12. Security tokens cleared after success only

```bash
grep -rn "sessionStorage\.removeItem.*nonce\|sessionStorage\.removeItem.*state" src/ --include="*.ts" --include="*.tsx"
```

CSRF state and nonces must only be removed **after** the protected operation succeeds,
not before the API call.

### 13. Dynamic script injection must deduplicate

```bash
grep -rn "appendChild.*script\|createElement.*script" src/ --include="*.ts" --include="*.tsx"
```

Guard with a module-scope in-flight promise to prevent duplicate appends on concurrent calls.

### 14. Auth gatekeeper routes have tests

Every authenticated layout guard route must have tests covering: loading spinner while
`isLoading`, outlet when authenticated, redirect to `/login` when unauthenticated,
no redirect while still loading.

### 15. E2E tests pass (if modified)

```bash
cd web && npm run test:e2e
```

If you modified user-facing flows (auth, navigation, forms), run Playwright e2e tests.
Use `npm run test:e2e:ui` for interactive debugging.

## Key Patterns

### Server state with TanStack Query

```tsx
// CORRECT
function ToyList() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['toys'],
    queryFn: () => api.getToys(),
  });
  if (isPending) return <Spinner />;
  if (isError) return <ErrorMessage />;
  return (
    <ul>
      {data.map((toy) => (
        <ToyItem key={toy.id} toy={toy} />
      ))}
    </ul>
  );
}
```

### Form with React Hook Form + Zod

```tsx
const schema = z.object({ name: z.string().min(1), year: z.number().int() });
type FormData = z.infer<typeof schema>;

function ToyForm() {
  const form = useForm<FormData>({ resolver: zodResolver(schema) });
  const mutation = useMutation({ mutationFn: api.createToy });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
```

### Validated API response

```typescript
const toySchema = z.object({ id: z.string().uuid(), name: z.string() });
async function getToy(id: string) {
  const res = await fetch(`/api/toys/${id}`);
  return toySchema.parse(await res.json());
}
```

### Fail-closed security checks

```typescript
// CORRECT — missing state is treated as a mismatch
if (!returnedState || !storedState || returnedState !== storedState) {
  setError('state mismatch');
  return;
}
```

### Script injection deduplication

```typescript
let sdkLoadPromise: Promise<void> | null = null;
function loadSDK(): Promise<void> {
  if (window.AppleID) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;
  sdkLoadPromise = new Promise((resolve, reject) => {
    /* append once */
  });
  return sdkLoadPromise;
}
```
