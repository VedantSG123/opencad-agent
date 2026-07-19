import { Button } from '@heroui/react'
import styled from 'styled-components'

export const TitlebarIconButton = styled(Button).attrs({
  isIconOnly: true,
  variant: 'ghost',
  size: 'sm',
})`
  flex-shrink: 0;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border-radius: var(--radius-lg);
  color: color-mix(in oklch, var(--foreground) 50%, transparent);

  &:hover {
    background-color: color-mix(in oklch, var(--muted) 20%, transparent);
  }

  &:focus-visible,
  &[data-focus-visible='true'] {
    outline: none !important;
    box-shadow: none !important;
  }
`
