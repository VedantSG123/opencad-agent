import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  LoaderCircleIcon,
} from '@hugeicons/core-free-icons'
import type * as React from 'react'

import { Icon } from '@/components/icons/HugeIcon'

/** The spinner every export shares, so one change moves all three kernels. */
export function ExportSpinner({ size = 40 }: { size?: number }) {
  return (
    <Icon
      icon={LoaderCircleIcon}
      size={size}
      className='animate-spin text-foreground/70'
    />
  )
}

export function ExportProgress({
  title,
  detail,
}: {
  title: string
  detail?: React.ReactNode
}) {
  return (
    <div className='flex flex-col items-center justify-center gap-4 py-6'>
      <ExportSpinner />
      <div className='text-center'>
        <div className='text-sm font-semibold'>{title}</div>
        {detail && (
          <div className='mt-1 text-xs text-foreground/60'>{detail}</div>
        )}
      </div>
    </div>
  )
}

export function ExportSuccess({ detail }: { detail?: React.ReactNode }) {
  return (
    <div className='flex flex-col items-center justify-center gap-4 py-6'>
      <div className='relative'>
        <Icon
          icon={CheckmarkCircle02Icon}
          size={48}
          className='text-success animate-in zoom-in-50 duration-300'
        />
        <div className='absolute -inset-0.5 animate-ping rounded-full bg-success/20 duration-1000' />
      </div>
      <div className='text-center'>
        <div className='text-base font-bold text-foreground'>
          Export Complete!
        </div>
        {detail && (
          <div className='mt-1 text-xs text-foreground/60'>{detail}</div>
        )}
      </div>
    </div>
  )
}

export function ExportFailure({ message }: { message: string }) {
  return (
    <div className='flex flex-col gap-4 py-2'>
      <div className='flex items-start gap-3 rounded-lg border border-danger/20 bg-danger/10 p-3 text-danger'>
        <Icon icon={Alert02Icon} size={20} className='mt-0.5 shrink-0' />
        <div className='flex flex-col gap-1 text-xs'>
          <span className='font-bold'>Export Failed</span>
          <span className='leading-relaxed whitespace-pre-wrap'>{message}</span>
        </div>
      </div>
    </div>
  )
}
