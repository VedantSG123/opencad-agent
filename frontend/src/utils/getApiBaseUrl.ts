export function getBaseApiUrl(): string {
  if (window.electron?.backendPort) {
    return `http://127.0.0.1:${window.electron.backendPort}/api`
  }
  return 'http://localhost:3000/api'
}
