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
  context?: any;
  error?: any;
}

class Logger {
  private shouldLog(level: LogLevel): boolean {
    const envLevel = process.env.LOG_LEVEL || 'INFO';
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const envIndex = levels.indexOf(envLevel as LogLevel);
    const currentIndex = levels.indexOf(level);
    return currentIndex >= envIndex;
  }

  private formatLog(level: LogLevel, message: string, context?: any, error?: any): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error: error ? {
        message: error.message,
        stack: error.stack,
        ...error,
      } : undefined,
    };
  }

  private log(level: LogLevel, message: string, context?: any, error?: any) {
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

  debug(message: string, context?: any) {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: any) {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: any) {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: any, context?: any) {
    this.log(LogLevel.ERROR, message, context, error);
  }
}

export const logger = new Logger();
