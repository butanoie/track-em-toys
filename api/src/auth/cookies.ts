import type { FastifyReply } from 'fastify'

export const REFRESH_TOKEN_COOKIE = 'refresh_token'
const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60 // 30 days

/**
 * Set the refresh token as an httpOnly cookie on the response.
 * Web clients receive the token via cookie (XSS-proof); native clients use the JSON body.
 *
 * @param reply - Fastify reply to set cookie on
 * @param token - Raw refresh token value
 */
export function setRefreshTokenCookie(reply: FastifyReply, token: string): void {
  void reply.setCookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/auth',
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
  })
}

/**
 * Clear the refresh token cookie on logout.
 *
 * @param reply - Fastify reply to clear cookie on
 */
export function clearRefreshTokenCookie(reply: FastifyReply): void {
  void reply.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/auth',
  })
}
