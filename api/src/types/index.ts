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
  created_at: string
}

export interface RefreshToken {
  id: string
  user_id: string
  token_hash: string
  device_info: string | null
  expires_at: string
  revoked_at: string | null
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
  | 'token_reuse_detected'
  | 'account_deactivated'

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

export interface AuthResponse {
  access_token: string
  refresh_token: string
  user: UserResponse
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
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
  name?: string | null
  picture?: string | null
}
