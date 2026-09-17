import { Button } from '@heroui/react'
import {
  AlertCircleIcon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Download01Icon,
  PythonIcon,
  Refresh01Icon,
  LoaderCircleIcon,
} from '@hugeicons/core-free-icons'
import * as React from 'react'
import { PYTHON_INSTALL_STEPS } from 'shared/python'

import { Console } from '@/components/console/Console'
import { Icon } from '@/components/icons/HugeIcon'
import { PYTHON_STEP_LABELS } from '@/hooks/usePythonEnv'
import type { usePythonEnv } from '@/hooks/usePythonEnv'
import { cn } from '@/lib/utils'
import type { LogEntry } from '@/types'

// Measured on a cold install: ~210 MB over the wire, ~85s, ~700 MB on disk.
const DOWNLOAD_SUMMARY = 'about 210 MB, and a minute or two'

type PythonEnv = ReturnType<typeof usePythonEnv>

function StepBar({ index, total }: { index: number; total: number }) {
  return (
    <div className='flex gap-1'>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-1 flex-1 rounded-full transition-colors',
            i < index ? 'bg-accent' : 'bg-default',
          )}
        />
      ))}
    </div>
  )
}

function Versions({ packages }: { packages: Record<string, string> }) {
  return (
    <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground'>
      {Object.entries(packages).map(([name, version]) => (
        <React.Fragment key={name}>
          <dt className='font-medium text-foreground/70'>{name}</dt>
          <dd className='font-mono'>{version}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

function SetupLog({ logs }: { logs: LogEntry[] }) {
  if (logs.length === 0) {
    return null
  }

  return (
    <div className='h-44 overflow-hidden rounded-lg border border-border'>
      <Console logs={logs} title='Setup log' className='border-t-0' />
    </div>
  )
}

function Installing({ env }: { env: PythonEnv }) {
  const step = env.step
  const label = step ? PYTHON_STEP_LABELS[step.step] : 'Starting'

  return (
    <div className='flex flex-col gap-3'>
      <StepBar
        index={step?.index ?? 0}
        total={step?.total ?? PYTHON_INSTALL_STEPS.length}
      />
      <div className='flex items-center justify-between gap-3'>
        <p className='text-sm text-foreground'>
          {label}
          {step ? ` — step ${step.index} of ${step.total}` : null}
        </p>
        <Button variant='outline' size='sm' onPress={() => void env.cancel()}>
          <Icon icon={Cancel01Icon} size={14} />
          Cancel
        </Button>
      </div>
      <SetupLog logs={env.log} />
    </div>
  )
}

/**
 * The managed Python environment, rendered from whatever the main process last
 * reported. Framing is the caller's - this is the same body in the viewport of
 * an unconfigured build123d project and in the settings dialog.
 */
export function PythonEnvPanel({ env }: { env: PythonEnv }) {
  const { status } = env

  if (env.isBusy || status?.state === 'installing') {
    return <Installing env={env} />
  }

  if (!status) {
    return (
      <div className='flex items-center gap-2'>
        <Icon icon={LoaderCircleIcon} size={16} className='animate-spin' />
        <p className='text-muted'>Checking python environment installation</p>
      </div>
    )
  }

  if (status.state === 'ready') {
    return (
      <div className='flex flex-col gap-3'>
        <div className='flex items-center gap-2'>
          <Icon
            icon={CheckmarkCircle01Icon}
            size={16}
            className='text-emerald-500'
          />
          <p className='text-sm font-medium'>
            Ready — Python {status.pythonVersion}
            {status.source === 'custom' ? ' (your interpreter)' : null}
          </p>
        </div>
        <div className='pl-6 space-y-2'>
          <Versions packages={status.packages} />
          <p className='font-mono text-[11px] break-all text-muted-foreground select-text'>
            {status.interpreter}
          </p>
        </div>
      </div>
    )
  }

  if (status.state === 'outdated') {
    return (
      <div className='flex flex-col gap-3'>
        <div className='flex items-center gap-2'>
          <Icon icon={AlertCircleIcon} size={16} className='text-amber-500' />
          <p className='text-sm font-medium'>
            Installed at versions this build was not tested against
          </p>
        </div>
        <Versions packages={status.packages} />
        <p className='text-xs text-muted-foreground'>
          Expected{' '}
          {Object.entries(status.expected)
            .map(([n, v]) => `${n} ${v}`)
            .join(', ')}
          .
        </p>
        <div>
          <Button size='sm' onPress={() => void env.repair()}>
            <Icon icon={Refresh01Icon} size={14} />
            Reinstall at the tested versions
          </Button>
        </div>
      </div>
    )
  }

  if (status.state === 'broken' || status.state === 'failed') {
    const detail =
      status.state === 'broken'
        ? status.reason
        : `${PYTHON_STEP_LABELS[status.step]} failed: ${status.message}`

    return (
      <div className='flex flex-col gap-3'>
        <div className='flex items-center gap-2'>
          <Icon icon={AlertCircleIcon} size={16} className='text-destructive' />
          <p className='text-sm font-medium'>Setup could not be completed</p>
        </div>
        <p className='max-h-28 overflow-y-auto rounded-lg bg-background-secondary p-2 font-mono text-[11px] whitespace-pre-wrap text-foreground/60 select-text'>
          {detail}
        </p>
        <SetupLog logs={env.log} />
        <div>
          <Button size='sm' onPress={() => void env.repair()}>
            <Icon icon={Refresh01Icon} size={14} />
            Try again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-3'>
      <p className='text-sm text-muted-foreground'>
        build123d runs as Python, so the app needs its own Python environment
        before it can build anything. It is downloaded once and shared by every
        build123d project — {DOWNLOAD_SUMMARY}.
      </p>
      {env.error ? (
        <p className='text-xs text-destructive'>{env.error}</p>
      ) : null}
      <div>
        <Button size='sm' onPress={() => void env.install()}>
          <Icon icon={Download01Icon} size={14} />
          Set up build123d
        </Button>
      </div>
    </div>
  )
}

export function PythonEnvHeading() {
  return (
    <div className='flex items-center gap-2'>
      <Icon icon={PythonIcon} size={16} className='text-accent' />
      <h3 className='text-base font-semibold text-foreground'>
        build123d environment
      </h3>
    </div>
  )
}
