import {
  ArrowDataTransferHorizontalIcon,
  SourceCodeIcon,
} from '@hugeicons/core-free-icons'
import * as THREE from 'three'

import { Icon } from '@/components/icons/HugeIcon'

import { usePanelContext } from '../context/PanelContext'
import { useEditor } from './editor/context'
import { OpenSCADViewport } from './OpenSCADViewport'
import { ReplicadViewport } from './ReplicadViewport'

THREE.Object3D.DEFAULT_UP.set(0, 0, 1)

export function ViewportPanel() {
  const { isFocusMode, setFocusedPanel } = usePanelContext()
  const { project } = useEditor()

  const isReplicad = project.cad_kernel === 'replicad'
  const isOpenSCAD = project.cad_kernel === 'openscad'

  return (
    <div
      id='viewport-panel-container'
      className='h-full flex flex-col bg-background-secondary overflow-hidden'
    >
      <div className='w-full flex justify-end'>
        {isFocusMode && (
          <div className='flex items-center gap-1 border-b px-1 h-10 shrink-0'>
            <button
              onClick={() => setFocusedPanel('editor')}
              className='flex items-center gap-2 px-2 h-7 text-xs rounded-md shrink-0 text-foreground/60 group hover:text-foreground hover:bg-muted/15 transition-colors'
            >
              <Icon
                icon={ArrowDataTransferHorizontalIcon}
                size={16}
                className='group-hover:text-blue-500'
              />
              <div className='flex items-center gap-1'>
                <Icon icon={SourceCodeIcon} size={14} />
                <span>Code Editor</span>
              </div>
            </button>
          </div>
        )}
      </div>
      <div id='cad-viewer' className='flex-1 min-h-0'>
        {isReplicad && <ReplicadViewport />}
        {isOpenSCAD && <OpenSCADViewport />}
        {!isReplicad && !isOpenSCAD && (
          <div className='h-full flex items-center justify-center'>
            <span className='text-sm text-foreground/60'>3D Viewport</span>
          </div>
        )}
      </div>
    </div>
  )
}
