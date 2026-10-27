import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import type { SelectedModel } from '@/features/Providers/components/ModelSelectButton'
import {
  extractErrorMessage,
  useCreateProject,
  useInvalidateProjects,
  useProjects,
} from '@/hooks/useProjects'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import { joinPaths } from '@/lib/utils'
import type { CadKernel } from '@/types/project'

import { DotGridBackground } from './DotGridBackground'
import { PromptBox } from './onboarding/PromptBox'
import { RenameProjectDialog } from './onboarding/RenameProjectDialog'
import { getNextProjectName } from './onboarding/utils'
import { RecentProjects } from './RecentProjects'

export function DashboardView() {
  const navigate = useNavigate()
  const { data: projects, isLoading, isError, refetch } = useProjects()
  const { mutateAsync: createProject } = useCreateProject()
  const { invalidateProjects } = useInvalidateProjects()
  const { preferences, updatePreferences } = useUserPreferences()

  const [prompt, setPrompt] = useState('')
  const [kernel, setKernel] = useState<CadKernel>('openscad')
  const [model, setModel] = useState<SelectedModel | null>(null)
  const [parentDirectory, setParentDirectory] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('')
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [defaultName, setDefaultName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  function handleDirectoryPicked(path: string) {
    const existingNames = (projects ?? []).map((p) => p.name)
    setParentDirectory(path)
    setDefaultName(getNextProjectName(existingNames))
    setIsRenameDialogOpen(true)
  }

  function handleRenameConfirm(name: string) {
    setProjectName(name)
  }

  function handleModelChange(selected: SelectedModel) {
    setModel(selected)
    updatePreferences({ lastUsedModel: selected })
  }

  const canSubmit = Boolean(
    parentDirectory && projectName && prompt.trim() && model,
  )

  async function handleSubmit() {
    if (!canSubmit || !parentDirectory) return

    setIsCreating(true)
    try {
      const created = await createProject({
        name: projectName,
        cad_kernel: kernel,
        directory: joinPaths(parentDirectory, projectName),
        action: 'create',
      })
      await invalidateProjects()
      if (window.electron) {
        const res = await window.electron.addProjectRoot(created.directory)
        if (!res.success) {
          throw new Error(res.error.message)
        }
      }
      toast.success('Project created successfully')
      navigate(`/project/${created.id}`, { state: { initialPrompt: prompt } })
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Failed to create project'))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className='relative flex-1 flex flex-col items-center justify-center h-full'>
      <DotGridBackground />
      <div className='w-full h-full overflow-y-auto'>
        <div className='relative z-10 row-start-2 flex w-full min-w-0 max-w-3xl mx-auto flex-col gap-6 mt-[15%]'>
          <h1 className='min-w-0 text-3xl font-medium tracking-tight wrap-anywhere sm:text-4xl'>
            Welcome to OpenCAD Agent
          </h1>
          <PromptBox
            prompt={prompt}
            onPromptChange={setPrompt}
            kernel={kernel}
            onKernelChange={setKernel}
            directory={
              parentDirectory && projectName
                ? joinPaths(parentDirectory, projectName)
                : parentDirectory
            }
            onDirectoryPicked={handleDirectoryPicked}
            model={model}
            onModelChange={handleModelChange}
            preferredModel={preferences?.lastUsedModel}
            onSubmit={handleSubmit}
            canSubmit={canSubmit}
            isSubmitting={isCreating}
          />
        </div>
        <div className='relative z-10 w-full min-w-0 max-w-3xl mx-auto pt-2'>
          <RecentProjects
            projects={projects}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
          />
        </div>
      </div>
      {parentDirectory && (
        <RenameProjectDialog
          open={isRenameDialogOpen}
          onOpenChange={setIsRenameDialogOpen}
          parentDirectory={parentDirectory}
          defaultName={defaultName}
          onConfirm={handleRenameConfirm}
        />
      )}
    </div>
  )
}
