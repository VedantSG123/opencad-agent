import * as React from 'react';
import { useRect } from 'react-use-rect';

import type { SvgRenderOutput } from '@/types';

const range = (start: number, end: number, step = 1) => {
  const result = [];
  for (let i = start; i < end; i += step) {
    result.push(i);
  }
  return result;
};

const parseViewbox = (viewboxString: string): SVGViewBox => {
  const [xStart, yStart, width, height] = viewboxString
    .split(' ')
    .map((v) => parseFloat(v));
  return { xStart, yStart, width, height };
};

const stringifyViewbox = (viewbox: SVGViewBox): string => {
  const { xStart, yStart, width, height } = viewbox;
  return `${xStart} ${yStart} ${width} ${height}`;
};

const mergeViewboxes = (viewboxes: string[]): SVGViewBox => {
  const parsed = viewboxes.map(parseViewbox);

  const xStart = Math.min(...parsed.map((v) => v.xStart));
  const yStart = Math.min(...parsed.map((v) => v.yStart));
  const xEnd = Math.max(...parsed.map((v) => v.xStart + v.width));
  const yEnd = Math.max(...parsed.map((v) => v.yStart + v.height));

  return {
    xStart,
    yStart,
    width: xEnd - xStart,
    height: yEnd - yStart,
  };
};

const addMarginToViewbox = (
  viewbox: SVGViewBox,
  marginRatio: number,
): SVGViewBox => {
  const { xStart, yStart, width, height } = viewbox;
  const marginX = width * marginRatio;
  const marginY = height * marginRatio;
  return {
    xStart: xStart - marginX,
    yStart: yStart - marginY,
    width: width + marginX * 2,
    height: height + marginY * 2,
  };
};

const dashArray = (strokeType?: StrokeType): string | undefined => {
  switch (strokeType) {
    case 'dots':
      return '1, 2';
    case 'dashes':
      return '5, 5';
    case 'solid':
    default:
      return undefined;
  }
};

const SVGGrid = ({ viewbox }: { viewbox: SVGViewBox }) => {
  const { xStart, yStart, width, height } = viewbox;

  const { xRange, yRange } = React.useMemo(() => {
    const gridSpacing =
      10 ** (Math.ceil(Math.log10(Math.max(width, height))) - 1);

    const xRange = range(
      Math.floor(xStart / gridSpacing) * gridSpacing,
      Math.ceil((xStart + width) / gridSpacing) * gridSpacing,
      gridSpacing,
    );
    const yRange = range(
      Math.floor(yStart / gridSpacing) * gridSpacing,
      Math.ceil((yStart + height) / gridSpacing) * gridSpacing,
      gridSpacing,
    );
    return { xRange, yRange };
  }, [width, height, xStart, yStart]);

  const grid = [
    ...xRange.map((x) => (
      <line
        key={`x${x}`}
        x1={x}
        y1={yStart}
        x2={x}
        y2={yStart + height}
        vectorEffect='non-scaling-stroke'
        strokeWidth='0.5'
      />
    )),
    ...yRange.map((y) => (
      <line
        key={`y${y}`}
        x1={xStart}
        y1={y}
        x2={xStart + width}
        y2={y}
        vectorEffect='non-scaling-stroke'
        strokeWidth='0.5'
      />
    )),
  ];

  return (
    <>
      {grid}
      <line
        x1={xStart}
        y1={0}
        x2={xStart + width}
        y2={0}
        vectorEffect='non-scaling-stroke'
        strokeWidth='5'
      />
      <line
        x1={0}
        y1={yStart}
        x2={0}
        y2={yStart + height}
        vectorEffect='non-scaling-stroke'
        strokeWidth='5'
      />
    </>
  );
};

const ShapePath: React.FC<ShapePathProps> = ({ shape }) => {
  const pathData = shape.paths?.flat(Infinity).join(' ') ?? '';

  return (
    <path
      d={pathData}
      strokeDasharray={dashArray(shape.strokeType)}
      vectorEffect='non-scaling-stroke'
      style={{ stroke: shape.color }}
    />
  );
};

const SVGWindow: React.FC<SVGWindowProps> = ({ viewbox, children }) => {
  const [adaptedViewbox, setAdaptedViewBox] = React.useState(viewbox);
  const [canvasRef] = useRect(
    (rect) => {
      const viewBoxWithMargin = addMarginToViewbox(viewbox, 0.1);
      const { width, height } = rect;
      const { width: viewBoxWidth, height: viewBoxHeight } = viewBoxWithMargin;

      const rectAspect = width / height;
      const viewBoxAspect = viewBoxWidth / viewBoxHeight;

      const resizeAlong = rectAspect > viewBoxAspect ? 'width' : 'height';

      if (resizeAlong === 'width') {
        const spacing = viewBoxAspect * height - width;
        setAdaptedViewBox({
          ...viewBoxWithMargin,
          width: viewBoxWidth + spacing,
          xStart: viewBoxWithMargin.xStart - spacing / 2,
        });
      } else {
        const spacing = width / viewBoxAspect - height;
        setAdaptedViewBox({
          ...viewBoxWithMargin,
          height: viewBoxHeight + spacing,
          yStart: viewBoxWithMargin.yStart - spacing / 2,
        });
      }
    },
    { resize: true },
  );
  return (
    <div className='bg-background flex flex-1' ref={canvasRef}>
      <SVGCanvas viewbox={adaptedViewbox}>{children}</SVGCanvas>
    </div>
  );
};

const SVGCanvas: React.FC<SVGCanvasProps> = ({ viewbox, children }) => {
  return (
    <svg
      viewBox={stringifyViewbox(viewbox)}
      style={{ width: '100%', height: '100%' }}
      xmlns='http://www.w3.org/2000/svg'
    >
      <SVGGrid viewbox={viewbox} />
      <g
        stroke={'#fff'}
        id='raw-canvas'
        vectorEffect='non-scaling-stroke'
        fill='none'
      >
        {children}
      </g>
    </svg>
  );
};

export const SVGViewer: React.FC<SvgViewerProps> = ({ shapes }) => {
  if (shapes && shapes.length && shapes[0].format === 'svg') {
    const viewbox = mergeViewboxes(shapes.map((s) => s.viewbox));
    return (
      <SVGWindow viewbox={viewbox}>
        {shapes.map((s) => {
          if (s && s.format === 'svg')
            return (
              <ShapePath
                shape={{
                  paths: s.paths,
                  strokeType: s.strokeType as StrokeType,
                  color: s.color || '#fff',
                }}
                key={s.name}
              />
            );
          return null;
        })}
      </SVGWindow>
    );
  }
  return null;
};

type SVGWindowProps = {
  viewbox: SVGViewBox;
  children: React.ReactNode;
};

type SVGCanvasProps = {
  viewbox: SVGViewBox;
  children: React.ReactNode;
};

type SVGViewBox = {
  xStart: number;
  yStart: number;
  width: number;
  height: number;
};

type StrokeType = 'solid' | 'dots' | 'dashes' | undefined;

type SvgShape = {
  paths?: (string | string[])[];
  strokeType?: StrokeType;
  color: string;
};

type ShapePathProps = {
  shape: SvgShape;
};

type SvgViewerProps = {
  shapes: SvgRenderOutput[];
};
