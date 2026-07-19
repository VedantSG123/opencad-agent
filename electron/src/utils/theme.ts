import { nativeTheme } from 'electron'
import type { ResolvedTheme } from 'shared'

export function getResolvedTheme(): ResolvedTheme {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

export function getTitleBarOverlay(theme: ResolvedTheme) {
  return {
    color: '#00000000',
    symbolColor: theme === 'dark' ? '#c2c2c2' : '#1e1e1e',
    height: 36,
  }
}
