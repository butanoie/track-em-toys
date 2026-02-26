import type { FastifyReply } from 'fastify'
import { config } from '../config.js'
import { REFRESH_TOKEN_EXPIRY_DAYS } from './tokens.js'

/** Name of the signed httpOnly cookie used to store the refresh token for web clients. */
export const REFRESH_TOKEN_COOKIE = 'refresh_token'
const REFRESH_TOKEN_MAX_AGE_SECONDS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60

/** Narrow reply shape required by cookie helpers — only the methods actually called. */
export type CookieReply = Pick<FastifyReply, 'setCookie' | 'clearCookie'>

/**
 * Set the refresh token as a signed httpOnly cookie on the response.
 * Web clients receive the token via cookie (XSS-proof); native clients use the JSON body.
 * The cookie is signed with the configured COOKIE_SECRET to prevent tampering.
 *
 * @param reply - Fastify reply to set cookie on
 * @param token - Raw refresh token value
 */
export function setRefreshTokenCookie(reply: CookieReply, token: string): void {
  reply.setCookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'strict',
    path: '/auth',
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
    signed: true,
  })
}

/**
 * Clear the signed refresh token cookie on logout.
 *
 * @param reply - Fastify reply to clear cookie on
 */
export function clearRefreshTokenCookie(reply: CookieReply): void {
  reply.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'strict',
    path: '/auth',
    signed: true,
  })
}
