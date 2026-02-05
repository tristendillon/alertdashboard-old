import { Server as HttpServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { logBroadcaster, LogEntry, BaseLogger } from '@/logger'

const logger = new BaseLogger('WebSocket')

interface ClientConnection {
  ws: WebSocket
  isAlive: boolean
}

let wss: WebSocketServer | null = null
const clients = new Map<WebSocket, ClientConnection>()

export function setupWebSocketServer(server: HttpServer): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws/logs' })

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
