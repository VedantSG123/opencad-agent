import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  File,
  Folder,
  Loader2,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useProjectFS } from '@/hooks/useProjectFS'

const STATUS_CONFIG = {
  connecting: {
    label: 'Connecting…',
    icon: Loader2,
    variant: 'secondary' as const,
    spin: true,
  },
  ready: {
    label: 'Connected',
    icon: CheckCircle,
    variant: 'default' as const,
    spin: false,
  },
  error: {
    label: 'Error',
    icon: AlertCircle,
    variant: 'destructive' as const,
    spin: false,
  },
  closed: {
    label: 'Disconnected',
    icon: AlertCircle,
    variant: 'outline' as const,
    spin: false,
  },
}

function EntryRow({ name }: { name: string }) {
  const isDir = !name.includes('.')
  const Icon = isDir ? Folder : File
  return (
    <div className='flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/50 text-sm font-mono'>
      <Icon className='h-4 w-4 text-muted-foreground shrink-0' />
      <span className='truncate'>{name}</span>
    </div>
  )
}

export function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { status, entries, error } = useProjectFS(id ?? '')

  const cfg = STATUS_CONFIG[status]
  const StatusIcon = cfg.icon

  return (
    <div className='min-h-screen flex flex-col bg-background'>
      <header className='border-b px-6 py-4 flex items-center gap-4'>
        <Button variant='ghost' size='icon' onClick={() => navigate('/')}>
          <ArrowLeft className='h-4 w-4' />
        </Button>
        <div className='flex-1'>
          <h1 className='text-lg font-semibold'>Project FS Test</h1>
          <p className='text-xs text-muted-foreground font-mono'>{id}</p>
        </div>
        <Badge variant={cfg.variant} className='flex items-center gap-1.5'>
          <StatusIcon className={`h-3 w-3 ${cfg.spin ? 'animate-spin' : ''}`} />
          {cfg.label}
        </Badge>
      </header>

      <main className='flex-1 max-w-3xl w-full mx-auto px-6 py-8 space-y-6'>
        {status === 'error' && (
          <div className='rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex gap-3 items-start'>
            <AlertCircle className='h-4 w-4 text-destructive mt-0.5 shrink-0' />
            <p className='text-sm text-destructive'>{error}</p>
          </div>
        )}

        {status === 'connecting' && (
          <div className='flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground'>
            <Loader2 className='h-8 w-8 animate-spin' />
            <p className='text-sm'>Opening WebSocket and mounting remote FS…</p>
          </div>
        )}

        {status === 'ready' && (
          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <h2 className='text-sm font-semibold text-muted-foreground uppercase tracking-wide'>
                Root directory
              </h2>
              <span className='text-xs text-muted-foreground'>
                {entries.length} entries
              </span>
            </div>
            <div className='rounded-lg border bg-card divide-y'>
              {entries.length === 0 ? (
                <p className='px-3 py-6 text-sm text-muted-foreground text-center'>
                  Directory is empty
                </p>
              ) : (
                entries.map((name) => <EntryRow key={name} name={name} />)
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
