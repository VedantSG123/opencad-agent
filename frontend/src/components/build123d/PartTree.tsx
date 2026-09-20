import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  BoundingBoxIcon,
  EyeIcon,
} from '@hugeicons/core-free-icons'
import * as React from 'react'
import type { ShapeNode } from 'shared/build123d'

import { Icon } from '@/components/icons/HugeIcon'
import type {
  GroupState,
  VisibilityKind,
  VisibilityMap,
} from '@/kernels/build123d/tree'
import { componentLeafIds, groupState, isGroup } from '@/kernels/build123d/tree'
import { cn } from '@/lib/utils'

type PartTreeProps = {
  tree: ShapeNode
  visibility: VisibilityMap
  onToggle: (ids: string[], kind: VisibilityKind, value: boolean) => void
  selectedId?: string | null
  onSelect?: (node: ShapeNode) => void
}

const TOGGLE_ICON: Record<VisibilityKind, typeof EyeIcon> = {
  faces: EyeIcon,
  edges: BoundingBoxIcon,
}

const TOGGLE_LABEL: Record<VisibilityKind, string> = {
  faces: 'faces',
  edges: 'edges',
}

function VisibilityToggle({
  kind,
  state,
  absent,
  onPress,
}: {
  kind: VisibilityKind
  state: GroupState
  absent: boolean
  onPress: () => void
}) {
  return (
    <button
      type='button'
      disabled={absent}
      onClick={(event) => {
        event.stopPropagation()
        onPress()
      }}
      aria-label={
        absent
          ? `This shape has no ${TOGGLE_LABEL[kind]}`
          : `Toggle ${TOGGLE_LABEL[kind]}`
      }
      aria-pressed={!absent && state !== 'off'}
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors',
        absent ? 'opacity-20' : 'hover:bg-muted/20',
        state === 'on' && 'text-accent',
        // A group whose children disagree reads as neither on nor off.
        state === 'mixed' && 'text-accent/40',
        state === 'off' && 'text-foreground/25',
      )}
    >
      <Icon icon={TOGGLE_ICON[kind]} size={14} />
    </button>
  )
}

function PartTreeNode({
  node,
  level,
  visibility,
  onToggle,
  selectedId,
  onSelect,
}: PartTreeProps & { node: ShapeNode; level: number }) {
  const [open, setOpen] = React.useState(true)
  const group = isGroup(node)

  // A toggle acts on the leaves that have the component, so a Line - which
  // has no faces at all - neither offers a faces toggle nor drags the tri-
  // state of a group it sits in.
  const faceIds = React.useMemo(() => componentLeafIds(node, 'faces'), [node])
  const edgeIds = React.useMemo(() => componentLeafIds(node, 'edges'), [node])

  const faces = groupState(faceIds, visibility, 'faces')
  const edges = groupState(edgeIds, visibility, 'edges')

  const toggle =
    (kind: VisibilityKind, targets: string[], state: GroupState) => () =>
      onToggle(targets, kind, state !== 'on')

  const color = typeof node.color === 'string' ? node.color : undefined

  return (
    <div>
      <div
        onClick={() => onSelect?.(node)}
        className={cn(
          'flex items-center gap-1 rounded px-1 py-0.5 text-xs cursor-default select-none',
          selectedId === node.id ? 'bg-accent-soft' : 'hover:bg-muted/10',
        )}
        style={{ paddingLeft: level * 12 + 4 }}
      >
        <button
          type='button'
          onClick={(event) => {
            event.stopPropagation()
            setOpen((value) => !value)
          }}
          aria-label={open ? 'Collapse' : 'Expand'}
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center text-foreground/40',
            !group && 'invisible',
          )}
        >
          <Icon icon={open ? ArrowDown01Icon : ArrowRight01Icon} size={12} />
        </button>

        <VisibilityToggle
          kind='faces'
          state={faces}
          absent={faceIds.length === 0}
          onPress={toggle('faces', faceIds, faces)}
        />
        <VisibilityToggle
          kind='edges'
          state={edges}
          absent={edgeIds.length === 0}
          onPress={toggle('edges', edgeIds, edges)}
        />

        <span className='truncate text-foreground/80'>{node.name}</span>

        {color && (
          <span
            className='ml-auto h-2.5 w-2.5 shrink-0 rounded-full border border-border'
            style={{ backgroundColor: color }}
          />
        )}
      </div>

      {group && open && (
        <div>
          {node.parts?.map((child) => (
            <PartTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              tree={child}
              visibility={visibility}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function PartTree({
  tree,
  visibility,
  onToggle,
  selectedId,
  onSelect,
}: PartTreeProps) {
  return (
    <div className='flex flex-col'>
      <div className='flex items-center gap-1 border-b border-border px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/40 select-none'>
        <span className='w-4' />
        <span className='w-5 text-center'>F</span>
        <span className='w-5 text-center'>E</span>
        <span>Part</span>
      </div>
      <div className='overflow-y-auto py-1'>
        <PartTreeNode
          node={tree}
          level={0}
          tree={tree}
          visibility={visibility}
          onToggle={onToggle}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </div>
    </div>
  )
}
