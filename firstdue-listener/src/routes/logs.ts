import { Router, Request, Response } from 'express'
import { promises as fs } from 'fs'
import path from 'path'
import readline from 'readline'
import { createReadStream } from 'fs'
import { LOG_DIR, LogEntry } from '@/logger'
import { config } from '@/config'

export const logsRouter: Router = Router()

interface LogsQuery {
  limit?: string
  offset?: string
  level?: string
  context?: string
  since?: string
  until?: string
  search?: string
}

interface LogFile {
  name: string
  size: number
  modified: Date
}

async function getLogFiles(): Promise<LogFile[]> {
  try {
    const files = await fs.readdir(LOG_DIR)
    const logFiles: LogFile[] = []

    for (const file of files) {
      if (file.endsWith('.log')) {
        const filePath = path.join(LOG_DIR, file)
        const stat = await fs.stat(filePath)
        logFiles.push({
          name: file,
          size: stat.size,
          modified: stat.mtime,
        })
      }
    }

    return logFiles.sort((a, b) => b.modified.getTime() - a.modified.getTime())
  } catch {
    return []
  }
}

async function readLogFile(filePath: string): Promise<LogEntry[]> {
  const logs: LogEntry[] = []

  return new Promise((resolve) => {
    const stream = createReadStream(filePath)
    const rl = readline.createInterface({ input: stream })

    rl.on('line', (line) => {
      try {
        const entry = JSON.parse(line) as LogEntry
        logs.push(entry)
      } catch {
        // Skip malformed lines
      }
    })

    rl.on('close', () => resolve(logs))
    rl.on('error', () => resolve(logs))
  })
}

function filterLogs(
  logs: LogEntry[],
  query: LogsQuery
): LogEntry[] {
  let filtered = logs

  if (query.level) {
    const levels = query.level.split(',')
    filtered = filtered.filter((log) => levels.includes(log.level))
  }

  if (query.context) {
    const contexts = query.context.split(',')
    filtered = filtered.filter(
      (log) => log.context && contexts.includes(log.context)
    )
  }

  if (query.since) {
    const since = new Date(query.since)
    filtered = filtered.filter((log) => new Date(log.timestamp) >= since)
  }

  if (query.until) {
    const until = new Date(query.until)
    filtered = filtered.filter((log) => new Date(log.timestamp) <= until)
  }

  if (query.search) {
    const searchLower = query.search.toLowerCase()
    filtered = filtered.filter(
      (log) =>
        log.message.toLowerCase().includes(searchLower) ||
        JSON.stringify(log).toLowerCase().includes(searchLower)
    )
  }

  return filtered
}

logsRouter.get('/', async (req: Request<unknown, unknown, unknown, LogsQuery>, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 1000)
    const offset = parseInt(req.query.offset || '0', 10)

    const logFiles = await getLogFiles()
    const appLogs = logFiles.filter((f) => f.name.startsWith('app-'))

    let allLogs: LogEntry[] = []
    for (const file of appLogs.slice(0, 7)) {
      const filePath = path.join(LOG_DIR, file.name)
      const logs = await readLogFile(filePath)
      allLogs = allLogs.concat(logs)
    }

    allLogs.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    const filtered = filterLogs(allLogs, req.query)
    const paginated = filtered.slice(offset, offset + limit)

    res.json({
      logs: paginated,
      total: filtered.length,
      limit,
      offset,
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to read logs' })
  }
})

logsRouter.get('/files', async (_req: Request, res: Response) => {
  try {
    const files = await getLogFiles()
    res.json({ files })
  } catch (error) {
    res.status(500).json({ error: 'Failed to list log files' })
  }
})

logsRouter.get('/stream-info', (_req: Request, res: Response) => {
  res.json({
    websocket: {
      path: '/ws/logs',
      port: config.port,
      description: 'Connect to receive real-time log updates',
      filterExample: {
        levels: ['error', 'warn'],
        contexts: ['Dispatch'],
      },
    },
  })
})
