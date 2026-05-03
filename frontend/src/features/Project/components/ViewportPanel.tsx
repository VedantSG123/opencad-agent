import { ArrowLeftRight, Code2 } from 'lucide-react'
import * as THREE from 'three'

import { usePanelContext } from '../context/PanelContext'
import { useEditor } from './editor/context'
import { ReplicadViewport } from './ReplicadViewport'

THREE.Object3D.DEFAULT_UP.set(0, 0, 1)

export function ViewportPanel() {
  const { isFocusMode, setFocusedPanel } = usePanelContext()
  const { project } = useEditor()

  const isReplicad = project?.cad_kernel === 'replicad'

  return (
    <div className='h-full flex flex-col bg-card overflow-hidden'>
      <div className='w-full flex justify-end'>
        {isFocusMode && (
          <div className='flex items-center gap-1 border-b px-1 h-10 shrink-0'>
            <button
              onClick={() => setFocusedPanel('editor')}
              className='flex items-center gap-2 px-2 h-7 text-xs rounded-md text-muted-foreground group hover:text-foreground hover:bg-accent/50 transition-colors'
            >
              <ArrowLeftRight className='h-4 w-4 group-hover:text-blue-500' />
              <div className='flex items-center gap-1'>
                <Code2 className='h-3.5 w-3.5' />
                <span>Code Editor</span>
              </div>
            </button>
          </div>
        )}
      </div>
      <div className='flex-1 relative'>
        {isReplicad ? (
          <ReplicadViewport />
        ) : (
          <div className='h-full flex items-center justify-center'>
            <span className='text-sm text-muted-foreground'>3D Viewport</span>
          </div>
        )}
      </div>
    </div>
  )
}
