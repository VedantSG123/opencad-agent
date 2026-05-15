import { useEffect, useMemo, useRef } from 'react'
import { useParams } from 'react-router'
import { toast } from 'sonner'

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { useProjects } from '@/hooks/useProjects'
import { cn } from '@/lib/utils'
import type { Project } from '@/types/project'

import { AgentPanel } from './components/AgentPanel'
import { CodeEditorPanel } from './components/CodeEditorPanel'
import { EditorProvider } from './components/editor/context'
import { FileSync } from './components/FileSync'
import { TopBar } from './components/TopBar'
import { ViewportPanel } from './components/ViewportPanel'
import { PanelProvider, usePanelContext } from './context/PanelContext'

function ProjectLayout({ project }: { project: Project }) {
  const { codeEditorRef, agentRef, isFocusMode, focusedPanel } =
    usePanelContext()

  const innerGroupRef = useRef<HTMLDivElement>(null)
  const editorElementRef = useRef<HTMLDivElement>(null)
  const viewportElementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const groupEl = innerGroupRef.current
    const editorEl = editorElementRef.current
    const viewportEl = viewportElementRef.current

    if (isFocusMode) {
      if (groupEl) groupEl.style.position = 'relative'
      if (editorEl) {
        editorEl.style.position = 'absolute'
        editorEl.style.inset = '0'
        editorEl.style.zIndex = focusedPanel === 'editor' ? '10' : '0'
      }
      if (viewportEl) {
        viewportEl.style.position = 'absolute'
        viewportEl.style.inset = '0'
        viewportEl.style.zIndex = focusedPanel === 'viewport' ? '10' : '0'
      }
    } else {
      if (groupEl) groupEl.style.position = ''
      if (editorEl) {
        editorEl.style.position = ''
        editorEl.style.inset = ''
        editorEl.style.zIndex = ''
      }
      if (viewportEl) {
        viewportEl.style.position = ''
        viewportEl.style.inset = ''
        viewportEl.style.zIndex = ''
      }
    }
  }, [isFocusMode, focusedPanel])

  return (
    <EditorProvider project={project}>
      <FileSync />
      <ResizablePanelGroup orientation='horizontal' className='flex-1'>
        <ResizablePanel defaultSize={75} minSize={20}>
          <ResizablePanelGroup
            orientation='horizontal'
            elementRef={innerGroupRef}
          >
            <ResizablePanel
              defaultSize={46}
              minSize={15}
              collapsible
              collapsedSize={0}
              panelRef={codeEditorRef}
              elementRef={editorElementRef}
            >
              <div className='h-full overflow-hidden'>
                <CodeEditorPanel />
              </div>
            </ResizablePanel>

            <ResizableHandle
              className={cn('bg-border w-px', isFocusMode && 'hidden')}
            />

            <ResizablePanel
              defaultSize={54}
              minSize={20}
              elementRef={viewportElementRef}
            >
              <div className='h-full overflow-hidden'>
                <ViewportPanel />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle className='bg-border w-px' />

        <ResizablePanel
          defaultSize={25}
          minSize={15}
          collapsible
          collapsedSize={0}
          panelRef={agentRef}
        >
          <div className='h-full overflow-hidden'>
            <AgentPanel />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </EditorProvider>
  )
}

export function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const { data: projects, isLoading, isError } = useProjects()

  const project = useMemo(() => {
    if (!projects || !id) {
      return null
    }

    return projects.find((p) => p.id === id) || null
  }, [projects, id])

  useEffect(() => {
    if (isError) {
      toast.error('Failed to load projects')
    }
  }, [isError])

  if (isLoading) {
    return (
      <div className='h-screen flex flex-col text-center justify-center'>
        <p>Loading Project details...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className='h-screen flex flex-col text-center justify-center'>
        <p className='text-destructive'>Project not found.</p>
      </div>
    )
  }

  return (
    <PanelProvider>
      <div className='h-screen flex flex-col bg-background p-2 overflow-hidden'>
        <TopBar project={project} />
        <div className='flex-1 flex overflow-hidden rounded-lg border-2'>
          <ProjectLayout project={project} />
        </div>
      </div>
    </PanelProvider>
  )
}
