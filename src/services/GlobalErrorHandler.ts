import { loggerService } from '@/services/LoggerService'

const logger = loggerService.withContext('GlobalErrorHandler')

const serializeUnhandledReason = (reason: unknown) => {
  if (reason instanceof Error) {
    return {
      name: reason.name,
      message: reason.message,
      stack: reason.stack
    }
  }

  try {
    return JSON.stringify(reason)
  } catch {
    return String(reason)
  }
}

export function installGlobalErrorHandlers() {
  const globalWithHandlers = globalThis as typeof globalThis & {
    ErrorUtils?: {
      getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void
      setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void
    }
    onunhandledrejection?: (event: { reason?: unknown }) => void
    __CHERRY_GLOBAL_ERROR_HANDLERS_INSTALLED__?: boolean
  }

  if (globalWithHandlers.__CHERRY_GLOBAL_ERROR_HANDLERS_INSTALLED__) {
    return
  }

  globalWithHandlers.__CHERRY_GLOBAL_ERROR_HANDLERS_INSTALLED__ = true

  const previousHandler = globalWithHandlers.ErrorUtils?.getGlobalHandler?.()

  globalWithHandlers.ErrorUtils?.setGlobalHandler?.((error: Error, isFatal?: boolean) => {
    logger.error(`Global JS exception captured${isFatal ? ' (fatal)' : ''}`, error, { isFatal, logToFile: true })
    previousHandler?.(error, isFatal)
  })

  const previousUnhandledRejection = globalWithHandlers.onunhandledrejection

  globalWithHandlers.onunhandledrejection = event => {
    logger.error('Unhandled promise rejection captured', serializeUnhandledReason(event?.reason), { logToFile: true })
    previousUnhandledRejection?.(event)
  }
}
