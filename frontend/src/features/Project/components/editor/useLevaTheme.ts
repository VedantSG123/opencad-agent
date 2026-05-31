import { useTheme } from '@/contexts/theme-context'

const darkTheme = {
  colors: {
    elevation1: '#18181b', // dark zinc-900 card bg
    elevation2: '#1f1f23', // dark charcoal input background
    elevation3: '#27272a', // dark border highlight
    highlight1: '#3b82f6', // blue-500 accent
    highlight2: '#2563eb', // blue-600 active
    highlight3: '#1d4ed8', // blue-700
    accent1: '#3b82f6',
    accent2: '#60a5fa',
    accent3: '#1d4ed8',
    vivid1: '#ef4444',
    folderWidgetColor: '#3f3f46',
    folderTextColor: '#a1a1aa',
    toolTipBackground: '#27272a',
    toolTipText: '#f4f4f5',
  },
  sizes: {
    rootWidth: '288px',
    controlWidth: '130px',
  },
}

const lightTheme = {
  colors: {
    elevation1: '#ffffff', // pure white card bg
    elevation2: '#f3f4f6', // light gray input background
    elevation3: '#e5e7eb', // border highlight
    highlight1: '#4b5563', // muted text / label color
    highlight2: '#1f2937', // regular text / values
    highlight3: '#111827', // bright text / active
    accent1: '#3b82f6', // primary blue accent
    accent2: '#2563eb', // secondary blue accent
    accent3: '#1d4ed8', // tertiary blue accent
    vivid1: '#ef4444',
    folderWidgetColor: '#9ca3af',
    folderTextColor: '#374151',
    toolTipBackground: '#111827',
    toolTipText: '#f9fafb',
  },
  sizes: {
    rootWidth: '288px',
    controlWidth: '130px',
  },
}

export function useLevaTheme() {
  const { theme } = useTheme()
  return theme === 'dark' ? darkTheme : lightTheme
}
