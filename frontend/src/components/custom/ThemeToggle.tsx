import { Button } from '@heroui/react'
import { Monitor, Moon, Sun } from 'lucide-react'

import { useTheme } from '@/contexts/theme-context'

const NEXT_THEME = {
  light: 'dark',
  dark: 'system',
  system: 'light',
} as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  function toggleTheme() {
    setTheme(NEXT_THEME[theme])
  }

  return (
    <Button
      variant='ghost'
      isIconOnly
      onPress={toggleTheme}
      className='h-8 w-8'
    >
      {theme === 'dark' ? (
        <Moon className='h-4 w-4' />
      ) : theme === 'system' ? (
        <Monitor className='h-4 w-4' />
      ) : (
        <Sun className='h-4 w-4' />
      )}
    </Button>
  )
}
