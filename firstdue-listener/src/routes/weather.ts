import {
  RoutineRouter,
  RoutineRouterOptions,
  RoutineStats,
} from './routineRouter'
import { api } from '@sizeupdashboard/convex/src/api/_generated/api.js'
import {
  PostActiveWeatherAlert,
  PostWeatherHour,
  PostWeatherDay,
  PostCurrentWeather,
  PostWeatherDetail,
} from '@sizeupdashboard/convex/src/api/schema'
import { config } from '@/config'
import { Request, Response } from 'express'
import { FormattedDateTime, formatDateTime } from '@/lib/utils'
import { Id } from '@sizeupdashboard/convex/src/api/_generated/dataModel'
import { createDefaultRetryStats } from '@/lib/fetch-with-retry'

const WEATHER_INTERVAL = 60_000 * 15 // 15 minutes
const WEATHER_NAME = 'Weather'

interface OpenMapWeatherMeta {
  id: number
  main: string
  description: string
  icon: string
}

interface OpenMapWeatherHourly {
  dt: number
  temp: number
  feels_like: number
  pressure: number
  humidity: number
  dew_point: number
  uvi: number
  clouds: number
  visibility: number
  wind_speed: number
  wind_deg: number
  wind_gust: number
  weather: OpenMapWeatherMeta[]
  pop: number
}

interface OpenMapWeatherDaily {
  dt: number
  sunrise: number
  sunset: number
  moonrise: number
  moonset: number
  moon_phase: number
  summary: string
  temp: {
    day: number
    min: number
    max: number
    night: number
    eve: number
    morn: number
  }
  feels_like: {
    day: number
    night: number
    eve: number
    morn: number
  }
  pressure: number
  humidity: number
  dew_point: number
  wind_speed: number
  wind_deg: number
  wind_gust: number
  weather: OpenMapWeatherMeta[]
  clouds: number
  pop: number
  rain?: number
  uvi: number
}

interface OpenMapWeatherAlerts {
  sender_name: string
  event: string
  start: number
  end: number
  description: string
  tags: string[]
}

interface OpenMapWeatherCurrent {
  dt: number
  sunrise: number
  sunset: number
  temp: number
  feels_like: number
  pressure: number
  humidity: number
  dew_point: number
  uvi: number
  clouds: number
  visibility: number
  wind_speed: number
  wind_deg: number
  wind_gust: number
  weather: OpenMapWeatherMeta[]
}

interface OpenMapWeather {
  lat: number
  lon: number
  timezone: string
  timezone_offset: number
  current: OpenMapWeatherCurrent
  hourly: OpenMapWeatherHourly[]
  daily: OpenMapWeatherDaily[]
  alerts: OpenMapWeatherAlerts[]
}

interface ConvexWeatherData {
  hours: PostWeatherHour[]
  days: PostWeatherDay[]
  current: PostCurrentWeather
  alerts?: PostActiveWeatherAlert[]
}

interface WeatherStats extends RoutineStats {
  totalHoursProcessed: number
  totalDaysProcessed: number
  totalAlertsProcessed: number
  totalWeatherDetailsProcessed: number
  totalCurrentWeatherUpdates: number
  totalDataPointsDeleted: number
  lastFetchTime?: FormattedDateTime
  lastUpdateTime?: FormattedDateTime
  averageApiResponseTime?: number
  averageProcessingTime?: number
  uniqueWeatherDetailsCount: number
}

export class WeatherRoutineRouter extends RoutineRouter {
  protected readonly interval: number = WEATHER_INTERVAL
  public stats = this.defaultStats()
  private oldWeatherIds: string[] = []
  private weatherDetails: Set<number> = new Set()
  private apiResponseTimes: number[] = []
  private processingTimes: number[] = []
  private readonly maxTimeHistory = 10

  constructor(options: RoutineRouterOptions = {}) {
    super(WEATHER_NAME, {
      ...options,
      onStart: async () => {
        this.validateConfiguration()
        await this.deleteOldWeatherDataWithoutIds()
        await this.getAllWeatherDetails()
        await options.onStart?.()
      },
      onStop: async () => {
        await options.onStop?.()
      },
    })
  }

  protected defaultStats(): WeatherStats {
    return {
      apiCallCount: 0,
      totalHoursProcessed: 0,
      totalDaysProcessed: 0,
      totalAlertsProcessed: 0,
      totalWeatherDetailsProcessed: 0,
      totalCurrentWeatherUpdates: 0,
      totalDataPointsDeleted: 0,
      errorCount: 0,
      uniqueWeatherDetailsCount: 0,
      retryStats: createDefaultRetryStats(),
    }
  }

  protected defineRoutes(): void {
    // Get configuration status
    this.addRoute('get', '/config', this.handleGetConfig.bind(this))

    // Test Weather API connectivity
    this.addRoute(
      'get',
      '/test-connection',
      this.handleTestConnection.bind(this)
    )

    // Get current weather details cache info
    this.addRoute(
      'get',
      '/weather-details',
      this.handleGetWeatherDetails.bind(this)
    )

    // Force delete old weather data
    this.addRoute('post', '/cleanup', this.handleCleanup.bind(this))

  }

  public async execute(): Promise<void> {
    const executionTimer = this.ctx.logger.perf.start({
      id: 'weatherExecutionFull',
      onStart: () => {
        this.ctx.logger.info('Starting weather data update cycle')
      },
      printf: (duration: number) =>
        `Weather execution cycle completed in ${duration}ms`,
    })

    try {
      this.validateConfiguration()
      await this.deleteOldWeatherData()

      const weatherData = await this.getWeatherData()
      if (!weatherData) {
        this.ctx.logger.error('No weather data found, skipping update cycle')
        this.stats.errorCount++
        return
      }

      const weatherDetails = await this.pushWeatherDetails(weatherData)
      await this.insertWeatherDetails(weatherDetails)

      const convexWeatherData = this.parseWeatherData(weatherData)
      const ids = await this.insertWeatherData(convexWeatherData)

      this.oldWeatherIds = [
        ...ids.hours,
        ...ids.days,
        ids.current,
        ...ids.alerts,
      ]
      this.stats.lastUpdateTime = formatDateTime(new Date())

      // Track processing time
      const processingTime = executionTimer.getCurrentDuration()
      this.processingTimes.push(processingTime)
      if (this.processingTimes.length > this.maxTimeHistory) {
        this.processingTimes.shift()
      }

      this.ctx.logger.info('Weather update cycle completed successfully')
    } catch (error) {
      this.stats.errorCount++
      this.ctx.logger.error('Weather execution cycle failed', {
        error,
      })
      throw error
    } finally {
      executionTimer.end()
    }
  }

  // ==================== ROUTE HANDLERS ====================

  private async handleResetStats(req: Request, res: Response): Promise<void> {
    this.stats = this.defaultStats()
    this.apiResponseTimes = []
    this.processingTimes = []
    this.ctx.logger.info('Weather statistics reset')

    res.json({
      message: 'Weather statistics reset successfully',
      stats: this.stats,
    })
  }

  private async handleGetConfig(req: Request, res: Response): Promise<void> {
    res.json({
      hasApiKey: !!config.weather.apiKey,
      hasLat: !!config.weather.lat,
      hasLng: !!config.weather.lng,
      units: config.weather.units,
      interval: this.interval,
      intervalFormatted: this.getStatus().interval.formatted,
      coordinates: {
        lat: config.weather.lat,
        lng: config.weather.lng,
      },
    })
  }

  private async handleTestConnection(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      this.validateConfiguration()
      const url = this.getWeatherUrl()

      const testTimer = this.ctx.logger.perf.start({
        id: 'testWeatherConnection',
        printf: (duration: number) =>
          `Weather API connection test completed in ${duration}ms`,
      })

      this.ctx.logger.info('Testing Weather API connection', {
        url: url.replace(/appid=[^&]+/, 'appid=***'),
      })

      const response = await fetch(url)
      const responseTime = testTimer.end()

      if (!response.ok) {
        throw new Error(
          `API returned ${response.status}: ${response.statusText}`
        )
      }

      const data = await response.json()

      res.json({
        message: 'Weather API connection successful',
        status: response.status,
        responseTime: responseTime,
        dataPreview: {
          timezone: data.timezone,
          currentTemp: data.current?.temp,
          hourlyCount: data.hourly?.length || 0,
          dailyCount: data.daily?.length || 0,
          alertsCount: data.alerts?.length || 0,
        },
        headers: Object.fromEntries(response.headers.entries()),
      })
    } catch (error) {
      this.stats.errorCount++
      this.ctx.logger.error('Weather API connection test failed', {
        error,
      })
      throw error
    }
  }

  private async handleGetWeatherDetails(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const detailsTimer = this.ctx.logger.perf.start({
        id: 'getWeatherDetailsInfo',
        printf: (duration: number) =>
          `Retrieved weather details info in ${duration}ms`,
      })

      const dbDetails = await this.ctx.client.query(
        api.weather.getWeatherDetails,
        {}
      )
      detailsTimer.end()

      res.json({
        cache: {
          size: this.weatherDetails.size,
          details: Array.from(this.weatherDetails),
        },
        database: {
          count: dbDetails.length,
          sample: dbDetails.slice(0, 10).map((d) => ({
            id: d.detailId,
            main: d.main,
            description: d.description,
          })),
        },
      })
    } catch (error) {
      this.stats.errorCount++
      throw error
    }
  }

  private async handleCleanup(req: Request, res: Response): Promise<void> {
    try {
      this.ctx.logger.info('Manual cleanup requested via API')

      const cleanupTimer = this.ctx.logger.perf.start({
        id: 'manualCleanup',
        printf: (duration: number) =>
          `Manual cleanup completed in ${duration}ms`,
      })

      await this.deleteOldWeatherDataWithoutIds()
      const oldIdsDeleted = this.oldWeatherIds.length
      await this.deleteOldWeatherData()

      cleanupTimer.end()

      res.json({
        message: 'Cleanup completed successfully',
        deletedOldIds: oldIdsDeleted,
        stats: this.calculateCurrentStats(),
      })
    } catch (error) {
      this.stats.errorCount++
      throw error
    }
  }

  // ==================== CORE BUSINESS LOGIC ====================

  protected async pushWeatherDetails(
    data: OpenMapWeather
  ): Promise<PostWeatherDetail[]> {
    const weatherDetails: PostWeatherDetail[] = []

    const addWeatherDetail = (weather: OpenMapWeatherMeta) => {
      if (this.weatherDetails.has(weather.id)) return

      this.weatherDetails.add(weather.id)
      const weatherDetail = {
        detailId: weather.id,
        main: weather.main,
        description: weather.description,
        icon: weather.icon,
      }
      weatherDetails.push(weatherDetail)
    }

    // Process hourly weather details
    for (const hour of data.hourly) {
      for (const weather of hour.weather) {
        addWeatherDetail(weather)
      }
    }

    // Process daily weather details
    for (const day of data.daily) {
      for (const weather of day.weather) {
        addWeatherDetail(weather)
      }
    }

    // Process current weather details
    for (const weather of data.current.weather) {
      addWeatherDetail(weather)
    }
    return weatherDetails
  }

  private getWeatherUrl(): string {
    this.validateConfiguration()
    const { lat, lng, apiKey, units } = config.weather
    return `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lng}&appid=${apiKey}&units=${units}`
  }

  protected async getWeatherData(): Promise<OpenMapWeather | null> {
    const url = this.getWeatherUrl()
    const safeUrl = url.replace(/appid=[^&]+/, 'appid=***')

    const fetchTimer = this.ctx.logger.perf.start({
      id: 'fetchWeatherData',
      onStart: () => {
        this.ctx.logger.info('Fetching weather data from OpenWeatherMap API', {
          url: safeUrl,
        })
      },
      printf: (duration: number) =>
        `Weather API call completed in ${duration}ms`,
    })

    try {
      const res = await this.fetchWithRetry(url)
      const responseTime = fetchTimer.end()

      // Track API response time
      this.apiResponseTimes.push(responseTime)
      if (this.apiResponseTimes.length > this.maxTimeHistory) {
        this.apiResponseTimes.shift()
      }

      if (!res.ok) {
        this.ctx.logger.error('Failed to fetch weather data from API', {
          status: res.status,
          statusText: res.statusText,
          url: safeUrl,
        })
        this.stats.errorCount++
        return null
      }

      const data = (await res.json()) as OpenMapWeather
      this.stats.lastFetchTime = formatDateTime(new Date())

      this.ctx.logger.info('Weather data fetched successfully')

      return data
    } catch (error) {
      this.stats.errorCount++
      this.ctx.logger.error('Weather API fetch failed', {
        error: (error as Error).message,
        url: safeUrl,
      })
      fetchTimer.end()
      return null
    }
  }

  protected parseWeatherData(data: OpenMapWeather): ConvexWeatherData {
    const convexData: ConvexWeatherData = {
      hours: data.hourly.map((hour) => ({
        dt: hour.dt * 1000,
        temp: hour.temp,
        feelsLike: hour.feels_like,
        pressure: hour.pressure,
        humidity: hour.humidity,
        dewPoint: hour.dew_point,
        windSpeed: hour.wind_speed,
        windDeg: hour.wind_deg,
        windGust: hour.wind_gust,
        weather: hour.weather.map((weather) => weather.id),
        clouds: hour.clouds,
        pop: hour.pop,
        uvi: hour.uvi,
        visibility: hour.visibility,
      })),
      days: data.daily.map((day) => ({
        dt: day.dt * 1000,
        sunrise: day.sunrise,
        sunset: day.sunset,
        moonrise: day.moonrise,
        moonset: day.moonset,
        moonPhase: day.moon_phase,
        summary: day.summary,
        temp: {
          day: day.temp.day,
          min: day.temp.min,
          max: day.temp.max,
          night: day.temp.night,
          eve: day.temp.eve,
          morn: day.temp.morn,
        },
        feelsLike: {
          day: day.feels_like.day,
          night: day.feels_like.night,
          eve: day.feels_like.eve,
          morn: day.feels_like.morn,
        },
        pressure: day.pressure,
        humidity: day.humidity,
        dewPoint: day.dew_point,
        windSpeed: day.wind_speed,
        windDeg: day.wind_deg,
        windGust: day.wind_gust,
        weather: day.weather.map((weather) => weather.id),
        clouds: day.clouds,
        pop: day.pop,
        uvi: day.uvi,
        rain: day.rain,
      })),
      current: {
        dt: data.current.dt * 1000,
        sunrise: data.current.sunrise,
        sunset: data.current.sunset,
        temp: data.current.temp,
        feelsLike: data.current.feels_like,
        pressure: data.current.pressure,
        humidity: data.current.humidity,
        dewPoint: data.current.dew_point,
        windSpeed: data.current.wind_speed,
        windDeg: data.current.wind_deg,
        windGust: data.current.wind_gust,
        weather: data.current.weather.map((weather) => weather.id),
        clouds: data.current.clouds,
        uvi: data.current.uvi,
        visibility: data.current.visibility,
      },
      alerts: data.alerts?.map((alert) => ({
        senderName: alert.sender_name,
        event: alert.event,
        start: alert.start * 1000,
        end: alert.end * 1000,
        description: alert.description,
        tags: alert.tags,
      })),
    }

    return convexData
  }

  private validateConfiguration(): void {
    if (!config.weather.apiKey) {
      throw new Error('WEATHER_API_KEY is not configured')
    }
    if (!config.weather.lat) {
      throw new Error('WEATHER_LAT is not configured')
    }
    if (!config.weather.lng) {
      throw new Error('WEATHER_LNG is not configured')
    }
  }

  private async deleteOldWeatherData(): Promise<void> {
    if (this.oldWeatherIds.length === 0) {
      this.ctx.logger.info('No old weather data to delete')
      return
    }

    const deleteTimer = this.ctx.logger.perf.start({
      id: 'deleteOldWeatherData',
      onStart: () => {
        this.ctx.logger.info(
          `Deleting ${this.oldWeatherIds.length} old weather data points`
        )
      },
      printf: (duration: number) =>
        `Deleted ${this.oldWeatherIds.length} old weather data points in ${duration}ms`,
    })

    try {
      await this.ctx.client.mutation(api.weather.deleteWeatherData, {
        ids: this.oldWeatherIds as Id<
          | 'weatherHours'
          | 'weatherDays'
          | 'currentWeather'
          | 'activeWeatherAlerts'
        >[],
        apiKey: config.convexApiKey,
      })

      this.stats.totalDataPointsDeleted += this.oldWeatherIds.length
      this.ctx.logger.info('Old weather data deleted successfully')
    } catch (error) {
      this.ctx.logger.error('Failed to delete old weather data', {
        error,
      })
      this.stats.errorCount++
      throw error
    } finally {
      deleteTimer.end()
    }
  }

  private async deleteOldWeatherDataWithoutIds(): Promise<void> {
    const deleteTimer = this.ctx.logger.perf.start({
      id: 'deleteOldWeatherDataWithoutIds',
      printf: (duration: number) =>
        `Cleaned up old weather data in ${duration}ms`,
    })

    try {
      await this.ctx.client.mutation(api.weather.deleteWeatherDataWithoutIds, {
        apiKey: config.convexApiKey,
      })
      this.ctx.logger.info('Old weather data cleanup completed')
    } catch (error) {
      this.ctx.logger.error('Failed to cleanup old weather data', {
        error,
      })
      this.stats.errorCount++
      throw error
    } finally {
      deleteTimer.end()
    }
  }

  private async getAllWeatherDetails(): Promise<void> {
    const detailsTimer = this.ctx.logger.perf.start({
      id: 'getAllWeatherDetails',
      onStart: () => {
        this.ctx.logger.info('Loading existing weather details from database')
      },
      printf: (duration: number) => `Loaded weather details in ${duration}ms`,
    })

    try {
      const weatherDetails = await this.ctx.client.query(
        api.weather.getWeatherDetails,
        {}
      )
      this.weatherDetails = new Set(
        weatherDetails.map((detail) => detail.detailId)
      )

      this.ctx.logger.info('Weather details loaded successfully')
    } catch (error) {
      this.ctx.logger.error('Failed to load weather details', {
        error,
      })
      this.stats.errorCount++
      throw error
    } finally {
      detailsTimer.end()
    }
  }

  private async insertWeatherData(data: ConvexWeatherData): Promise<{
    hours: Id<'weatherHours'>[]
    days: Id<'weatherDays'>[]
    current: Id<'currentWeather'>
    alerts: Id<'activeWeatherAlerts'>[]
  }> {
    const insertTimer = this.ctx.logger.perf.start({
      id: 'insertWeatherData',
      onStart: () => {
        this.ctx.logger.info('Inserting weather data into database')
      },
      printf: (duration: number) => `Inserted weather data in ${duration}ms`,
    })

    try {
      const ids = await this.ctx.client.mutation(api.weather.createWeather, {
        current: data.current,
        hours: data.hours,
        days: data.days,
        alerts: data.alerts || [],
        apiKey: config.convexApiKey,
      })

      // Update statistics
      this.stats.totalHoursProcessed += data.hours.length
      this.stats.totalDaysProcessed += data.days.length
      this.stats.totalAlertsProcessed += data.alerts?.length || 0
      this.stats.totalCurrentWeatherUpdates += 1

      this.ctx.logger.info('Weather data inserted successfully')

      return ids
    } catch (error) {
      this.ctx.logger.error('Failed to insert weather data', {
        error,
      })
      this.stats.errorCount++
      throw error
    } finally {
      insertTimer.end()
    }
  }

  private async insertWeatherDetails(data: PostWeatherDetail[]): Promise<void> {
    if (data.length === 0) {
      this.ctx.logger.debug('No new weather details to insert')
      return
    }

    const insertTimer = this.ctx.logger.perf.start({
      id: 'insertWeatherDetails',
      onStart: () => {
        this.ctx.logger.info(`Inserting ${data.length} new weather details`)
      },
      printf: (duration: number) =>
        `Inserted ${data.length} weather details in ${duration}ms`,
    })

    try {
      await this.ctx.client.mutation(api.weather.createWeatherDetails, {
        details: data,
        apiKey: config.convexApiKey,
      })

      this.stats.totalWeatherDetailsProcessed += data.length
      this.ctx.logger.info('Weather details inserted successfully')
    } catch (error) {
      this.ctx.logger.error('Failed to insert weather details', {
        error,
      })
      this.stats.errorCount++
      throw error
    } finally {
      insertTimer.end()
    }
  }

  // ==================== STATISTICS CALCULATION ====================

  private calculateCurrentStats(): WeatherStats {
    const averageApiResponseTime =
      this.apiResponseTimes.length > 0
        ? this.apiResponseTimes.reduce((sum, time) => sum + time, 0) /
          this.apiResponseTimes.length
        : undefined

    const averageProcessingTime =
      this.processingTimes.length > 0
        ? this.processingTimes.reduce((sum, time) => sum + time, 0) /
          this.processingTimes.length
        : undefined

    return {
      ...this.stats,
      uniqueWeatherDetailsCount: this.weatherDetails.size,
      averageApiResponseTime: averageApiResponseTime
        ? Math.round(averageApiResponseTime * 100) / 100
        : undefined,
      averageProcessingTime: averageProcessingTime
        ? Math.round(averageProcessingTime * 100) / 100
        : undefined,
    }
  }

  // ==================== PUBLIC GETTERS ====================

  public get weatherStats(): WeatherStats {
    return this.calculateCurrentStats()
  }

  public get currentWeatherDetailsCount(): number {
    return this.weatherDetails.size
  }

  public get oldWeatherIdsCount(): number {
    return this.oldWeatherIds.length
  }
}
