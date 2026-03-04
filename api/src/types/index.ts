export interface User {
  id: string
  email: string | null
  email_verified: boolean
  display_name: string | null
  avatar_url: string | null
  deactivated_at: string | null
  created_at: string
  updated_at: string
}

export interface OAuthAccount {
  id: string
  user_id: string
  provider: 'apple' | 'google'
  provider_user_id: string
  email: string | null
  is_private_email: boolean
  raw_profile: Record<string, unknown> | null
  /** pg returns TIMESTAMPTZ as Date; tests may use ISO strings. */
  created_at: Date | string
}

export type ClientType = 'native' | 'web'

export interface RefreshToken {
  id: string
  user_id: string
  token_hash: string
  device_info: string | null
  expires_at: string
  revoked_at: string | null
  client_type: ClientType
  created_at: string
}

export interface AuthEvent {
  id: string
  user_id: string | null
  event_type: AuthEventType
  ip_address: string | null
  user_agent: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export type AuthEventType =
  | 'signin'
  | 'refresh'
  | 'logout'
  | 'link_account'
  | 'provider_auto_linked'
  | 'token_reuse_detected'
  | 'account_deactivated'
  | 'consent_revoked'

export type OAuthProvider = 'apple' | 'google'

export interface TokenPayload {
  sub: string
  iss: string
  aud: string
  iat: number
  exp: number
}

export interface SigninRequest {
  provider: OAuthProvider
  id_token: string
  nonce?: string
  user_info?: {
    name?: string
  }
}

export interface RefreshRequest {
  refresh_token?: string
}

export interface LogoutRequest {
  refresh_token?: string
}

export interface LinkAccountRequest {
  provider: OAuthProvider
  id_token: string
  nonce?: string
}

/** Response type for sign-in. refresh_token is null for web clients (sent via cookie). */
export interface AuthResponse {
  access_token: string
  refresh_token: string | null
  user: UserResponse
}

/** Response type for token refresh. refresh_token is null for web clients (sent via cookie). */
export interface TokenResponse {
  access_token: string
  refresh_token: string | null
}

export interface UserResponse {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
}

export interface ProviderClaims {
  sub: string
  email: string | null
  email_verified: boolean
  name: string | null
  picture: string | null
  client_type: ClientType
}
