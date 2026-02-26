import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from '../ErrorBoundary'

// Suppress console.error output from intentional throws in tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// Restore window.location after each test to avoid pollution between tests
const originalLocation = window.location
afterEach(() => {
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
    configurable: true,
  })
})

function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error')
  }
  return <div>Normal content</div>
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Hello</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('renders error fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText(/Please refresh the page/i)).toBeInTheDocument()
  })

  it('shows a Refresh button in error state', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument()
  })

  it('calls window.location.reload when Refresh is clicked', async () => {
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
      configurable: true,
    })

    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )

    await userEvent.click(screen.getByRole('button', { name: /Refresh/i }))
    expect(reloadMock).toHaveBeenCalledOnce()
  })

  it('does not show error UI when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>
    )
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    expect(screen.getByText('Normal content')).toBeInTheDocument()
  })

  it('rethrows non-Error throws (e.g. router redirects)', () => {
    const redirectObject = { to: '/login', search: { redirect: '/' } }

    function ThrowingRedirect(): never {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirectObject
    }

    let caught: unknown
    try {
      render(
        <ErrorBoundary>
          <ThrowingRedirect />
        </ErrorBoundary>
      )
    } catch (e) {
      caught = e
    }

    expect(caught).toBe(redirectObject)
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })
})
