/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Adapter, OnMessage, SendMessage } from 'comctx'

export class NodeAdapter implements Adapter {
  constructor(
    private endpoint: {
      postMessage: (...args: any[]) => void
      on: (event: 'message', listener: (...args: any[]) => void) => void
      off: (event: 'message', listener: (...args: any[]) => void) => void
    },
    public name?: string,
  ) {}

  sendMessage: SendMessage = (message, transfer) => {
    this.endpoint.postMessage(message, transfer)
  }

  onMessage: OnMessage = (callback) => {
    const handler = (...args: any[]) => {
      callback(args[0] as never)
    }
    this.endpoint.on('message', handler)
    return () => this.endpoint.off('message', handler)
  }
}
