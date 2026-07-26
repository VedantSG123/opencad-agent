import { Button, Input, ListBox, Select, Skeleton } from '@heroui/react'
import {
  Alert02Icon,
  PlusSignIcon,
  Refresh01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { Icon } from '@/components/icons/HugeIcon'
import { useProjects } from '@/hooks/useProjects'
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
          <Icon icon={Alert02Icon} size={40} className='text-danger' />
          <div>
            <p className='font-semibold text-lg'>Failed to load projects</p>
            <p className='text-default-500 text-sm mt-1'>
              Check that the backend server is running on port 3000
            </p>
          </div>
          <Button variant='outline' onPress={() => refetch()}>
            <Icon icon={Refresh01Icon} size={16} />
            Retry
          </Button>
        </div>
      )}

      {isLoading && (
        <div className='space-y-6'>
          <div className='flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center'>
            <div className='flex flex-1 gap-3 w-full max-w-md'>
              <Skeleton className='h-9 flex-1 rounded-lg' />
              <Skeleton className='h-9 w-45 rounded-lg' />
            </div>
            <Skeleton className='h-9 w-32 rounded-lg' />
          </div>
          <div className='space-y-1.5'>
            <Skeleton className='h-7 w-28 rounded-lg' />
            <Skeleton className='h-4 w-16 rounded-lg' />
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
              <div className='relative w-full xl:w-80'>
                <Input
                  aria-label='Search projects'
                  placeholder='Search by project name...'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className='w-full pl-9'
                />
                <Icon
                  icon={Search01Icon}
                  size={16}
                  className='absolute left-3 top-1/2 -translate-y-1/2 text-default-400 pointer-events-none'
                />
              </div>

              {/* Kernel Filter Dropdown */}
              <Select
                aria-label='Filter by Kernel'
                className='w-full xl:w-50'
                selectedKey={filterKernel}
                onSelectionChange={(key) =>
                  setFilterKernel(key as 'all' | 'replicad' | 'openscad')
                }
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id='all' textValue='All Kernels'>
                      All Kernels
                    </ListBox.Item>
                    <ListBox.Item id='replicad' textValue='Replicad'>
                      Replicad
                    </ListBox.Item>
                    <ListBox.Item id='openscad' textValue='OpenSCAD'>
                      OpenSCAD
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>

              {/* Sort By Dropdown */}
              <Select
                aria-label='Sort By'
                className='w-full xl:w-44'
                selectedKey={sortBy}
                onSelectionChange={(key) =>
                  setSortBy(key as 'last_accessed_at' | 'created_at')
                }
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item
                      id='last_accessed_at'
                      textValue='Last Accessed'
                    >
                      Last Accessed
                    </ListBox.Item>
                    <ListBox.Item id='created_at' textValue='Created Date'>
                      Created Date
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>

            {/* New Project Button */}
            <Button size='sm' onPress={() => setNewProjectOpen(true)}>
              <Icon icon={PlusSignIcon} size={16} />
              New Project
            </Button>
          </div>

          {/* Project Listing Header */}
          <div className='flex justify-between items-end'>
            <div>
              <p className='text-default-500 text-sm mt-0.5 select-none'>
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
                />
              ))}
            </div>
          ) : (
            <div className='flex flex-col items-center justify-center py-16 text-center select-none bg-default-100 rounded-xl border border-dashed border-default-200'>
              <Icon
                icon={Search01Icon}
                size={32}
                className='text-default-400 mb-3'
              />
              <p className='font-medium text-default-500'>No projects found</p>
              <p className='text-xs text-default-400 mt-1 max-w-xs'>
                Try adjusting your search query or kernel filter settings.
              </p>
              <Button
                variant='ghost'
                size='sm'
                className='text-primary mt-2'
                onPress={() => {
                  setSearchQuery('')
                  setFilterKernel('all')
                  setSortBy('last_accessed_at')
                }}
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
