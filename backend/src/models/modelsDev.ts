import fs from 'fs'
import path from 'path'
import { z } from 'zod'

import { logger } from '../utils/logger'
import { CACHE_DIR } from '../utils/storageDirectories'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const Model = z.object({
  id: z.string(),
  name: z.string(),
  family: z.string().optional(),
  release_date: z.string(),
  attachment: z.boolean(),
  reasoning: z.boolean(),
  temperature: z.boolean(),
  tool_call: z.boolean(),
  interleaved: z
    .union([
      z.literal(true),
      z
        .object({
          field: z.enum(['reasoning_content', 'reasoning_details']),
        })
        .strict(),
    ])
    .optional(),
  cost: z
    .object({
      input: z.number(),
      output: z.number(),
      cache_read: z.number().optional(),
      cache_write: z.number().optional(),
      context_over_200k: z
        .object({
          input: z.number(),
          output: z.number(),
          cache_read: z.number().optional(),
          cache_write: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
  limit: z.object({
    context: z.number(),
    input: z.number().optional(),
    output: z.number(),
  }),
  modalities: z
    .object({
      input: z.array(z.enum(['text', 'audio', 'image', 'video', 'pdf'])),
      output: z.array(z.enum(['text', 'audio', 'image', 'video', 'pdf'])),
    })
    .optional(),
  experimental: z.boolean().optional(),
  status: z.enum(['alpha', 'beta', 'deprecated']).optional(),
  options: z.record(z.string(), z.any()),
  headers: z.record(z.string(), z.string()).optional(),
  provider: z.object({ npm: z.string() }).optional(),
  variants: z.record(z.string(), z.record(z.string(), z.any())).optional(),
})
export type Model = z.infer<typeof Model>

export const Provider = z.object({
  api: z.string().optional(),
  name: z.string(),
  env: z.array(z.string()),
  id: z.string(),
  npm: z.string().optional(),
  models: z.record(z.string(), Model),
})
export type Provider = z.infer<typeof Provider>

export const ModelsDevResponse = z.record(z.string(), Provider)
export type ModelsDevResponse = z.infer<typeof ModelsDevResponse>

const MODELS_DEV_URL = 'https://models.dev/api.json'
const MODELS_DEV_CACHE_FILE = path.join(CACHE_DIR, 'models-dev.json')

/** How often to re-sync the models list from models.dev (default: 24 hours) */
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Fetch & cache
// ---------------------------------------------------------------------------

/** Fetch the full models list from models.dev and persist it to cache. */
export async function syncModelsDev(): Promise<void> {
  logger.info('Syncing models list from models.dev…')
  try {
    const response = await fetch(MODELS_DEV_URL)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }
    const raw: unknown = await (response.json() as Promise<unknown>)
    const data = ModelsDevResponse.parse(raw)
    fs.writeFileSync(
      MODELS_DEV_CACHE_FILE,
      JSON.stringify(
        { fetchedAt: new Date().toISOString(), models: data },
        null,
        2,
      ),
      'utf-8',
    )
    logger.info('models.dev list cached successfully.')
  } catch (err) {
    logger.error({ err }, 'Failed to sync models from models.dev')
  }
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export interface ModelsDevCache {
  fetchedAt: string
  models: ModelsDevResponse
}

/**
 * Return the cached models list.  If no cache file exists yet, performs an
 * immediate fetch first so the caller always gets a value.
 */
export async function getModelsDev(): Promise<ModelsDevResponse> {
  if (!fs.existsSync(MODELS_DEV_CACHE_FILE)) {
    await syncModelsDev()
  }

  try {
    const raw = fs.readFileSync(MODELS_DEV_CACHE_FILE, 'utf-8')
    const cache = JSON.parse(raw) as unknown as ModelsDevCache
    return ModelsDevResponse.parse(cache.models)
  } catch (err) {
    logger.error({ err }, 'Failed to read models-dev cache file')
    throw err
  }
}

// ---------------------------------------------------------------------------
// Periodic sync
// ---------------------------------------------------------------------------

let syncTimer: ReturnType<typeof setInterval> | null = null

/**
 * Start a background timer that re-fetches the models list at the given
 * interval (defaults to {@link SYNC_INTERVAL_MS}).
 *
 * Call once at app startup.  Returns a `stop` function that clears the timer.
 */
export function startModelsDevSync(intervalMs: number = SYNC_INTERVAL_MS): {
  stop: () => void
} {
  // Perform an immediate sync on startup if the cache is missing or stale
  if (!fs.existsSync(MODELS_DEV_CACHE_FILE)) {
    syncModelsDev()
  } else {
    try {
      const raw = fs.readFileSync(MODELS_DEV_CACHE_FILE, 'utf-8')
      const cache = JSON.parse(raw) as unknown as ModelsDevCache
      const age = Date.now() - new Date(cache.fetchedAt).getTime()
      if (age >= intervalMs) {
        syncModelsDev()
      }
    } catch {
      syncModelsDev()
    }
  }

  syncTimer = setInterval(() => {
    syncModelsDev()
  }, intervalMs)

  // Prevent the timer from keeping the process alive if everything else exits
  if (typeof syncTimer.unref === 'function') {
    syncTimer.unref()
  }

  return {
    stop: () => {
      if (syncTimer !== null) {
        clearInterval(syncTimer)
        syncTimer = null
      }
    },
  }
}
