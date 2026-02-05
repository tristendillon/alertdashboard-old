import { createServer } from 'http'
import { createApp } from '@/app'
import { config } from '@/config'
import { BaseLogger } from '@/logger'
import { setupWebSocketServer, closeWebSocketServer } from '@/websocket'

const { app, routines } = createApp()
const logger = new BaseLogger('Server')

const httpServer = createServer(app)
setupWebSocketServer(httpServer)

async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down gracefully...`)
  routines.forEach((routine) => routine.stop())
  await closeWebSocketServer()
  httpServer.close(() => {
    logger.info('HTTP server closed')
    process.exit(0)
  })
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

httpServer.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`)
  logger.info(`Environment: ${config.environment}`)
  logger.info(`WebSocket available at ws://localhost:${config.port}/ws/logs`)

  routines.forEach(async (routine) => {
    await routine.start()
  })
})
