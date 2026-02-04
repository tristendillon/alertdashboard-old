import { convexToZod, zid, zodToConvex } from 'convex-helpers/server/zod'
import { defineSchema } from 'convex/server'
import { v } from 'convex/values'
import { Table } from 'convex-helpers/server'
import type { Doc, Id } from './_generated/dataModel'
import type { WithoutSystemFields } from 'convex/server'
import { z } from 'zod'
export const DispatchGroupEnumSchema = z.enum([
  'aircraft',
  'fire',
  'hazmat',
  'mva',
  'marine',
  'law',
  'rescue',
  'medical',
  'other',
])
export const Dispatches = z.object({
  dispatchId: z.number(),
  narrative: z.string().optional(),
  type: z.string(),
  address: z.string(),
  address2: z.string().optional(),
  city: z.string().optional(),
  stateCode: z.string().optional(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  unitCodes: z.array(z.string()),
  xrefId: z.string().optional(),
  dispatchGroup: DispatchGroupEnumSchema,
  dispatchType: zid('dispatchTypes').optional(),
  dispatchCreatedAt: z.number(),
})
export const DispatchesValidator = zodToConvex(Dispatches)
export const DispatchesSchema = Dispatches.extend({
  _id: zid('dispatches'),
  _creationTime: z.number(),
})
export const DispatchesTable = Table('dispatches', DispatchesValidator.fields)
export type PostDispatch = Omit<WithoutSystemFields<Doc<'dispatches'>>, 'dispatchGroup'>
export type Dispatch = z.infer<typeof DispatchesSchema> & {
  _id: Id<'dispatches'>
  _creationTime: number
}

export type DispatchGroupEnum = z.infer<typeof DispatchGroupEnumSchema>

export const DispatchTypes = z.object({
  code: z.string(),
  group: DispatchGroupEnumSchema,
  name: z.string().optional(),
  default: z.boolean().optional(),
})

export const DispatchTypesSchema = DispatchTypes.extend({
  _id: zid('dispatchTypes'),
  _creationTime: z.number(),
})

export const DispatchesWithTypeSchema = DispatchesSchema.extend({
  dispatchType: DispatchTypesSchema.optional(),
  icon: z.string().optional(),
  group: DispatchGroupEnumSchema.optional(),
})

export const DispatchTypesValidator = zodToConvex(DispatchTypes)
export const DispatchTypesTable = Table(
  'dispatchTypes',
  DispatchTypesValidator.fields
)
export type DispatchWithType = z.infer<typeof DispatchesWithTypeSchema>

export type DispatchType = z.infer<typeof DispatchTypesSchema>

export const ActiveWeatherAlerts = Table('activeWeatherAlerts', {
  senderName: v.string(),
  event: v.string(),
  start: v.number(),
  end: v.number(),
  description: v.string(),
  tags: v.array(v.string()),
})

export const ActiveWeatherAlertsSchema = convexToZod(
  ActiveWeatherAlerts.table.validator
)
export type PostActiveWeatherAlert = WithoutSystemFields<
  Doc<'activeWeatherAlerts'>
>

export const WeatherDetail = Table('weatherDetails', {
  detailId: v.number(),
  main: v.string(),
  description: v.string(),
  icon: v.string(),
})

export const WeatherDetailSchema = convexToZod(WeatherDetail.table.validator)
export type PostWeatherDetail = WithoutSystemFields<Doc<'weatherDetails'>>

export const WeatherDays = Table('weatherDays', {
  dt: v.number(),
  sunrise: v.number(),
  sunset: v.number(),
  moonrise: v.number(),
  moonset: v.number(),
  moonPhase: v.number(),
  summary: v.string(),
  temp: v.object({
    day: v.number(),
    min: v.number(),
    max: v.number(),
    night: v.number(),
    eve: v.number(),
    morn: v.number(),
  }),
  feelsLike: v.object({
    day: v.number(),
    night: v.number(),
    eve: v.number(),
    morn: v.number(),
  }),
  pressure: v.optional(v.number()),
  humidity: v.optional(v.number()),
  dewPoint: v.optional(v.number()),
  windSpeed: v.optional(v.number()),
  windDeg: v.optional(v.number()),
  windGust: v.optional(v.number()),
  weather: v.array(v.number()),
  clouds: v.optional(v.number()),
  pop: v.optional(v.number()),
  rain: v.optional(v.number()),
  uvi: v.optional(v.number()),
})

export const WeatherDaysSchema = convexToZod(WeatherDays.table.validator)
export type PostWeatherDay = WithoutSystemFields<Doc<'weatherDays'>>

export const WeatherHours = Table('weatherHours', {
  dt: v.number(),
  temp: v.number(),
  feelsLike: v.number(),
  pressure: v.number(),
  humidity: v.number(),
  dewPoint: v.optional(v.number()),
  uvi: v.optional(v.number()),
  clouds: v.optional(v.number()),
  visibility: v.optional(v.number()),
  windSpeed: v.optional(v.number()),
  windDeg: v.optional(v.number()),
  windGust: v.optional(v.number()),
  weather: v.array(v.number()),
  pop: v.optional(v.number()),
})

export const WeatherHoursSchema = convexToZod(WeatherHours.table.validator)
export type PostWeatherHour = WithoutSystemFields<Doc<'weatherHours'>>

// This is like an org field but we dont have an org table

export const CurrentWeather = Table('currentWeather', {
  dt: v.number(),
  sunrise: v.number(),
  sunset: v.number(),
  temp: v.number(),
  feelsLike: v.number(),
  pressure: v.optional(v.number()),
  humidity: v.number(),
  dewPoint: v.optional(v.number()),
  uvi: v.optional(v.number()),
  clouds: v.optional(v.number()),
  visibility: v.optional(v.number()),
  windSpeed: v.optional(v.number()),
  windDeg: v.optional(v.number()),
  windGust: v.optional(v.number()),
  weather: v.array(v.number()),
})

export const CurrentWeatherSchema = convexToZod(CurrentWeather.table.validator)

export type PostCurrentWeather = WithoutSystemFields<Doc<'currentWeather'>>

export const Hydrants = Table('hydrants', {
  hydrantId: v.optional(v.number()),
  address: v.union(v.string(), v.null()),
  numOutlet: v.union(v.number(), v.null()),
  notes: v.union(v.string(), v.null()),
  calculatedFlowRate: v.union(v.string(), v.null()),
  hydrantStatusCode: v.union(v.string(), v.null()),
})

export const HydrantsSchema = convexToZod(Hydrants.table.validator)
export type PostHydrant = WithoutSystemFields<Doc<'hydrants'>> & {
  latitude: number
  longitude: number
}
export type Hydrant = z.infer<typeof HydrantsSchema> & {
  _id: Id<'hydrants'>
  _creationTime: number
}

export const ViewTokens = Table('viewTokens', {
  name: v.string(),
  lastPing: v.number(),
  token: v.string(),
})

export const ViewTokensSchema = convexToZod(ViewTokens.table.validator)
export type ViewToken = z.infer<typeof ViewTokensSchema> & {
  _id: Id<'viewTokens'>
  _creationTime: number
}
export type PostViewToken = WithoutSystemFields<Doc<'viewTokens'>>

// Field Transformations - Reusable transformation definitions
export const FieldTransformationSchema = z.object({
  name: z.string(),
  field: z.string(), // e.g., "location.lat", "address", "narrative"
  strategy: z.enum([
    'static_value',
    'random_offset',
    'random_string',
    'merge_data',
  ]),
  params: z.record(z.any()), // strategy-specific parameters
})

export type FieldTransformation = z.infer<typeof FieldTransformationSchema> & {
  _id: Id<'fieldTransformations'>
  _creationTime: number
}
const FieldTransformationsValidator = zodToConvex(FieldTransformationSchema)
export const FieldTransformations = Table(
  'fieldTransformations',
  FieldTransformationsValidator.fields
)

// Transformation Rules - Rules that reference reusable transformations
export const TransformationRuleSchema = z.object({
  name: z.string(),
  dispatchTypeRegex: z.string(),
  keywords: z.array(z.string()),
  dispatchTypes: z.array(zid('dispatchTypes')),
  transformations: z.array(zid('fieldTransformations')), // references to reusable transformations
})

export type TransformationRule = z.infer<typeof TransformationRuleSchema> & {
  _id: Id<'transformationRules'>
  _creationTime: number
}
const TransformationRulesValidator = zodToConvex(TransformationRuleSchema)
export const TransformationRules = Table(
  'transformationRules',
  TransformationRulesValidator.fields
)

// Transformation Rule Mapping - Denormalized table for efficient lookups
export const TransformationRuleMappingSchema = z.object({
  transformationId: zid('fieldTransformations'),
  ruleId: zid('transformationRules'),
})

export type TransformationRuleMapping = z.infer<
  typeof TransformationRuleMappingSchema
>
const TransformationRuleMappingValidator = zodToConvex(
  TransformationRuleMappingSchema
)
export const TransformationRuleMappings = Table(
  'transformationRuleMappings',
  TransformationRuleMappingValidator.fields
)

export default defineSchema({
  dispatches: DispatchesTable.table
    .searchIndex('by_narrative', {
      searchField: 'narrative',
      filterFields: ['address', 'dispatchGroup', 'unitCodes'],
    })
    .index('by_dispatchId', ['dispatchId'])
    .index('by_dispatchCreatedAt', ['dispatchCreatedAt'])
    .index('by_xrefId', ['xrefId']),
  activeWeatherAlerts: ActiveWeatherAlerts.table
    .index('by_event', ['event'])
    .index('by_tags', ['tags'])
    .index('by_senderName', ['senderName']),
  weatherDays: WeatherDays.table.index('by_dt', ['dt']),
  weatherHours: WeatherHours.table.index('by_dt', ['dt']),
  weatherDetails: WeatherDetail.table.index('by_detailId', ['detailId']),
  currentWeather: CurrentWeather.table,
  hydrants: Hydrants.table.index('by_hydrantId', ['hydrantId']),

  viewTokens: ViewTokens.table
    .index('by_token', ['token'])
    .index('by_name', ['name']),
  fieldTransformations: FieldTransformations.table
    .index('by_name', ['name'])
    .index('by_field', ['field'])
    .index('by_strategy', ['strategy']),
  transformationRules: TransformationRules.table
    .index('by_name', ['name'])
    .index('by_transformations', ['transformations']),
  transformationRuleMappings: TransformationRuleMappings.table
    .index('by_transformation', ['transformationId'])
    .index('by_rule', ['ruleId']),
  dispatchTypes: DispatchTypesTable.table.index('by_code', ['code']),
})
