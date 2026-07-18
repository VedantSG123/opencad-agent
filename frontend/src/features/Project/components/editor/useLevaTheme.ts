import { useTheme } from '@/contexts/theme-context'

const darkTheme = {
  colors: {
    elevation1: 'var(--card)', // Match app's card background
    elevation2: 'var(--background)', // Match app's input/background inset
    elevation3: 'var(--border)', // Match app's border highlight
    highlight1: 'var(--muted-foreground)', // Muted labels
    highlight2: 'var(--foreground)', // Regular text/values
    highlight3: 'var(--foreground)', // Active state
    accent1: '#fbbf24', // Yellow accent
    accent2: '#f59e0b', // Hover yellow
    accent3: '#d97706', // Pressed yellow
    vivid1: 'var(--destructive)',
    folderWidgetColor: 'var(--border)',
    folderTextColor: 'var(--muted-foreground)',
    toolTipBackground: 'var(--popover)',
    toolTipText: 'var(--popover-foreground)',
  },
  sizes: {
    rootWidth: '288px',
    controlWidth: '130px',
  },
}

const lightTheme = {
  colors: {
    elevation1: 'var(--card)', // Match app's card background
    elevation2: 'var(--background)', // Match app's input background
    elevation3: 'var(--border)', // Match app's border highlight
    highlight1: 'var(--muted-foreground)', // Muted labels
    highlight2: 'var(--foreground)', // Regular text/values
    highlight3: 'var(--foreground)', // Active state
    accent1: '#fbbf24', // Yellow accent
    accent2: '#f59e0b', // Hover yellow
    accent3: '#d97706', // Pressed yellow
    vivid1: 'var(--destructive)',
    folderWidgetColor: 'var(--border)',
    folderTextColor: 'var(--muted-foreground)',
    toolTipBackground: 'var(--popover)',
    toolTipText: 'var(--popover-foreground)',
  },
  sizes: {
    rootWidth: '288px',
    controlWidth: '130px',
  },
}

export function useLevaTheme() {
  const { resolvedTheme } = useTheme()
  return resolvedTheme === 'dark' ? darkTheme : lightTheme
}
