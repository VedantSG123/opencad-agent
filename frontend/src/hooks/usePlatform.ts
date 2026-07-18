export function usePlatform() {
  const isElectron = typeof window !== 'undefined' && !!window.electron
  const platform = isElectron ? window.electron?.platform : undefined

  return {
    isElectron,
    platform,
    isMac: platform === 'darwin',
    isWin: platform === 'win32',
    isWinOrLinux: isElectron && platform !== 'darwin',
  }
}
