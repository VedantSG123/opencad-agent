import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { CreateProjectPayload } from '@/hooks/useProjects'
import type { CadKernel } from '@/types/project'

import { ActionStep } from './ActionStep'
import { DetailsStep } from './DetailsStep'
import { KernelStep } from './KernelStep'
import { StepIndicator } from './StepIndicator'

interface WizardState {
  action: 'create' | 'open' | null
  kernel: CadKernel | null
  name: string
  directory: string
  file: string
}

function initWizardState(): WizardState {
  return { action: null, kernel: null, name: '', directory: '', file: '' }
}

interface ProjectWizardProps {
  onComplete: (payload: CreateProjectPayload) => void
  onCancel?: () => void
  isLoading?: boolean
}

export function ProjectWizard({
  onComplete,
  onCancel,
  isLoading,
}: ProjectWizardProps) {
  const [step, setStep] = useState(1)
  const [state, setState] = useState<WizardState>(initWizardState)

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState((prev) => ({ ...prev, [key]: value }))
  }

  function handleActionSelect(action: 'create' | 'open') {
    setState((prev) => ({
      ...prev,
      action,
      kernel: null,
      name: '',
      directory: '',
      file: '',
    }))
    setStep(2)
  }

  function handleKernelSelect(kernel: CadKernel) {
    setState((prev) => ({
      ...prev,
      kernel,
      name: '',
      directory: '',
      file: '',
    }))
    setStep(3)
  }

  function handleBack() {
    setStep((s) => {
      const prev = Math.max(1, s - 1)
      if (prev === 1) {
        setState((st) => ({
          ...st,
          kernel: null,
          name: '',
          directory: '',
          file: '',
        }))
      } else if (prev === 2) {
        setState((st) => ({ ...st, name: '', directory: '', file: '' }))
      }
      return prev
    })
  }

  function handleSubmit() {
    if (!state.kernel || !state.name.trim() || !state.directory.trim()) return
    const trimmedName = state.name.trim()
    const trimmedDir = state.directory.trim()

    if (state.action === 'open') {
      onComplete({
        name: trimmedName,
        cad_kernel: state.kernel,
        directory: trimmedDir,
        file: state.file.trim(),
      })
    } else {
      onComplete({
        name: trimmedName,
        cad_kernel: state.kernel,
        directory: `${trimmedDir}/${trimmedName}`,
      })
    }
  }

  const step3Valid =
    state.name.trim().length > 0 &&
    state.directory.trim().length > 0 &&
    (state.action !== 'open' || state.file.trim().length > 0)

  return (
    <div className='space-y-5'>
      <StepIndicator step={step} />
      <Separator />
      <div className='min-h-55'>
        {step === 1 && (
          <ActionStep selected={state.action} onSelect={handleActionSelect} />
        )}
        {step === 2 && (
          <KernelStep selected={state.kernel} onSelect={handleKernelSelect} />
        )}
        {step === 3 && (
          <DetailsStep
            action={state.action}
            kernel={state.kernel}
            name={state.name}
            directory={state.directory}
            file={state.file}
            onNameChange={(v) => update('name', v)}
            onDirectoryChange={(v) => update('directory', v)}
            onFileChange={(v) => update('file', v)}
          />
        )}
      </div>
      <div className='flex items-center justify-between pt-1'>
        <div>
          {step > 1 ? (
            <Button
              variant='outline'
              size='sm'
              onClick={handleBack}
              disabled={isLoading}
            >
              <ArrowLeft className='mr-1.5 h-4 w-4' />
              Back
            </Button>
          ) : onCancel ? (
            <Button variant='ghost' size='sm' onClick={onCancel}>
              Cancel
            </Button>
          ) : (
            <div />
          )}
        </div>
        {step === 3 && (
          <Button onClick={handleSubmit} disabled={!step3Valid || isLoading}>
            {isLoading
              ? 'Creating…'
              : state.action === 'open'
                ? 'Open Project'
                : 'Create Project'}
          </Button>
        )}
      </div>
    </div>
  )
}
