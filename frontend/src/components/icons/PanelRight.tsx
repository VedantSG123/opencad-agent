import { useId } from 'react'

interface Props {
  isCollapsed: boolean
  size?: number
}

export function PanelRight({ isCollapsed, size = 24 }: Props) {
  const rawId = useId()
  const clipId = `pr${rawId.replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      width={size}
      height={size}
      viewBox='0 0 24 24'
    >
      <title>Panel Right</title>
      <defs>
        <clipPath id={clipId}>
          <path d='M3 9.4c0-2.24 0-3.36.436-4.216a4 4 0 0 1 1.748-1.748C6.04 3 7.16 3 9.4 3h5.2c2.24 0 3.36 0 4.216.436a4 4 0 0 1 1.748 1.748C21 6.04 21 7.16 21 9.4v5.2c0 2.24 0 3.36-.436 4.216a4 4 0 0 1-1.748 1.748C17.96 21 16.84 21 14.6 21H9.4c-2.24 0-3.36 0-4.216-.436a4 4 0 0 1-1.748-1.748C3 17.96 3 16.84 3 14.6z' />
        </clipPath>
      </defs>
      {!isCollapsed && (
        <rect
          x='15'
          y='3'
          width='6'
          height='18'
          fill='currentColor'
          clipPath={`url(#${clipId})`}
        />
      )}
      <path
        fill='none'
        stroke='currentColor'
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth='1.5'
        d='M15 3.5v17M3 9.4c0-2.24 0-3.36.436-4.216a4 4 0 0 1 1.748-1.748C6.04 3 7.16 3 9.4 3h5.2c2.24 0 3.36 0 4.216.436a4 4 0 0 1 1.748 1.748C21 6.04 21 7.16 21 9.4v5.2c0 2.24 0 3.36-.436 4.216a4 4 0 0 1-1.748 1.748C17.96 21 16.84 21 14.6 21H9.4c-2.24 0-3.36 0-4.216-.436a4 4 0 0 1-1.748-1.748C3 17.96 3 16.84 3 14.6z'
      />
    </svg>
  )
}
