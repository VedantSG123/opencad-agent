export type LogLevel = 'log' | 'info' | 'warn' | 'error'

export type LogEntry = {
  type: LogLevel
  text: string
  timestamp: number
}
