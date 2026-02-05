import { Server as HttpServer, IncomingMessage } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { logBroadcaster, LogEntry, BaseLogger } from '@/logger'
import { config } from '@/config'

const logger = new BaseLogger('WebSocket')

interface ClientConnection {
  ws: WebSocket
  isAlive: boolean
}

let wss: WebSocketServer | null = null
const clients = new Map<WebSocket, ClientConnection>()

function verifyClient(
  info: { origin: string; secure: boolean; req: IncomingMessage },
  callback: (result: boolean, code?: number, message?: string) => void
): void {
  // If no API key is configured, warn and allow access
  if (!config.appApiKey) {
    logger.warn(
      'No API key configured (API_KEY environment variable). WebSocket will be open with no authentication.',
      { origin: info.origin }
    )
    callback(true)
    return
  }

  // Extract API key from query parameters
  const url = new URL(info.req.url || '', `http://${info.req.headers.host}`)
  const providedApiKey = url.searchParams.get('API_KEY')

  // Check if API key was provided
  if (!providedApiKey) {
    logger.warn('WebSocket connection rejected: No API key provided', {
      origin: info.origin,
    })
    callback(false, 401, 'API key required')
    return
  }

  // Validate API key
  if (providedApiKey !== config.appApiKey) {
    logger.warn('WebSocket connection rejected: Invalid API key', {
      origin: info.origin,
    })
    callback(false, 401, 'Invalid API key')
    return
  }

  callback(true)
}

export function setupWebSocketServer(server: HttpServer): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws/logs', verifyClient })

  const unsubscribe = logBroadcaster.subscribe((entry: LogEntry) => {
    clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ type: 'log', data: entry }))
      }
    })
  })

  const pingInterval = setInterval(() => {
    clients.forEach((client, ws) => {
      if (!client.isAlive) {
        ws.terminate()
        clients.delete(ws)
        return
      }
      client.isAlive = false
      ws.ping()
    })
  }, 30000)

  wss.on('connection', (ws: WebSocket) => {
    const clientConnection: ClientConnection = {
      ws,
      isAlive: true,
    }
    clients.set(ws, clientConnection)

    logger.info('WebSocket client connected', { totalClients: clients.size })

    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to log stream',
    }))

    ws.on('pong', () => {
      const client = clients.get(ws)
      if (client) {
        client.isAlive = true
      }
    })

    ws.on('close', () => {
      clients.delete(ws)
      logger.info('WebSocket client disconnected', { totalClients: clients.size })
    })

    ws.on('error', (error) => {
      logger.error('WebSocket error', { error: error.message })
      clients.delete(ws)
    })
  })

  wss.on('close', () => {
    clearInterval(pingInterval)
    unsubscribe()
  })

  logger.info('WebSocket server initialized at /ws/logs')

  return wss
}

export function closeWebSocketServer(): Promise<void> {
  return new Promise((resolve) => {
    if (wss) {
      clients.forEach((_, ws) => {
        ws.close(1001, 'Server shutting down')
      })
      clients.clear()
      wss.close(() => {
        logger.info('WebSocket server closed')
        resolve()
      })
    } else {
      resolve()
    }
  })
}
