import { createFileRoute } from '@tanstack/react-router'
import { AppleCallback } from '@/auth/AppleCallback'

export const Route = createFileRoute('/auth/apple-callback')({
  component: AppleCallback,
})
