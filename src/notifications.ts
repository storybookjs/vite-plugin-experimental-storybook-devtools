/**
 * Notification abstraction layer.
 *
 * Defines a simple, vendor-agnostic interface for emitting structured
 * log entries and toast notifications from the server side of the plugin.
 * Concrete implementations can target the Vite DevTools Logs API,
 * a plain console logger, or any future backend.
 */

export type NotificationLevel = 'info' | 'warn' | 'error' | 'success' | 'debug'

export interface Notification {
  /** Short summary displayed as the toast / log title */
  message: string
  /** Severity level */
  level: NotificationLevel
  /** Optional longer explanation */
  description?: string
  /** If true, show a transient toast in addition to persisting in the log */
  toast?: boolean
  /** Auto-dismiss delay in ms (toast only). Default: 5000 */
  autoDismissMs?: number
  /** Clickable source location */
  filePosition?: { file: string; line?: number; column?: number }
  /** Grouping tag (e.g. 'story-creation', 'provider-analysis') */
  category?: string
}

export interface NotificationHandle {
  /** Update the notification in-place (e.g. change "Saving…" → "Saved!") */
  update(patch: Partial<Notification>): void
  /** Dismiss / remove the notification */
  dismiss(): void
}

/**
 * Vendor-agnostic notification service.
 *
 * Implementations MUST be safe to call at any time — if the underlying
 * backend is unavailable they should silently degrade (e.g. fall back to
 * console).
 */
export interface NotificationService {
  notify(notification: Notification): NotificationHandle
}

// ---------------------------------------------------------------------------
// Console fallback (always available)
// ---------------------------------------------------------------------------

function consoleMethodForLevel(level: NotificationLevel) {
  switch (level) {
    case 'error':
      return console.error
    case 'warn':
      return console.warn
    case 'debug':
      return console.debug
    default:
      return console.log
  }
}

export class ConsoleNotificationService implements NotificationService {
  notify(notification: Notification): NotificationHandle {
    const method = consoleMethodForLevel(notification.level)
    const parts = [`[component-highlighter] ${notification.message}`]
    if (notification.description) parts.push(notification.description)
    if (notification.filePosition) parts.push(`  ${notification.filePosition.file}:${notification.filePosition.line ?? ''}`)
    method(...parts)

    return {
      update(patch) {
        if (patch.message) {
          consoleMethodForLevel(patch.level ?? notification.level)(
            `[component-highlighter] ${patch.message}`,
          )
        }
      },
      dismiss() {
        // nothing to dismiss on console
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Vite DevTools implementation
// ---------------------------------------------------------------------------

/**
 * Accepts any object with an `add` method matching the DevTools Logs API shape.
 * We keep this as a plain interface so the module stays independent of
 * `@vitejs/devtools-kit` — callers pass in `ctx.logs` at runtime.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DevToolsLogContext = any

export class DevToolsNotificationService implements NotificationService {
  private logs: DevToolsLogContext
  private fallback: ConsoleNotificationService

  constructor(logs: DevToolsLogContext) {
    this.logs = logs
    this.fallback = new ConsoleNotificationService()
  }

  notify(notification: Notification): NotificationHandle {
    try {
      const entry = {
        message: notification.message,
        level: notification.level,
        ...(notification.description !== undefined && { description: notification.description }),
        ...(notification.toast !== undefined && { notify: notification.toast }),
        ...(notification.autoDismissMs !== undefined && { autoDismiss: notification.autoDismissMs }),
        ...(notification.filePosition !== undefined && { filePosition: notification.filePosition }),
        ...(notification.category !== undefined && { category: notification.category }),
      }

      const result = this.logs.add(entry)

      // The DevTools add() returns a Promise<DevToolsLogHandle>.
      // We provide a best-effort sync wrapper.
      let resolvedHandle: { update: (p: Record<string, unknown>) => void; dismiss: () => void } | null = null
      if (result && typeof result.then === 'function') {
        result.then((h: any) => { resolvedHandle = h })
      }

      return {
        update(patch) {
          if (resolvedHandle) resolvedHandle.update(patch as Record<string, unknown>)
        },
        dismiss() {
          if (resolvedHandle) resolvedHandle.dismiss()
        },
      }
    } catch {
      // DevTools unavailable — fall through to console
      return this.fallback.notify(notification)
    }
  }
}
