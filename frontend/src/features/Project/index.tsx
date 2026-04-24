import { useParams } from 'react-router'

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { useProjects } from '@/hooks/useProjects'

import { AgentPanel } from './components/AgentPanel'
import { CodeEditorPanel } from './components/CodeEditorPanel'
import { PanelResizeHandle } from './components/PanelResizeHandle'
import { TopBar } from './components/TopBar'
import { ViewportPanel } from './components/ViewportPanel'

export function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const { data: projects } = useProjects()
  const project = projects?.find((p) => p.id === id)

  return (
    <div className='h-screen flex flex-col bg-background px-1 pb-1 overflow-hidden'>
      <TopBar project={project} />

      <ResizablePanelGroup orientation='horizontal' className='flex-1'>
        <ResizablePanel defaultSize={25} minSize={15}>
          <div className='h-full rounded-lg border-2 overflow-hidden'>
            <CodeEditorPanel projectId={id!} />
          </div>
        </ResizablePanel>

        <ResizableHandle className='mr-2 h-[calc(100%-24px)] mt-3 bg-transparent active:bg-border focus-visible:ring-border/50 focus-visible:ring-offset-0'>
          <PanelResizeHandle />
        </ResizableHandle>

        <ResizablePanel defaultSize={50} minSize={20}>
          <div className='h-full rounded-lg overflow-hidden'>
            <ViewportPanel />
          </div>
        </ResizablePanel>

        <ResizableHandle className='ml-2 h-[calc(100%-24px)] mt-3 bg-transparent active:bg-border focus-visible:ring-border/50 focus-visible:ring-offset-0'>
          <PanelResizeHandle />
        </ResizableHandle>

        <ResizablePanel defaultSize={25} minSize={15}>
          <div className='h-full rounded-lg border-2 overflow-hidden'>
            <AgentPanel />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
