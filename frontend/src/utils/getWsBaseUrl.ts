export function getBaseWsUrl(): string {
  if (import.meta.env.DEV) {
    return 'ws://localhost:3000/api'
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}`
}
