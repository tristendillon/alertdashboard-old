import { EventEmitter } from 'events'
import { LogLevel } from '@/config'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: string
  [key: string]: unknown
}

type LogCallback = (entry: LogEntry) => void

class LogBroadcaster extends EventEmitter {
  private static instance: LogBroadcaster

  private constructor() {
    super()
    this.setMaxListeners(100)
  }

  static getInstance(): LogBroadcaster {
    if (!LogBroadcaster.instance) {
      LogBroadcaster.instance = new LogBroadcaster()
    }
    return LogBroadcaster.instance
  }

  broadcast(entry: LogEntry): void {
    this.emit('log', entry)
  }

  subscribe(callback: LogCallback): () => void {
    this.on('log', callback)
    return () => this.off('log', callback)
  }
}

export const logBroadcaster = LogBroadcaster.getInstance()
