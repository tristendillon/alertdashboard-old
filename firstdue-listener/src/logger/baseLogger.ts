import winston from 'winston'
import moment from 'moment-timezone'
import chalk from 'chalk'
import { config, LogLevel } from '@/config'
import { fileTransports } from './fileLogger'

export type LogMeta = Record<string, unknown>

interface PerfOptions {
  level?: LogLevel
  id?: string
  onStart?: () => void
  printf?: (duration: number) => string
}

interface PerfInstance {
  getCurrentDuration(): number
  logNow(decimals?: number): number
  end(decimals?: number): number
}

class Perf {
  private logger: winston.Logger
  private timerCounter = 0

  constructor(logger: winston.Logger) {
    this.logger = logger
  }

  start(options: PerfOptions = {}): PerfInstance {
    const startTime = performance.now()
    const timerId = options.id || `timer_${++this.timerCounter}`

    const getCurrentDuration = () => {
      return performance.now() - startTime
    }

    const logNow = (decimals: number = 2) => {
      const currentDuration = performance.now() - startTime
      const message = options.printf
        ? options.printf(Number(currentDuration.toFixed(decimals)))
        : `Timer "${timerId}" current duration: ${currentDuration.toFixed(
            decimals
          )}ms`

      this.logger.log('timer', message)
      return currentDuration
    }

    const end = (decimals: number = 2) => {
      const duration = performance.now() - startTime
      const message = options.printf
        ? options.printf(Number(duration.toFixed(decimals)))
        : `Timer "${timerId}" completed in ${duration.toFixed(decimals)}ms`

      this.logger.log('timer', message)
      return duration
    }

    if (options.onStart) {
      options.onStart()
    }

    return { getCurrentDuration, logNow, end }
  }
}

interface LogInfo {
  timestamp: string
  level: LogLevel
  message: string
  context?: string
  [key: string]: unknown
}

export class BaseLogger {
  protected logger: winston.Logger
  public perf: Perf
  private context?: string

  constructor(context?: string) {
    this.context = context
    this.logger = winston.createLogger({
      level: config.logLevel,
      levels: {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3,
        timer: 4,
        verbose: 5,
      },
      format: winston.format.combine(
        winston.format.timestamp({
          format: () =>
            moment().tz(config.timezone).format('YYYY-MM-DD HH:mm:ss.SSS Z'),
        }),
        winston.format.errors({ stack: true }),
        winston.format.printf((info: winston.Logform.TransformableInfo) => {
          const { timestamp, level, message, context, ...meta } =
            info as unknown as LogInfo
          const levelColors: Record<LogLevel, typeof chalk.red> = {
            error: chalk.red,
            warn: chalk.yellow,
            info: chalk.blue,
            timer: chalk.green,
            debug: chalk.gray,
            verbose: chalk.cyan,
          }

          const coloredTimestamp = chalk.gray(timestamp)
          const displayLevel = level === 'timer' ? 'TIMER' : level.toUpperCase()
          const coloredLevel = (levelColors[level] || chalk.white)(displayLevel)
          const coloredContext = context
            ? chalk.magenta(`[${context}]`) + ' '
            : ''
          const coloredMessage = chalk.white(message)
          const coloredMeta =
            Object.keys(meta).length > 0
              ? ' ' + chalk.dim(JSON.stringify(meta, null, 2))
              : ''

          return `${coloredTimestamp} ${coloredLevel} ${coloredContext}${coloredMessage}${coloredMeta}`
        })
      ),
      defaultMeta: context ? { context } : {},
      transports: [new winston.transports.Console(), ...fileTransports],
    })
    this.perf = new Perf(this.logger)
  }

  info(message: string, meta?: LogMeta): void {
    this.logger.info(message, meta)
  }

  warn(message: string, meta?: LogMeta): void {
    this.logger.warn(message, meta)
  }

  error(message: string, meta?: LogMeta): void {
    this.logger.error(message, meta)
  }

  debug(message: string, meta?: LogMeta): void {
    this.logger.debug(message, meta)
  }

  timer(message: string, meta?: LogMeta): void {
    this.logger.log('timer', message, meta)
  }

  getWinstonInstance(): winston.Logger {
    return this.logger
  }
}
