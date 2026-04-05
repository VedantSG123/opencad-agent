import type { FSWatcher } from 'chokidar'
import chokidar from 'chokidar'
import type { DefaultEventsMap, Server, Socket } from 'socket.io'

import { getProjectById } from '../utils/dbUtils/projects'
import { logger } from '../utils/logger'

export class Sync {
  private readonly namespace: string = '/sync'
  private syncNamespace: ReturnType<Server['of']>

  private watchers = new Map<string, FSWatcher>()
  /** Counts in-flight writes per file path to suppress the resulting chokidar event. */
  private pendingWrites = new Map<string, number>()

  private readonly SOCKET_CLIENT_EVENTS = {
    JOIN_PROJECT: 'JOIN_PROJECT',
    LEAVE_PROJECT: 'LEAVE_PROJECT',
    SCRIPT_SAVE: 'SCRIPT_SAVE',
  }

  private readonly SOCKET_SERVER_EVENTS = {
    SCRIPT_CHANGED: 'SCRIPT_CHANGED',
    SCRIPT_SAVED: 'SCRIPT_SAVED',
  }

  constructor(io: Server) {
    this.syncNamespace = io.of(this.namespace)
    this.initializeSocket()
  }

  private initializeSocket() {
    this.syncNamespace.on('connection', (socket) => {
      socket.on('disconnecting', async () => {
        for (const room of socket.rooms) {
          if (!room.startsWith('project:')) continue
          const projectId = room.slice('project:'.length)
          await this.ensureRoomCleanup(socket, projectId)
        }
      })

      socket.on(this.SOCKET_CLIENT_EVENTS.JOIN_PROJECT, (projectId: string) => {
        const project = getProjectById(projectId)
        if (!project) {
          socket.emit('error', {
            error: 'Project not found',
            event: this.SOCKET_CLIENT_EVENTS.JOIN_PROJECT,
          })
          return
        }

        socket.join(this.getRoomName(projectId))
        this.startWatcher(projectId, project.file)
      })

      socket.on(
        this.SOCKET_CLIENT_EVENTS.LEAVE_PROJECT,
        async (projectId: string) => {
          await this.ensureRoomCleanup(socket, projectId)
        },
      )

      socket.on(
        this.SOCKET_CLIENT_EVENTS.SCRIPT_SAVE,
        async ({
          projectId,
          content,
        }: {
          projectId: string
          content: string
        }) => {
          const project = getProjectById(projectId)
          if (!project) {
            socket.emit(this.SOCKET_SERVER_EVENTS.SCRIPT_SAVED, {
              success: false,
              error: 'Project not found',
            })
            return
          }

          if (!socket.rooms.has(this.getRoomName(projectId))) {
            socket.emit(this.SOCKET_SERVER_EVENTS.SCRIPT_SAVED, {
              success: false,
              error: 'Not in project room',
            })
            return
          }

          const { file } = project

          try {
            this.pendingWrites.set(
              file,
              (this.pendingWrites.get(file) ?? 0) + 1,
            )
            await Bun.write(file, content)

            socket.emit(this.SOCKET_SERVER_EVENTS.SCRIPT_SAVED, {
              success: true,
            })
          } catch (err) {
            this.consumePendingWrite(file)
            const message = err instanceof Error ? err.message : 'Unknown error'
            socket.emit(this.SOCKET_SERVER_EVENTS.SCRIPT_SAVED, {
              success: false,
              error: message,
            })
          }
        },
      )
    })
  }

  private getRoomName(projectId: string) {
    return `project:${projectId}`
  }

  private async getRoomSockets(room: string) {
    const sockets = await this.syncNamespace.in(room).fetchSockets()
    return sockets
  }

  private async ensureRoomCleanup(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    projectId: string,
  ) {
    const room = this.getRoomName(projectId)
    socket.leave(room)
    const roomSockets = await this.getRoomSockets(room)
    const remaining = roomSockets.filter((s) => s.id !== socket.id)
    if (remaining.length === 0) {
      await this.stopWatcher(projectId)
    }
  }

  /** Decrements the pending-write count for a path. Returns true if a write was consumed (event should be suppressed). */
  private consumePendingWrite(filePath: string): boolean {
    const count = this.pendingWrites.get(filePath) ?? 0
    if (count === 0) return false
    if (count === 1) this.pendingWrites.delete(filePath)
    else this.pendingWrites.set(filePath, count - 1)
    return true
  }

  private startWatcher(projectId: string, filePath: string) {
    if (this.watchers.has(projectId)) return

    const watcher = chokidar.watch(filePath, {
      persistent: true,
      ignoreInitial: true,
    })

    watcher.on(
      'change',
      (changedPath) =>
        void (async () => {
          if (this.consumePendingWrite(changedPath)) return
          try {
            const content = await Bun.file(changedPath).text()
            this.syncNamespace
              .to(this.getRoomName(projectId))
              .emit(this.SOCKET_SERVER_EVENTS.SCRIPT_CHANGED, {
                content,
                source: 'external',
              })

            logger.info(`[sync] External change on project ${projectId}`)
          } catch (err) {
            logger.error(
              `[sync] Failed to read changed file: ${err instanceof Error ? err.message : 'Unknown error'}`,
            )
          }
        })(),
    )

    this.watchers.set(projectId, watcher)
    logger.info(`[sync] Watching ${filePath} for project ${projectId}`)
  }

  private async stopWatcher(projectId: string) {
    const watcher = this.watchers.get(projectId)
    if (!watcher) return

    await watcher.close()
    this.watchers.delete(projectId)
    logger.info(`[sync] Stopped watching project ${projectId}`)
  }
}
