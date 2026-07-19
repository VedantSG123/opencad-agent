import {
  Group as ResizablePanelGroup,
  Panel as ResizablePanel,
  Separator as ResizableHandle,
} from 'react-resizable-panels'

import { usePanelContext } from '@/features/Project/context/PanelContext'

import { ConsolePanel } from './editor/ConsolePanel'
import { EditorDialog } from './editor/EditorDialog'
import { FileContentView } from './editor/FileContentView'
import { FileTree } from './editor/FileTree'
import { RibbonBar } from './editor/RibbonBar'

export function CodeEditorPanel() {
  const { consoleRef, setIsConsoleCollapsed } = usePanelContext()

  return (
    <div className='h-full flex flex-col overflow-hidden'>
      <div className='bg-background'>
        <RibbonBar />
      </div>
      <ResizablePanelGroup
        orientation='vertical'
        className='flex-1 flex flex-col w-full h-full'
      >
        <ResizablePanel defaultSize={80} minSize={30}>
          <div className='flex flex-1 h-full overflow-hidden'>
            <FileTree />
            <FileContentView />
          </div>
        </ResizablePanel>
        <ResizableHandle className='bg-border/60 h-px' />
        <ResizablePanel
          defaultSize={20}
          minSize={10}
          collapsible
          collapsedSize={0}
          panelRef={consoleRef}
          onResize={(size) => {
            setIsConsoleCollapsed(size.asPercentage === 0)
          }}
        >
          <ConsolePanel />
        </ResizablePanel>
      </ResizablePanelGroup>
      <EditorDialog />
    </div>
  )
}
