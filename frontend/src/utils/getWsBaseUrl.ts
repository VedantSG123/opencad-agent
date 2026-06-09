export function getBaseWsUrl(): string {
  if (window.electron?.backendPort) {
    return `ws://127.0.0.1:${window.electron.backendPort}/api`
  }
  return 'ws://localhost:3000/api'
}
