import { v } from 'convex/values'
import {
  authedOrThrowMutation,
  authedOrThrowQuery,
  queryWithAuthStatus,
} from '../lib/auth'
import { internalMutation } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { paginationOptsValidator } from 'convex/server'
import { emptyPage } from '../lib/pagination'

// A client is "online" if it pinged within this window; the cleanup cron
// deletes rows older than it. Keep in sync with the client heartbeat (30s).
const ONLINE_WINDOW_MS = 90_000

export const createViewToken = authedOrThrowMutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, { name }) => {
    return await ctx.db.insert('viewTokens', {
      name,
      lastPing: Date.now(),
      token: crypto.randomUUID(),
    })
  },
})

// Only the name is editable: `token` is generated server-side at creation and
// viewers authenticate with it, so reassigning it would silently lock out every
// kiosk already using it.
export const updateViewToken = authedOrThrowMutation({
  args: {
    id: v.id('viewTokens'),
    name: v.string(),
  },
  handler: async (ctx, { id, name }) => {
    return await ctx.db.patch(id, { name })
  },
})

export const deleteViewToken = authedOrThrowMutation({
  args: {
    id: v.id('viewTokens'),
  },
  handler: async (ctx, { id }) => {
    return await ctx.db.delete(id)
  },
})

export const getViewToken = authedOrThrowQuery({
  args: {
    token: v.string(),
  },
  handler: async (ctx, { token }) => {
    const viewToken = await ctx.db
      .query('viewTokens')
      .withIndex('by_token', (q) => q.eq('token', token))
      .first()
    return viewToken
  },
})

// Dashboard edit-form hydration. `getViewToken` above looks up by the *token
// value* (viewer auth), which the dashboard never has — it only holds the row
// id — and the table is paginated, so scanning `listViewTokens` would miss any
// row past the loaded pages.
export const getViewTokenById = queryWithAuthStatus({
  args: {
    id: v.id('viewTokens'),
  },
  handler: async (ctx, { id }) => {
    if (ctx.authStatus === 'unauthorized') return null
    return await ctx.db.get(id)
  },
})

export const listViewTokens = queryWithAuthStatus({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
  },
  handler: async (ctx, { paginationOpts, search }) => {
    if (ctx.authStatus === 'unauthorized') return emptyPage<Doc<'viewTokens'>>()
    const term = search?.trim()
    if (term) {
      return await ctx.db
        .query('viewTokens')
        .withSearchIndex('search_name', (q) => q.search('name', term))
        .paginate(paginationOpts)
    }
    return await ctx.db
      .query('viewTokens')
      .order('desc')
      .paginate(paginationOpts)
  },
})

// Public viewer heartbeat: upsert this client's presence row for the view token
// it is authenticated as. The token id comes from the auth context (the
// injected `viewToken` arg), so only genuine viewers report presence.
export const pingViewToken = authedOrThrowMutation({
  args: {
    clientId: v.string(),
  },
  handler: async (ctx, { clientId }) => {
    const viewTokenId = ctx.viewToken
    if (!viewTokenId) return // e.g. a Clerk operator with no view token
    const now = Date.now()
    const existing = await ctx.db
      .query('viewTokenClients')
      .withIndex('by_token_client', (q) =>
        q.eq('viewTokenId', viewTokenId).eq('clientId', clientId)
      )
      .first()
    if (existing) {
      await ctx.db.patch(existing._id, { lastSeen: now })
    } else {
      await ctx.db.insert('viewTokenClients', {
        viewTokenId,
        clientId,
        lastSeen: now,
      })
    }
    // Give lastPing a purpose: last time any client was active on this token.
    await ctx.db.patch(viewTokenId, { lastPing: now })
  },
})

// Dashboard-facing: live count of currently-online clients per view token.
// Reactive — re-runs when pings arrive and when the cleanup cron prunes rows.
export const getActiveViewTokenClients = queryWithAuthStatus({
  args: {},
  handler: async (ctx) => {
    if (ctx.authStatus === 'unauthorized') {
      return [] as { viewTokenId: Id<'viewTokens'>; count: number }[]
    }
    const cutoff = Date.now() - ONLINE_WINDOW_MS
    const fresh = await ctx.db
      .query('viewTokenClients')
      .withIndex('by_lastSeen', (q) => q.gt('lastSeen', cutoff))
      .collect()
    const counts = new Map<Id<'viewTokens'>, number>()
    for (const client of fresh) {
      counts.set(client.viewTokenId, (counts.get(client.viewTokenId) ?? 0) + 1)
    }
    return Array.from(counts, ([viewTokenId, count]) => ({
      viewTokenId,
      count,
    }))
  },
})

// Cron-driven sweep of clients that stopped pinging (see src/api/crons.ts).
export const cleanupStaleViewTokenClients = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - ONLINE_WINDOW_MS
    const stale = await ctx.db
      .query('viewTokenClients')
      .withIndex('by_lastSeen', (q) => q.lt('lastSeen', cutoff))
      .take(500)
    for (const client of stale) {
      await ctx.db.delete(client._id)
    }
  },
})
