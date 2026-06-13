import { AlertCircle, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useProjects } from '@/hooks/useProjects'
import type { Project } from '@/types/project'

import { DashboardHeader } from './components/DashboardHeader'
import { DeleteDialog } from './components/DeleteDialog'
import { NewProjectDialog } from './components/NewProjectDialog'
import { OnboardingScreen } from './components/OnboardingScreen'
import { ProjectCard, ProjectCardSkeleton } from './components/ProjectCard'
import { RenameDialog } from './components/RenameDialog'

export function Dashboard() {
  const navigate = useNavigate()
  const { data: projects, isLoading, isError, refetch } = useProjects()
  const [renameTarget, setRenameTarget] = useState<Project | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [pingResult, setPingResult] = useState<string | null>(null)
  const [pinging, setPinging] = useState(false)

  const handlePing = () => {
    if (window.electron) {
      setPinging(true)
      window.electron
        .pingBackend()
        .then((res) => {
          if (res.success) {
            setPingResult(res.data)
          } else {
            setPingResult(`Error: ${res.error.message}`)
          }
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          setPingResult(`Error: ${msg}`)
        })
        .finally(() => setPinging(false))
    }
  }

  const hasProjects = !isLoading && !isError && !!projects?.length
  const isEmpty = !isLoading && !isError && !projects?.length

  return (
    <div className='min-h-screen flex flex-col bg-background'>
      <DashboardHeader onNewProject={() => setNewProjectOpen(true)} />

      {window.electron && (
        <div className='flex items-center justify-between border-b border-border bg-muted/50 px-6 py-2 text-xs text-muted-foreground'>
          <div className='flex items-center gap-2'>
            <span className='h-2 w-2 animate-pulse rounded-full bg-emerald-500' />
            <span>Running in Electron Desktop App</span>
          </div>
          <div className='flex items-center gap-4'>
            {pingResult && (
              <span className='font-mono text-[11px]'>{pingResult}</span>
            )}
            <Button
              size='xs'
              variant='outline'
              className='h-6 px-2 text-[10px]'
              onClick={handlePing}
              disabled={pinging}
            >
              {pinging ? 'Pinging...' : 'Test Backend Connection'}
            </Button>
          </div>
        </div>
      )}

      <main className='flex-1 flex flex-col max-w-7xl w-full mx-auto px-6 py-8'>
        {isError && (
          <div className='flex flex-col items-center justify-center flex-1 gap-4 text-center'>
            <AlertCircle className='w-10 h-10 text-destructive' />
            <div>
              <p className='font-semibold'>Failed to load projects</p>
              <p className='text-muted-foreground text-sm mt-1'>
                Check that the backend server is running on port 3000
              </p>
            </div>
            <Button variant='outline' onClick={() => refetch()}>
              <RefreshCw className='mr-2 h-4 w-4' />
              Retry
            </Button>
          </div>
        )}

        {isLoading && (
          <div className='space-y-6'>
            <div className='space-y-1'>
              <Skeleton className='h-7 w-28' />
              <Skeleton className='h-4 w-16' />
            </div>
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
              {Array.from({ length: 6 }).map((_, i) => (
                <ProjectCardSkeleton key={i} />
              ))}
            </div>
          </div>
        )}

        {isEmpty && <OnboardingScreen />}

        {hasProjects && (
          <div className='space-y-6'>
            <div>
              <h2 className='text-2xl font-bold'>Projects</h2>
              <p className='text-muted-foreground text-sm mt-0.5'>
                {projects.length} project{projects.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onClick={() => navigate(`/project/${project.id}`)}
                  onRename={() => setRenameTarget(project)}
                  onDelete={() => setDeleteTarget(project)}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
      />
      <RenameDialog
        project={renameTarget}
        onClose={() => setRenameTarget(null)}
      />
      <DeleteDialog
        project={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
