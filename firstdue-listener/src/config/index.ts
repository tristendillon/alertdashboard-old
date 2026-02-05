import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

export type LogLevel = 'error' | 'warn' | 'info' | 'timer' | 'debug' | 'verbose'
export type Environment = 'development' | 'production' | 'test'

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  environment: (process.env.NODE_ENV || 'development') as Environment,
  timezone: process.env.TIMEZONE || 'America/Chicago',
  logLevel: (process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === 'development' ? 'debug' : 'info')) as LogLevel,
  logDir: process.env.LOG_DIR || '/app/logs',
  logMaxSize: process.env.LOG_MAX_SIZE || '50m',
  logRetentionDays: process.env.LOG_RETENTION_DAYS || '14',
  firstdueApiKey: process.env.FIRSTDUE_API_KEY,
  firstdueApiUrl: 'https://sizeup.firstduesizeup.com/fd-api/v1',
  weather: {
    lat: process.env.WEATHER_LAT || '',
    lng: process.env.WEATHER_LNG || '',
    apiKey: process.env.WEATHER_API_KEY || '',
    units: process.env.WEATHER_UNITS || 'imperial',
  },
  convexUrl: process.env.CONVEX_URL || '',
  convexApiKey: process.env.CONVEX_API_KEY || '',
  deploymentSha: process.env.GITHUB_COMMIT_SHA || 'local-deployment',
  appApiKey: process.env.API_KEY || undefined,
}
