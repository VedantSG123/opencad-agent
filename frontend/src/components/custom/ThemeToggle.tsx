import { Button } from '@heroui/react'
import { Moon, Sun } from 'lucide-react'

import { useTheme } from '@/contexts/theme-context'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <Button
      variant='ghost'
      isIconOnly
      onPress={toggleTheme}
      className='h-8 w-8'
    >
      {theme === 'dark' ? (
        <Sun className='h-4 w-4' />
      ) : (
        <Moon className='h-4 w-4' />
      )}
    </Button>
  )
}
