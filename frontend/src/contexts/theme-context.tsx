import * as React from 'react'
import type { ResolvedTheme, ThemeSetting } from 'shared'

type Theme = ThemeSetting

type ThemeProviderProps = {
  children: React.ReactNode
}

type ThemeProviderState = {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => null,
}

const ThemeProviderContext =
  React.createContext<ThemeProviderState>(initialState)

function systemPrefersDark() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system'
    return window.electron?.initialTheme ?? 'system'
  })

  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>(
    () => {
      if (typeof window === 'undefined') return 'light'
      return window.electron?.initialResolvedTheme ?? resolveTheme(theme)
    },
  )

  React.useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)
  }, [resolvedTheme])

  // Reverse sync: when the OS theme changes while the app is set to
  // 'system', reflect it without any user action. In Electron this comes
  // from the main process (which tracks nativeTheme); outside Electron we
  // fall back to matchMedia directly.
  React.useEffect(() => {
    if (window.electron?.onThemeUpdated) {
      return window.electron.onThemeUpdated((updated) => {
        setResolvedTheme(updated)
      })
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => {
      setThemeState((current) => {
        if (current === 'system') {
          setResolvedTheme(event.matches ? 'dark' : 'light')
        }
        return current
      })
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const setTheme = React.useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    if (window.electron?.setTheme) {
      window.electron.setTheme(newTheme).then((res) => {
        if (res.success) setResolvedTheme(res.data)
      })
    } else {
      setResolvedTheme(resolveTheme(newTheme))
    }
  }, [])

  const value = { theme, resolvedTheme, setTheme }

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
