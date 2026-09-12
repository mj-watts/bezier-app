import { type Dispatch, type PointerEvent, type SetStateAction } from 'react';
import { type DragTarget, type Vec, type ViewBox } from '../../lib/editor-core';

type Props = {
  frame: ViewBox;
  viewBox: ViewBox;
  unitsPerPx: number;
  spaceDown: boolean;
  toLocal: (x: number, y: number, svg: SVGSVGElement) => Vec;
  pushUndo: () => void;
  setDrag: Dispatch<SetStateAction<DragTarget>>;
};

export default function ViewBoxOverlay({ frame, viewBox, unitsPerPx, spaceDown, toLocal, pushUndo, setDrag }: Props) {
  const { minX: x, minY: y, vbW: w, vbH: h } = frame;
  const handles = [
    ['nw', x, y], ['n', x + w / 2, y], ['ne', x + w, y], ['e', x + w, y + h / 2],
    ['se', x + w, y + h], ['s', x + w / 2, y + h], ['sw', x, y + h], ['w', x, y + h / 2],
  ] as const;
  const start = (event: PointerEvent<SVGRectElement>, handle: string) => {
    if (spaceDown) return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    event.stopPropagation();
    event.preventDefault();
    svg.focus({ preventScroll: true });
    pushUndo();
    setDrag({ kind: 'viewBox', handle, startPos: toLocal(event.clientX, event.clientY, svg), base: { ...viewBox } });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  return (
    <g className="viewbox-top-layer">
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="transparent" strokeWidth={10}
        vectorEffect="non-scaling-stroke" pointerEvents="stroke" style={{ cursor: 'move' }}
        onPointerDown={(event) => start(event, 'move')} />
      <rect x={x} y={y} width={w} height={h} className="viewbox-overlay" vectorEffect="non-scaling-stroke"
        onPointerDown={(event) => start(event, 'move')} />
      {handles.map(([handle, hx, hy]) => (
        <rect key={handle} data-viewbox-handle={handle} className="viewbox-handle"
          x={hx - 4 * unitsPerPx} y={hy - 4 * unitsPerPx} width={8 * unitsPerPx} height={8 * unitsPerPx}
          vectorEffect="non-scaling-stroke" style={{ cursor: `${handle}-resize` }}
          onPointerDown={(event) => start(event, handle)} />
      ))}
      <text x={x + w / 2} y={y + h + 18 * unitsPerPx} textAnchor="middle" pointerEvents="none"
        fill="#ffb64d" style={{ fontSize: 11 * unitsPerPx }}>
        {`${viewBox.vbW.toFixed(1)} × ${viewBox.vbH.toFixed(1)}`}
      </text>
    </g>
  );
}
