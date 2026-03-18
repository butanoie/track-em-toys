export const DEFAULT_PAGE_LIMIT = 20
export const MAX_PAGE_LIMIT = 100

export interface CursorPayload {
  v: 1
  name: string
  id: string
}

/**
 * Encode a cursor from the last row's name and id.
 * Uses base64url to avoid URL-unsafe characters.
 */
export function encodeCursor(name: string, id: string): string {
  const payload: CursorPayload = { v: 1, name, id }
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

/**
 * Decode a cursor string back to { name, id }.
 * Returns null if the cursor is malformed, wrong version, or not valid JSON.
 */
export function decodeCursor(cursor: string): { name: string; id: string } | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8')
    const parsed: unknown = JSON.parse(json)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('v' in parsed) ||
      !('name' in parsed) ||
      !('id' in parsed)
    ) {
      return null
    }
    const obj = parsed as Record<string, unknown>
    if (obj.v !== 1) return null
    if (typeof obj.name !== 'string' || typeof obj.id !== 'string') return null
    return { name: obj.name, id: obj.id }
  } catch {
    return null
  }
}

/**
 * Build a cursor-paginated page from limit+1 rows.
 * If more rows than `limit` were returned, the extra row is removed and
 * its name/id are encoded as the next_cursor.
 */
export function buildCursorPage<T extends { name: string; id: string }>(
  rows: T[],
  limit: number,
): { data: T[]; next_cursor: string | null } {
  if (rows.length > limit) {
    const data = rows.slice(0, limit)
    const last = data[data.length - 1]
    return {
      data,
      next_cursor: last ? encodeCursor(last.name, last.id) : null,
    }
  }
  return { data: rows, next_cursor: null }
}

/**
 * Clamp a user-supplied limit to valid range.
 */
export function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_PAGE_LIMIT
  return Math.max(1, Math.min(limit, MAX_PAGE_LIMIT))
}
