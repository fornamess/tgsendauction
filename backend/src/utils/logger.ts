/**
 * Структурированное логирование
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: Record<string, unknown>;
}

class Logger {
  private shouldLog(level: LogLevel): boolean {
    const envLevel = process.env.LOG_LEVEL || 'INFO';
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const envIndex = levels.indexOf(envLevel as LogLevel);
    const currentIndex = levels.indexOf(level);
    return currentIndex >= envIndex;
  }

  private formatLog(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: unknown
  ): LogEntry {
    const normalizedError: Record<string, unknown> | undefined =
      error && error instanceof Error
        ? {
            message: error.message,
            stack: error.stack,
          }
        : error && typeof error === 'object'
        ? {
            ...(error as Record<string, unknown>),
          }
        : undefined;

    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error: normalizedError,
    };
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: unknown
  ) {
    if (!this.shouldLog(level)) return;

    const logEntry = this.formatLog(level, message, context, error);

    if (level === LogLevel.ERROR) {
      console.error(JSON.stringify(logEntry));
    } else if (level === LogLevel.WARN) {
      console.warn(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, unknown>) {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>) {
    this.log(LogLevel.ERROR, message, context, error);
  }
}

export const logger = new Logger();
