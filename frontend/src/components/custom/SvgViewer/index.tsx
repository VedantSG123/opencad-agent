import * as React from 'react'
import { useRect } from 'react-use-rect'

import type { SvgRenderOutput } from '@/types'

// ---------------------------------------------------------------------------
// Viewbox utilities (shared)
// ---------------------------------------------------------------------------

const range = (start: number, end: number, step = 1) => {
  const result = []
  for (let i = start; i < end; i += step) {
    result.push(i)
  }
  return result
}

const parseViewbox = (viewboxString: string): SVGViewBox => {
  const [xStart, yStart, width, height] = viewboxString
    .split(/[\s,]+/)
    .map((v) => parseFloat(v))
  return { xStart, yStart, width, height }
}

const stringifyViewbox = (viewbox: SVGViewBox): string => {
  const { xStart, yStart, width, height } = viewbox
  return `${xStart} ${yStart} ${width} ${height}`
}

const mergeViewboxes = (viewboxes: string[]): SVGViewBox => {
  const parsed = viewboxes.map(parseViewbox)
  const xStart = Math.min(...parsed.map((v) => v.xStart))
  const yStart = Math.min(...parsed.map((v) => v.yStart))
  const xEnd = Math.max(...parsed.map((v) => v.xStart + v.width))
  const yEnd = Math.max(...parsed.map((v) => v.yStart + v.height))
  return { xStart, yStart, width: xEnd - xStart, height: yEnd - yStart }
}

const addMarginToViewbox = (
  viewbox: SVGViewBox,
  marginRatio: number,
): SVGViewBox => {
  const { xStart, yStart, width, height } = viewbox
  const marginX = width * marginRatio
  const marginY = height * marginRatio
  return {
    xStart: xStart - marginX,
    yStart: yStart - marginY,
    width: width + marginX * 2,
    height: height + marginY * 2,
  }
}

// ---------------------------------------------------------------------------
// SVGGrid — coordinate grid drawn inside the SVG canvas (shared)
// ---------------------------------------------------------------------------

const SVGGrid = ({ viewbox }: { viewbox: SVGViewBox }) => {
  const { xStart, yStart, width, height } = viewbox

  const { xRange, yRange } = React.useMemo(() => {
    const gridSpacing =
      10 ** (Math.ceil(Math.log10(Math.max(width, height))) - 2)

    const xRange = range(
      Math.floor(xStart / gridSpacing) * gridSpacing,
      Math.ceil((xStart + width) / gridSpacing) * gridSpacing,
      gridSpacing,
    )

    const yRange = range(
      Math.floor(yStart / gridSpacing) * gridSpacing,
      Math.ceil((yStart + height) / gridSpacing) * gridSpacing,
      gridSpacing,
    )

    return { xRange, yRange }
  }, [width, height, xStart, yStart])

  return (
    <>
      {xRange.map((x) => (
        <line
          key={`x${x}`}
          x1={x}
          y1={yStart}
          x2={x}
          y2={yStart + height}
          stroke='currentColor'
          opacity={0.15}
          strokeWidth='0.5'
          vectorEffect='non-scaling-stroke'
        />
      ))}

      {yRange.map((y) => (
        <line
          key={`y${y}`}
          x1={xStart}
          y1={y}
          x2={xStart + width}
          y2={y}
          stroke='currentColor'
          opacity={0.15}
          strokeWidth='0.5'
          vectorEffect='non-scaling-stroke'
        />
      ))}

      <line
        x1={xStart}
        y1={0}
        x2={xStart + width}
        y2={0}
        stroke='currentColor'
        opacity={0.4}
        strokeWidth='1'
        vectorEffect='non-scaling-stroke'
      />

      <line
        x1={0}
        y1={yStart}
        x2={0}
        y2={yStart + height}
        stroke='currentColor'
        opacity={0.4}
        strokeWidth='1'
        vectorEffect='non-scaling-stroke'
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// SVGCanvas — root SVG element with optional grid (shared)
//
// contentGroupProps: attributes applied to the <g> that wraps children.
// Defaults to replicad's convention (white stroke, no fill). Pass {} to let
// the SVG content manage its own presentation (e.g. OpenSCAD output).
// ---------------------------------------------------------------------------

const SVGCanvas: React.FC<SVGCanvasProps> = ({
  viewbox,
  children,
  showGrid = true,
  contentGroupProps = { stroke: '#fff', fill: 'none' },
}) => {
  return (
    <svg
      viewBox={stringifyViewbox(viewbox)}
      style={{ width: '100%', height: '100%' }}
      xmlns='http://www.w3.org/2000/svg'
    >
      {showGrid && <SVGGrid viewbox={viewbox} />}
      <g
        id='raw-canvas'
        vectorEffect='non-scaling-stroke'
        {...contentGroupProps}
      >
        {children}
      </g>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// SVGWindow — responsive container that adapts the viewbox to its size (shared)
// ---------------------------------------------------------------------------

const SVGWindow: React.FC<SVGWindowProps> = ({
  viewbox,
  children,
  showGrid = true,
  contentGroupProps,
}) => {
  const [adaptedViewbox, setAdaptedViewBox] = React.useState(viewbox)

  const [canvasRef] = useRect(
    (rect) => {
      if (rect.width === 0 || rect.height === 0) return

      const viewBoxWithMargin = addMarginToViewbox(viewbox, 0.1)

      const canvasAspect = rect.width / rect.height

      const {
        xStart,
        yStart,
        width: vbWidth,
        height: vbHeight,
      } = viewBoxWithMargin

      const viewBoxAspect = vbWidth / vbHeight

      if (canvasAspect > viewBoxAspect) {
        const targetWidth = vbHeight * canvasAspect
        const extraWidth = targetWidth - vbWidth

        setAdaptedViewBox({
          ...viewBoxWithMargin,
          width: targetWidth,
          xStart: xStart - extraWidth / 2,
        })
      } else {
        const targetHeight = vbWidth / canvasAspect
        const extraHeight = targetHeight - vbHeight

        setAdaptedViewBox({
          ...viewBoxWithMargin,
          height: targetHeight,
          yStart: yStart - extraHeight / 2,
        })
      }
    },
    { resize: true },
  )

  return (
    <div
      className='bg-background text-foreground/80 h-full w-full'
      ref={canvasRef}
    >
      <SVGCanvas
        viewbox={adaptedViewbox}
        showGrid={showGrid}
        contentGroupProps={contentGroupProps}
      >
        {children}
      </SVGCanvas>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Replicad-specific helpers
// ---------------------------------------------------------------------------

type StrokeType = 'solid' | 'dots' | 'dashes' | undefined

const dashArray = (strokeType?: StrokeType): string | undefined => {
  switch (strokeType) {
    case 'dots':
      return '1, 2'
    case 'dashes':
      return '5, 5'
    case 'solid':
    default:
      return undefined
  }
}

const ShapePath: React.FC<ShapePathProps> = ({ shape }) => {
  const pathData = shape.paths?.flat(Infinity).join(' ') ?? ''
  return (
    <path
      d={pathData}
      strokeDasharray={dashArray(shape.strokeType)}
      vectorEffect='non-scaling-stroke'
      style={{ stroke: shape.color }}
    />
  )
}

// ---------------------------------------------------------------------------
// ReplicadSVGViewer — renders replicad SvgRenderOutput shapes
// ---------------------------------------------------------------------------

export const ReplicadSVGViewer: React.FC<ReplicadSVGViewerProps> = ({
  shapes,
}) => {
  if (!shapes?.length || shapes[0].format !== 'svg') return null

  const viewbox = mergeViewboxes(shapes.map((s) => s.viewbox))

  return (
    <SVGWindow viewbox={viewbox} showGrid>
      {shapes.map((s) =>
        s.format === 'svg' ? (
          <ShapePath
            key={s.name}
            shape={{
              paths: s.paths,
              strokeType: s.strokeType as StrokeType,
              color: s.color || 'var(--foreground)',
            }}
          />
        ) : null,
      )}
    </SVGWindow>
  )
}

// ---------------------------------------------------------------------------
// OpenSCADSVGViewer — renders a raw SVG Blob from the OpenSCAD compiler
//
// The SVG document is parsed in the browser, its viewBox is extracted and
// fed into the shared SVGWindow/SVGCanvas layout. The grid is disabled and
// presentation attributes are not overridden so the compiler's own colours
// and strokes are preserved.
// ---------------------------------------------------------------------------

export const OpenSCADSVGViewer: React.FC<OpenSCADSVGViewerProps> = ({
  blob,
}) => {
  const [svgText, setSvgText] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false

    blob.text().then((text) => {
      if (cancelled) return
      setSvgText(text)
    })

    return () => {
      cancelled = true
    }
  }, [blob])

  const data = React.useMemo(() => {
    if (!svgText) return null

    const parser = new DOMParser()
    const doc = parser.parseFromString(svgText, 'image/svg+xml')
    const svgEl = doc.documentElement
    const viewboxAttr =
      svgEl.getAttribute('viewBox') ?? svgEl.getAttribute('viewbox')
    if (!viewboxAttr) return null

    const elements = [svgEl, ...Array.from(svgEl.querySelectorAll('*'))]
    for (const el of elements) {
      if (el.hasAttribute('stroke') && el.getAttribute('stroke') !== 'none') {
        el.setAttribute('stroke', 'var(--foreground)')
      }
      const style = el.getAttribute('style')
      if (style && /stroke\s*:\s*(?!none)\S+/i.test(style)) {
        if (el instanceof SVGElement) {
          el.style.stroke = 'var(--foreground)'
        }
      }
    }

    return {
      viewbox: parseViewbox(viewboxAttr),
      inner: svgEl.innerHTML,
    }
  }, [svgText])

  if (!data) return null

  return (
    // No grid, no presentation overrides — OpenSCAD SVG manages its own style
    <SVGWindow viewbox={data.viewbox} showGrid={true} contentGroupProps={{}}>
      <g dangerouslySetInnerHTML={{ __html: data.inner }} />
    </SVGWindow>
  )
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SVGViewBox = {
  xStart: number
  yStart: number
  width: number
  height: number
}

type SVGCanvasProps = {
  viewbox: SVGViewBox
  showGrid?: boolean
  contentGroupProps?: React.SVGAttributes<SVGGElement>
  children: React.ReactNode
}

type SVGWindowProps = {
  viewbox: SVGViewBox
  showGrid?: boolean
  contentGroupProps?: React.SVGAttributes<SVGGElement>
  children: React.ReactNode
}

type SvgShape = {
  paths?: (string | string[])[]
  strokeType?: StrokeType
  color: string
}

type ShapePathProps = {
  shape: SvgShape
}

type ReplicadSVGViewerProps = {
  shapes: SvgRenderOutput[]
}

type OpenSCADSVGViewerProps = {
  blob: Blob
}
