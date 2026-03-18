// In-memory access token singleton — module-scoped, NOT React state.
// The access token must never be persisted to localStorage or sessionStorage.
// Refresh tokens are managed entirely by the server via httpOnly cookie.

let accessToken: string | null = null;
let refreshTimerId: number | null = null;

export const authStore = {
  getToken: (): string | null => accessToken,
  setToken: (token: string): void => {
    accessToken = token;
  },
  clear: (): void => {
    accessToken = null;
  },
};

export const refreshTimer = {
  set: (id: number): void => {
    refreshTimerId = id;
  },
  cancel: (): void => {
    if (refreshTimerId !== null) {
      window.clearTimeout(refreshTimerId);
      refreshTimerId = null;
    }
  },
};

// sessionStorage keys
export const SESSION_KEYS = {
  user: 'trackem:user',
  appleUserName: 'trackem:apple:user_name',
} as const;

/**
 * localStorage session indicator.
 *
 * JavaScript cannot read httpOnly cookies, so this flag is the only way to
 * know — without a network round-trip — whether the browser holds a refresh
 * token cookie. It carries no sensitive data (value is always '1'); it only
 * signals that the user has previously authenticated in this browser.
 *
 * Lifecycle:
 *  - Set:   after a successful sign-in (Google or Apple)
 *  - Clear: on logout, on failed silent refresh, on auth:sessionexpired
 *
 * Effect: if the flag is absent on app mount, AuthProvider skips the
 * POST /auth/refresh call entirely and renders the login page immediately
 * instead of making an unnecessary round-trip that will always return 401.
 */
const SESSION_FLAG_KEY = 'trackem:has_session';

export const sessionFlag = {
  set: (): void => {
    localStorage.setItem(SESSION_FLAG_KEY, '1');
  },
  clear: (): void => {
    localStorage.removeItem(SESSION_FLAG_KEY);
  },
  check: (): boolean => {
    return localStorage.getItem(SESSION_FLAG_KEY) !== null;
  },
};
