import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { LoginPage } from '@/auth/LoginPage'

// Validate redirect param: must be a relative path to prevent open redirect.
// Rejects protocol-relative URLs like //evil.com which also start with '/'.
export const loginSearchSchema = z.object({
  redirect: z
    .string()
    .optional()
    .transform(val =>
      val != null && val.startsWith('/') && !val.startsWith('//')
        ? val
        : undefined
    ),
})

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  component: LoginPage,
})
