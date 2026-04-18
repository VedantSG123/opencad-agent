import { RPC } from '@zenfs/core'
import type { ServerWebSocket } from 'bun'
import type { TSchema } from 'elysia'
import type { TypeCheck } from 'elysia/dist/type-system'

export type ElysiaServerRawWebSocket = ServerWebSocket<{
  id?: string
  validator: TypeCheck<TSchema>
}>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers = new Map<string, Set<(msg: any) => void>>()

export function createPort(ws: ElysiaServerRawWebSocket): RPC.Port | null {
  if (!ws.data.id) {
    return null
  }

  const id = ws.data.id

  handlers.set(id, new Set())

  const port: RPC.Port = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    channel: ws as any,
    send(message: RPC.Message) {
      ws.send(RPC.encodeMessage(message))
    },
    addHandler(handler) {
      handlers.get(id)!.add(handler)
    },
    removeHandler(handler) {
      handlers.get(id)?.delete(handler)
    },
    disconnect() {
      handlers.delete(id)
    },
  }

  return port
}

export function handleMessage(
  ws: ElysiaServerRawWebSocket,
  data: string | Buffer,
) {
  if (!ws.data.id) {
    return
  }
  const id = ws.data.id
  const raw = typeof data === 'string' ? data : data.toString()
  const message = RPC.decodeMessage(raw)
  handlers
    .get(id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ?.forEach((handler: (msg: any) => void) => handler(message))
}

export function removeHandlers(id: string) {
  handlers.delete(id)
}
