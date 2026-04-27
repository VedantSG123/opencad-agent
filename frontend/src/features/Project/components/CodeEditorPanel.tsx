import { EditorDialog } from './editor/EditorDialog'
import { FileContentView } from './editor/FileContentView'
import { FileTree } from './editor/FileTree'
import { RibbonBar } from './editor/RibbonBar'

export function CodeEditorPanel() {
  return (
    <div className='h-full flex flex-col overflow-hidden'>
      <div className='bg-card'>
        <RibbonBar />
      </div>
      <div className='flex flex-1 overflow-hidden'>
        <div className='bg-card'>
          <FileTree />
        </div>
        <FileContentView />
      </div>
      <EditorDialog />
    </div>
  )
}
