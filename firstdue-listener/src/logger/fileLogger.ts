import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import Transport from 'winston-transport'
import moment from 'moment-timezone'
import { config, type LogLevel } from '@/config'
import { logBroadcaster, LogEntry } from './logBroadcaster'

export const LOG_DIR = config.logDir

interface BroadcastInfo {
  timestamp?: string
  level: LogLevel
  message: string
  context?: string
  [key: string]: unknown
}

class BroadcastTransport extends Transport {
  log(info: BroadcastInfo, callback: () => void): void {
    setImmediate(() => {
      const { timestamp, level, message, context, ...meta } = info
      const entry: LogEntry = {
        timestamp:
          timestamp ||
          moment().tz(config.timezone).format('YYYY-MM-DD HH:mm:ss.SSS Z'),
        level,
        message,
        context,
        ...meta,
      }
      logBroadcaster.broadcast(entry)
    })
    callback()
  }
}

const jsonFormat = winston.format.combine(
  winston.format.timestamp({
    format: () =>
      moment().tz(config.timezone).format('YYYY-MM-DD HH:mm:ss.SSS Z'),
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
)

export const appRotateTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: 'app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: config.logMaxSize,
  maxFiles: `${config.logRetentionDays}d`,
  format: jsonFormat,
})

export const errorRotateTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: 'error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: config.logMaxSize,
  maxFiles: '30d',
  level: 'error',
  format: jsonFormat,
})

export const broadcastTransport = new BroadcastTransport()

export const fileTransports = [
  appRotateTransport,
  errorRotateTransport,
  broadcastTransport,
]
