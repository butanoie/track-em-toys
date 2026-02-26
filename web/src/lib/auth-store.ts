// In-memory access token singleton — module-scoped, NOT React state.
// The access token must never be persisted to localStorage or sessionStorage.
// Refresh tokens are managed entirely by the server via httpOnly cookie.

let accessToken: string | null = null
let refreshTimerId: number | null = null

export const authStore = {
  getToken: (): string | null => accessToken,
  setToken: (token: string): void => {
    accessToken = token
  },
  clear: (): void => {
    accessToken = null
  },
}

export const refreshTimer = {
  set: (id: number): void => {
    refreshTimerId = id
  },
  cancel: (): void => {
    if (refreshTimerId !== null) {
      window.clearTimeout(refreshTimerId)
      refreshTimerId = null
    }
  },
}

// sessionStorage keys
export const SESSION_KEYS = {
  user: 'trackem:user',
  appleNonce: 'trackem:apple:nonce',
  appleState: 'trackem:apple:state',
  appleUserName: 'trackem:apple:user_name',
} as const
