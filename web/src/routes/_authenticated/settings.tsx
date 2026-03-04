import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/auth/SettingsPage'

export const Route = createFileRoute('/_authenticated/settings')({
  component: SettingsPage,
})
