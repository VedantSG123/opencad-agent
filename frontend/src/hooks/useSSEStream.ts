import * as React from 'react'

type StreamEvent<TChunk, TFinal> =
  | { type: 'chunk'; data: TChunk }
  | { type: 'done'; data: TFinal }
  | { type: 'error'; error: string }

type StreamState<TChunk, TFinal> = {
  isLoading: boolean
  isStreaming: boolean
  isError: boolean
  chunks: TChunk[]
  final: TFinal | null
}

type UseSSEOptions<TChunk, TFinal> = {
  url: string
  parse: (raw: string) => StreamEvent<TChunk, TFinal>
  onChunk?: (chunk: TChunk) => void
  onDone?: (final: TFinal) => void
  onError?: (err: string) => void
}

export function useSSEStream<TChunk, TFinal>() {
  const [state, setState] = React.useState<StreamState<TChunk, TFinal>>({
    isLoading: false,
    isStreaming: false,
    isError: false,
    chunks: [],
    final: null,
  })

  const eventSourceRef = React.useRef<EventSource | null>(null)

  const start = React.useCallback(
    ({
      url,
      parse,
      onChunk,
      onDone,
      onError,
    }: UseSSEOptions<TChunk, TFinal>) => {
      setState({
        isLoading: true,
        isStreaming: false,
        isError: false,
        chunks: [],
        final: null,
      })

      const es = new EventSource(url)
      eventSourceRef.current = es

      es.onopen = () => {
        setState((s) => ({
          ...s,
          isLoading: false,
          isStreaming: true,
        }))
      }

      es.onmessage = (event: MessageEvent<string>) => {
        let parsed: StreamEvent<TChunk, TFinal>

        try {
          parsed = parse(event.data)
        } catch (err) {
          console.error('SSE parse error', err)
          return
        }

        switch (parsed.type) {
          case 'chunk':
            setState((s) => ({
              ...s,
              chunks: [...s.chunks, parsed.data],
            }))
            onChunk?.(parsed.data)
            break

          case 'done':
            setState((s) => ({
              ...s,
              isStreaming: false,
              final: parsed.data,
            }))
            onDone?.(parsed.data)
            es.close()
            break

          case 'error':
            setState((s) => ({
              ...s,
              isError: true,
              isStreaming: false,
            }))
            onError?.(parsed.error)
            es.close()
            break
        }
      }

      es.onerror = () => {
        setState((s) => ({
          ...s,
          isError: true,
          isStreaming: false,
        }))
        onError?.('Connection to server lost')
        es.close()
      }

      return () => {
        es.close()
      }
    },
    [],
  )

  const stop = React.useCallback(() => {
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    setState((s) => ({
      ...s,
      isLoading: false,
      isStreaming: false,
    }))
  }, [])

  return {
    ...state,
    start,
    stop,
  }
}
