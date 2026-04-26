import type { Project } from '@/types/project'

import { EditorProvider } from './editor/context'
import { EditorDialog } from './editor/EditorDialog'
import { FileContentView } from './editor/FileContentView'
import { FileTree } from './editor/FileTree'
import { RibbonBar } from './editor/RibbonBar'

interface CodeEditorPanelProps {
  projectId: string
  project: Project | undefined
}

export function CodeEditorPanel({ projectId, project }: CodeEditorPanelProps) {
  return (
    <EditorProvider projectId={projectId} project={project}>
      <div className='h-full flex flex-col bg-card overflow-hidden'>
        <RibbonBar />
        <div className='flex flex-1 overflow-hidden'>
          <FileTree />
          <FileContentView />
        </div>
      </div>
      <EditorDialog />
    </EditorProvider>
  )
}
