# Web — Domain-Specific Rules

> Supplements the root `CLAUDE.md`. Rules here are additive — the root file's Web section still applies.

## Before Writing New Code

Read existing files for patterns before writing anything new:
- New component → read an existing component in the same feature area
- New API call → read existing TanStack Query hooks in the nearest `hooks/` directory
- New form → read an existing Zod-validated form component (React Hook Form is not yet installed)
- New route → read the router configuration file first

Match existing patterns exactly. Do not introduce new conventions.

---

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

### 11. Redirect params must be relative paths

`location.href` is absolute and fails `startsWith('/')` validators. Always use
`location.pathname + location.search`. Validators must reject `//` prefixes with `/^\/[^/]/`.

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

---

## Key Patterns

### Server state with TanStack Query
```tsx
// CORRECT
function ToyList() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['toys'],
    queryFn: () => api.getToys(),
  })
  if (isPending) return <Spinner />
  if (isError) return <ErrorMessage />
  return <ul>{data.map(toy => <ToyItem key={toy.id} toy={toy} />)}</ul>
}
```

### Form with React Hook Form + Zod (planned — not yet installed)
> `react-hook-form` and `@hookform/resolvers` are NOT in `package.json` yet.
> Install them before using this pattern: `npm install react-hook-form @hookform/resolvers`
```tsx
const schema = z.object({ name: z.string().min(1), year: z.number().int() })
type FormData = z.infer<typeof schema>

function ToyForm() {
  const form = useForm<FormData>({ resolver: zodResolver(schema) })
  const mutation = useMutation({ mutationFn: api.createToy })
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(data => mutation.mutate(data))}>
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </form>
    </Form>
  )
}
```

### Validated API response
```typescript
const toySchema = z.object({ id: z.string().uuid(), name: z.string() })
async function getToy(id: string) {
  const res = await fetch(`/api/toys/${id}`)
  return toySchema.parse(await res.json())
}
```

### Fail-closed security checks
```typescript
// CORRECT — missing state is treated as a mismatch
if (!returnedState || !storedState || returnedState !== storedState) {
  setError('state mismatch'); return
}
```

### Script injection deduplication
```typescript
let sdkLoadPromise: Promise<void> | null = null
function loadSDK(): Promise<void> {
  if (window.AppleID) return Promise.resolve()
  if (sdkLoadPromise) return sdkLoadPromise
  sdkLoadPromise = new Promise((resolve, reject) => { /* append once */ })
  return sdkLoadPromise
}
```
