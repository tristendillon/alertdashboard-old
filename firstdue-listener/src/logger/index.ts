export { BaseLogger, LogMeta } from './baseLogger'
export { LogLevel } from '@/config'
export { RoutineLogger } from './routineLogger'
export { logBroadcaster, type LogEntry } from './logBroadcaster'
export { LOG_DIR } from './fileLogger'

import winston from 'winston'
import moment from 'moment-timezone'
import chalk from 'chalk'
import { config } from '@/config'

export const winstonInstance = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({
      format: () =>
        moment().tz(config.timezone).format('YYYY-MM-DD HH:mm:ss.SSS Z'),
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf((info: winston.Logform.TransformableInfo) => {
      const { timestamp, level, message, ...meta } = info
      const levelColors: Record<string, typeof chalk.red> = {
        error: chalk.red,
        warn: chalk.yellow,
        info: chalk.blue,
        debug: chalk.gray,
        verbose: chalk.cyan,
      }

      const coloredTimestamp = chalk.gray(timestamp)
      const coloredLevel = (levelColors[level] || chalk.white)(
        level.toUpperCase()
      )
      const coloredMessage = chalk.white(message)
      const coloredMeta =
        Object.keys(meta).length > 0
          ? ' ' + chalk.dim(JSON.stringify(meta, null, 2))
          : ''

      return `${coloredTimestamp} ${coloredLevel} ${coloredMessage}${coloredMeta}`
    })
  ),
  transports: [new winston.transports.Console()],
})
