import { AlertCircle, Plus, RefreshCw, Search, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { KERNEL_INFO } from '@/constants/kernels'
import { useProjects } from '@/hooks/useProjects'
import { cn } from '@/lib/utils'
import type { Project } from '@/types/project'

import { DeleteDialog } from './DeleteDialog'
import { NewProjectDialog } from './NewProjectDialog'
import { OnboardingScreen } from './OnboardingScreen'
import { ProjectCard, ProjectCardSkeleton } from './ProjectCard'
import { RenameDialog } from './RenameDialog'

export function ProjectsView() {
  const navigate = useNavigate()
  const { data: projects, isLoading, isError, refetch } = useProjects()

  const [searchQuery, setSearchQuery] = useState('')
  const [filterKernel, setFilterKernel] = useState<
    'all' | 'replicad' | 'openscad'
  >('all')
  const [sortBy, setSortBy] = useState<'last_accessed_at' | 'created_at'>(
    'last_accessed_at',
  )

  const [renameTarget, setRenameTarget] = useState<Project | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [newProjectOpen, setNewProjectOpen] = useState(false)

  const hasProjects = !isLoading && !isError && !!projects?.length
  const isEmpty = !isLoading && !isError && !projects?.length

  const filteredProjects = projects
    ? [...projects]
        .filter((project) => {
          const matchesSearch = project.name
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
          const matchesKernel =
            filterKernel === 'all' ? true : project.cad_kernel === filterKernel
          return matchesSearch && matchesKernel
        })
        .sort((a, b) => {
          if (sortBy === 'last_accessed_at') {
            const dateA = a.time.accessed
              ? new Date(a.time.accessed).getTime()
              : 0
            const dateB = b.time.accessed
              ? new Date(b.time.accessed).getTime()
              : 0
            return dateB - dateA
          } else {
            const dateA = new Date(a.time.created).getTime()
            const dateB = new Date(b.time.created).getTime()
            return dateB - dateA
          }
        })
    : []

  return (
    <div className='max-w-7xl w-full mx-auto px-6 py-6 flex-1 flex flex-col'>
      {isError && (
        <div className='flex flex-col items-center justify-center flex-1 gap-4 text-center select-none'>
          <AlertCircle className='w-10 h-10 text-destructive' />
          <div>
            <p className='font-semibold text-lg'>Failed to load projects</p>
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
          <div className='flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center'>
            <div className='flex flex-1 gap-3 w-full max-w-md'>
              <Skeleton className='h-9 flex-1' />
              <Skeleton className='h-9 w-45' />
            </div>
            <Skeleton className='h-9 w-32' />
          </div>
          <div className='space-y-1.5'>
            <Skeleton className='h-7 w-28' />
            <Skeleton className='h-4 w-16' />
          </div>
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
            {Array.from({ length: 4 }).map((_, i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        </div>
      )}

      {isEmpty && <OnboardingScreen />}

      {hasProjects && (
        <div className='space-y-6 flex-1 flex flex-col'>
          {/* Filters and Controls */}
          <div className='flex flex-col md:flex-row gap-4 justify-between items-start xl:items-center'>
            <div className='flex flex-col xl:flex-row gap-3 w-full'>
              {/* Search */}
              <div className='relative'>
                <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground select-none' />
                <Input
                  type='search'
                  placeholder='Search by project name...'
                  className='pl-9 h-9 w-full xl:w-80 bg-background border-border/80 focus-visible:ring-primary/50'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Kernel Filter Dropdown */}
              <div className='relative w-full xl:w-50 select-none'>
                <Select
                  value={filterKernel === 'all' ? '' : filterKernel}
                  onValueChange={(value) =>
                    setFilterKernel(value as 'all' | 'replicad' | 'openscad')
                  }
                >
                  <SelectTrigger
                    className={cn(
                      'w-full h-9 border-border/80 bg-background',
                      filterKernel !== 'all' && '[&>svg:last-child]:invisible',
                    )}
                  >
                    <SelectValue placeholder='All Kernels' />
                  </SelectTrigger>
                  <SelectContent position='popper'>
                    <SelectItem value='replicad'>
                      <div className='flex items-center gap-2'>
                        <img
                          src={KERNEL_INFO.replicad.image}
                          alt='Replicad'
                          className='h-4 w-4 object-contain shrink-0'
                        />
                        <span>Replicad</span>
                      </div>
                    </SelectItem>
                    <SelectItem value='openscad'>
                      <div className='flex items-center gap-2'>
                        <img
                          src={KERNEL_INFO.openscad.image}
                          alt='OpenSCAD'
                          className='h-4 w-4 object-contain shrink-0'
                        />
                        <span>OpenSCAD</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {filterKernel !== 'all' && (
                  <button
                    type='button'
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setFilterKernel('all')
                    }}
                    className='absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors'
                  >
                    <X className='h-3 w-3' />
                  </button>
                )}
              </div>

              {/* Sort By Dropdown */}
              <Select
                value={sortBy}
                onValueChange={(value) =>
                  setSortBy(value as 'last_accessed_at' | 'created_at')
                }
              >
                <SelectTrigger className='w-full xl:w-44 h-9 border-border/80 bg-background'>
                  <SelectValue placeholder='Sort by' />
                </SelectTrigger>
                <SelectContent position='popper'>
                  <SelectItem value='last_accessed_at'>
                    Last Accessed
                  </SelectItem>
                  <SelectItem value='created_at'>Created Date</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* New Project Button */}
            <Button
              size='sm'
              onClick={() => setNewProjectOpen(true)}
              className='shrink-0 select-none'
            >
              <Plus className='h-4 w-4 mr-1.5' />
              New Project
            </Button>
          </div>

          {/* Project Listing Header */}
          <div className='flex justify-between items-end'>
            <div>
              <p className='text-muted-foreground text-sm mt-0.5 select-none'>
                {(() => {
                  const count = filteredProjects?.length ?? 0
                  const isFiltered =
                    searchQuery !== '' ||
                    filterKernel !== 'all' ||
                    sortBy !== 'last_accessed_at'
                  return isFiltered
                    ? `${count} matching project${count === 1 ? '' : 's'}`
                    : `${count} project${count === 1 ? '' : 's'}`
                })()}
              </p>
            </div>
          </div>

          {/* Project Cards Grid */}
          {filteredProjects && filteredProjects.length > 0 ? (
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  sortBy={sortBy}
                  onClick={() => navigate(`/project/${project.id}`)}
                  onRename={() => setRenameTarget(project)}
                  onDelete={() => setDeleteTarget(project)}
                  // Note: the original onRename / onDelete triggers setting targets
                  // Let's match the original Dashboard.tsx logic:
                  // onRename={() => setRenameTarget(project)}
                  // onDelete={() => setDeleteTarget(project)}
                />
              ))}
            </div>
          ) : (
            <div className='flex flex-col items-center justify-center py-16 text-center select-none bg-muted/10 rounded-xl border border-dashed border-border/80'>
              <Search className='h-8 w-8 text-muted-foreground/60 mb-3' />
              <p className='font-medium text-muted-foreground'>
                No projects found
              </p>
              <p className='text-xs text-muted-foreground/80 mt-1 max-w-xs'>
                Try adjusting your search query or kernel filter settings.
              </p>
              <Button
                variant='link'
                size='sm'
                onClick={() => {
                  setSearchQuery('')
                  setFilterKernel('all')
                  setSortBy('last_accessed_at')
                }}
                className='mt-2 text-primary font-medium'
              >
                Clear all filters
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
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
