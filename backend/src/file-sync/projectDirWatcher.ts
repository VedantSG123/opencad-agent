import * as nodePath from 'node:path'

import type { FSWatcher } from 'chokidar'
import chokidar from 'chokidar'

import { logger } from '../utils/logger'
import type { ElysiaServerRawWebSocket } from './serverWebsocketRPCPort'

export type FSEventType = 'change' | 'add' | 'unlink' | 'addDir' | 'unlinkDir'

export interface WatchEvent {
  event: 'fs:watch'
  type: FSEventType
  /** Path relative to the project root, e.g. "/script.js" */
  path: string
}

interface ProjectRoom {
  watcher: FSWatcher
  directory: string
  /** wsId → connection */
  connections: Map<string, ElysiaServerRawWebSocket>
  /**
   * Tracks which connections caused a pending fs mutation.
   * absolute path → Set of wsIds that triggered the write.
   * When chokidar fires, those connections are excluded from the broadcast.
   */
  pendingWrites: Map<string, Set<string>>
}

const rooms = new Map<string, ProjectRoom>()

/** Mutating RPC methods that will produce chokidar events. */
const MUTATING_METHODS = new Set([
  'write',
  'rename',
  'createFile',
  'unlink',
  'rmdir',
  'mkdir',
  'link',
  'touch',
])

/**
 * Which positional arg indices hold file paths for each mutating method.
 * rename tracks both old and new paths so both get suppressed.
 */
const METHOD_PATH_ARGS: Record<string, number[]> = {
  write: [0], // write(path, buffer, offset)
  createFile: [0], // createFile(path, options)
  rename: [0, 1], // rename(oldPath, newPath)
  unlink: [0], // unlink(path)
  rmdir: [0], // rmdir(path)
  mkdir: [0], // mkdir(path, options)
  link: [1], // link(target, link) — link is the new path
  touch: [0], // touch(path, metadata)
}

export function joinRoom(
  projectId: string,
  directory: string,
  ws: ElysiaServerRawWebSocket,
) {
  if (!ws.data.id) return

  let room = rooms.get(projectId)
  if (!room) {
    room = {
      watcher: startWatcher(projectId, directory),
      directory,
      connections: new Map(),
      pendingWrites: new Map(),
    }
    rooms.set(projectId, room)
  }

  room.connections.set(ws.data.id, ws)
  logger.info(
    `[watch] Connection ${ws.data.id} joined project ${projectId} (${room.connections.size} total)`,
  )
}

export function leaveRoom(projectId: string, wsId: string) {
  const room = rooms.get(projectId)
  if (!room) return

  room.connections.delete(wsId)

  // Clean up any pending writes for this connection
  for (const [absPath, wsIds] of room.pendingWrites) {
    wsIds.delete(wsId)
    if (wsIds.size === 0) room.pendingWrites.delete(absPath)
  }

  logger.info(
    `[watch] Connection ${wsId} left project ${projectId} (${room.connections.size} remaining)`,
  )

  if (room.connections.size === 0) {
    void room.watcher.close().then(() => {
      logger.info(`[watch] Stopped watching project ${projectId}`)
    })
    rooms.delete(projectId)
  }
}

/**
 * Call this when a mutating RPC message is received from a client.
 * Records the (path, wsId) pair so the resulting chokidar event can be
 * suppressed for the connection that caused it.
 */
export function trackPendingWrite(
  projectId: string,
  wsId: string,
  method: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[],
) {
  if (!MUTATING_METHODS.has(method)) return

  const room = rooms.get(projectId)
  if (!room) return

  const argIndices = METHOD_PATH_ARGS[method] ?? []
  for (const idx of argIndices) {
    const relPath = args[idx] as string | undefined
    if (!relPath) continue

    const absPath = nodePath.join(room.directory, relPath)
    let wsIds = room.pendingWrites.get(absPath)
    if (!wsIds) {
      wsIds = new Set()
      room.pendingWrites.set(absPath, wsIds)
    }
    wsIds.add(wsId)
  }
}

function broadcast(
  room: ProjectRoom,
  projectId: string,
  eventType: FSEventType,
  absPath: string,
) {
  const relPath = '/' + nodePath.relative(room.directory, absPath)

  // Collect + consume which connections caused this change
  const senderIds = room.pendingWrites.get(absPath) ?? new Set<string>()
  room.pendingWrites.delete(absPath)

  const payload = JSON.stringify({
    event: 'fs:watch',
    type: eventType,
    path: relPath,
  } satisfies WatchEvent)

  let sent = 0
  for (const [wsId, ws] of room.connections) {
    if (senderIds.has(wsId)) continue
    ws.send(payload)
    sent++
  }

  logger.info(
    `[watch] ${eventType} ${relPath} → broadcast to ${sent}/${room.connections.size} in project ${projectId}`,
  )
}

function startWatcher(projectId: string, directory: string): FSWatcher {
  const watcher = chokidar.watch(directory, {
    persistent: true,
    ignoreInitial: true,
  })

  const onEvent = (eventType: FSEventType) => (absPath: string) => {
    const room = rooms.get(projectId)
    if (!room) return
    broadcast(room, projectId, eventType, absPath)
  }

  watcher.on('change', onEvent('change'))
  watcher.on('add', onEvent('add'))
  watcher.on('unlink', onEvent('unlink'))
  watcher.on('addDir', onEvent('addDir'))
  watcher.on('unlinkDir', onEvent('unlinkDir'))

  logger.info(`[watch] Watching ${directory} for project ${projectId}`)
  return watcher
}
