import { type Dispatch, type SetStateAction } from 'react';
import { cloneShapes, rotateAround, type DragTarget, type PathShape, type Tool, type Vec } from '../../lib/editor-core';
import { type TransformFrame } from '../../types/app-types';

type Props = {
  pathSelected: boolean;
  tool: Tool;
  transformFrame: TransformFrame | null;
  zoom: number;
  spaceDown: boolean;
  toLocal: (clientX: number, clientY: number, target: SVGSVGElement) => Vec;
  isInsideTransformFrame: (pos: Vec) => boolean;
  isOverSelectedStroke: (pos: Vec) => boolean;
  isOverSelectedFill: (pos: Vec) => boolean;
  clearSelection: () => void;
  startMoveDrag: (startPos: Vec, pointerId: number, target: SVGGeometryElement) => void;
  pushUndo: () => void;
  setDrag: Dispatch<SetStateAction<DragTarget>>;
  selectedPath: number;
  transformAllPaths: boolean;
  selectedPaths: number[];
  transformTargetIndices: number[];
  shapes: PathShape[];
  drag: DragTarget;
};

const TransformOverlay = ({
  pathSelected,
  tool,
  transformFrame,
  zoom,
  spaceDown,
  toLocal,
  isInsideTransformFrame,
  isOverSelectedStroke,
  isOverSelectedFill,
  clearSelection,
  startMoveDrag,
  pushUndo,
  setDrag,
  selectedPath,
  transformAllPaths,
  selectedPaths,
  transformTargetIndices,
  shapes,
  drag,
}: Props) => {
  return (
    <>
            {pathSelected && (tool === 'scale' || tool === 'select') && transformFrame ? (
              <>
                {(() => {
                  const b = transformFrame;
                  const c = { x: b.cx, y: b.cy };
                  const rot = (p: Vec) => rotateAround(p, c, b.angle);
                  const tl = rot({ x: b.minX, y: b.minY });
                  const tr = rot({ x: b.maxX, y: b.minY });
                  const br = rot({ x: b.maxX, y: b.maxY });
                  const bl = rot({ x: b.minX, y: b.maxY });
                  const topMid = rot({ x: b.cx, y: b.minY });
                  const rightMid = rot({ x: b.maxX, y: b.cy });
                  const bottomMid = rot({ x: b.cx, y: b.maxY });
                  const leftMid = rot({ x: b.minX, y: b.cy });
                  const sizeLabel = `${(b.maxX - b.minX).toFixed(1)} x ${(b.maxY - b.minY).toFixed(1)}`;
                  const labelFontSize = 9 / zoom;
                  const labelWidth = (sizeLabel.length * 5.5 + 8) / zoom;
                  const labelHeight = 14 / zoom;
                  const down = { x: -Math.sin(b.angle), y: Math.cos(b.angle) };
                  const labelOffset = 5 / zoom + labelHeight / 2;
                  const labelCx = bottomMid.x + down.x * labelOffset;
                  const labelCy = bottomMid.y + down.y * labelOffset;
                  const rotArmEnd = rot({ x: b.cx, y: b.minY - 18 / zoom });
                  const rotHandle = rot({ x: b.cx, y: b.minY - 22 / zoom });
                  const axisX1 = rot({ x: b.cx - 8 / zoom, y: b.cy });
                  const axisX2 = rot({ x: b.cx + 8 / zoom, y: b.cy });
                  const axisY1 = rot({ x: b.cx, y: b.cy - 8 / zoom });
                  const axisY2 = rot({ x: b.cx, y: b.cy + 8 / zoom });
                  return (
                    <>
                <path
                  d={`M ${tl.x} ${tl.y} L ${tr.x} ${tr.y} L ${br.x} ${br.y} L ${bl.x} ${bl.y} Z`}
                  className="scale-move-hit"
                  onPointerDown={(e) => {
                    if (spaceDown) return;
                    e.stopPropagation();
                    const svg = e.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    const startPos = toLocal(e.clientX, e.clientY, svg);
                    if (tool === 'select') {
                      if (!isInsideTransformFrame(startPos) || (!isOverSelectedStroke(startPos) && !isOverSelectedFill(startPos))) {
                        clearSelection();
                        return;
                      }
                    }
                    startMoveDrag(startPos, e.pointerId, e.currentTarget);
                  }}
                />
                <path
                  d={`M ${tl.x} ${tl.y} L ${tr.x} ${tr.y} L ${br.x} ${br.y} L ${bl.x} ${bl.y} Z`}
                  className="scale-box"
                  vectorEffect="non-scaling-stroke"
                />
                <g className="scale-size-tag" pointerEvents="none">
                  <rect
                    x={labelCx - labelWidth / 2}
                    y={labelCy - labelHeight / 2}
                    width={labelWidth}
                    height={labelHeight}
                    rx={3 / zoom}
                    ry={3 / zoom}
                    className="scale-size-tag-box"
                  />
                  <text
                    x={labelCx}
                    y={labelCy}
                    className="scale-size-tag-text"
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{ fontSize: `${labelFontSize}px` }}
                  >
                    {sizeLabel}
                  </text>
                </g>
                <line
                  x1={tl.x}
                  y1={tl.y}
                  x2={tr.x}
                  y2={tr.y}
                  className="scale-edge-hit n"
                  strokeWidth={12 / zoom}
                  onPointerDown={(e) => {
                    if (spaceDown) return;
                    e.stopPropagation();
                    pushUndo();
                    const svg = e.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    const startPos = toLocal(e.clientX, e.clientY, svg);
                    setDrag({
                      kind: 'scale',
                      pathIndex: selectedPath,
                      affectAll: transformAllPaths || selectedPaths.length > 1,
                      targetPathIndices: transformTargetIndices,
                      axis: 'y',
                      originOpp: bottomMid,
                      originCenter: { x: b.cx, y: b.cy },
                      startVecOpp: { x: startPos.x - bottomMid.x, y: startPos.y - bottomMid.y },
                      startVecCenter: { x: startPos.x - b.cx, y: startPos.y - b.cy },
                      baseShapes: cloneShapes(shapes),
                    });
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                />
                <line
                  x1={tr.x}
                  y1={tr.y}
                  x2={br.x}
                  y2={br.y}
                  className="scale-edge-hit e"
                  strokeWidth={12 / zoom}
                  onPointerDown={(e) => {
                    if (spaceDown) return;
                    e.stopPropagation();
                    pushUndo();
                    const svg = e.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    const startPos = toLocal(e.clientX, e.clientY, svg);
                    setDrag({
                      kind: 'scale',
                      pathIndex: selectedPath,
                      affectAll: transformAllPaths || selectedPaths.length > 1,
                      targetPathIndices: transformTargetIndices,
                      axis: 'x',
                      originOpp: leftMid,
                      originCenter: { x: b.cx, y: b.cy },
                      startVecOpp: { x: startPos.x - leftMid.x, y: startPos.y - leftMid.y },
                      startVecCenter: { x: startPos.x - b.cx, y: startPos.y - b.cy },
                      baseShapes: cloneShapes(shapes),
                    });
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                />
                <line
                  x1={bl.x}
                  y1={bl.y}
                  x2={br.x}
                  y2={br.y}
                  className="scale-edge-hit s"
                  strokeWidth={12 / zoom}
                  onPointerDown={(e) => {
                    if (spaceDown) return;
                    e.stopPropagation();
                    pushUndo();
                    const svg = e.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    const startPos = toLocal(e.clientX, e.clientY, svg);
                    setDrag({
                      kind: 'scale',
                      pathIndex: selectedPath,
                      affectAll: transformAllPaths || selectedPaths.length > 1,
                      targetPathIndices: transformTargetIndices,
                      axis: 'y',
                      originOpp: topMid,
                      originCenter: { x: b.cx, y: b.cy },
                      startVecOpp: { x: startPos.x - topMid.x, y: startPos.y - topMid.y },
                      startVecCenter: { x: startPos.x - b.cx, y: startPos.y - b.cy },
                      baseShapes: cloneShapes(shapes),
                    });
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                />
                <line
                  x1={tl.x}
                  y1={tl.y}
                  x2={bl.x}
                  y2={bl.y}
                  className="scale-edge-hit w"
                  strokeWidth={12 / zoom}
                  onPointerDown={(e) => {
                    if (spaceDown) return;
                    e.stopPropagation();
                    pushUndo();
                    const svg = e.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    const startPos = toLocal(e.clientX, e.clientY, svg);
                    setDrag({
                      kind: 'scale',
                      pathIndex: selectedPath,
                      affectAll: transformAllPaths || selectedPaths.length > 1,
                      targetPathIndices: transformTargetIndices,
                      axis: 'x',
                      originOpp: rightMid,
                      originCenter: { x: b.cx, y: b.cy },
                      startVecOpp: { x: startPos.x - rightMid.x, y: startPos.y - rightMid.y },
                      startVecCenter: { x: startPos.x - b.cx, y: startPos.y - b.cy },
                      baseShapes: cloneShapes(shapes),
                    });
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                />
                {(
                  [
                    {
                      corner: 'nw',
                      x: b.minX,
                      y: b.minY,
                      ox: b.maxX,
                      oy: b.maxY,
                      cx: b.cx,
                      cy: b.cy,
                    },
                    {
                      corner: 'ne',
                      x: b.maxX,
                      y: b.minY,
                      ox: b.minX,
                      oy: b.maxY,
                      cx: b.cx,
                      cy: b.cy,
                    },
                    {
                      corner: 'se',
                      x: b.maxX,
                      y: b.maxY,
                      ox: b.minX,
                      oy: b.minY,
                      cx: b.cx,
                      cy: b.cy,
                    },
                    {
                      corner: 'sw',
                      x: b.minX,
                      y: b.maxY,
                      ox: b.maxX,
                      oy: b.minY,
                      cx: b.cx,
                      cy: b.cy,
                    },
                  ] as const
                ).map((h) => (
                  (() => {
                    const rp = rot({ x: h.x, y: h.y });
                    const ro = rot({ x: h.ox, y: h.oy });
                    const rc = rot({ x: h.cx, y: h.cy });
                    return (
                  <rect
                    key={h.corner}
                    x={rp.x - 2 / zoom}
                    y={rp.y - 2 / zoom}
                    width={4 / zoom}
                    height={4 / zoom}
                    className={`scale-handle ${h.corner}${drag?.kind === 'scale' ? ' active' : ''}`}
                    style={{ strokeWidth: 1.1 / zoom }}
                    vectorEffect="non-scaling-stroke"
                    onPointerDown={(e) => {
                      if (spaceDown) return;
                      e.stopPropagation();
                      pushUndo();
                      setDrag({
                        kind: 'scale',
                        pathIndex: selectedPath,
                        affectAll: transformAllPaths || selectedPaths.length > 1,
                        targetPathIndices: transformTargetIndices,
                        axis: 'both',
                        originOpp: ro,
                        originCenter: rc,
                        startVecOpp: { x: rp.x - ro.x, y: rp.y - ro.y },
                        startVecCenter: { x: rp.x - rc.x, y: rp.y - rc.y },
                        baseShapes: cloneShapes(shapes),
                      });
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                  />
                    );
                  })()
                ))}
                {(
                  [
                    {
                      edge: 'n',
                      x: b.cx,
                      y: b.minY,
                      ox: b.cx,
                      oy: b.maxY,
                      cx: b.cx,
                      cy: b.cy,
                      axis: 'y' as const,
                    },
                    {
                      edge: 'e',
                      x: b.maxX,
                      y: b.cy,
                      ox: b.minX,
                      oy: b.cy,
                      cx: b.cx,
                      cy: b.cy,
                      axis: 'x' as const,
                    },
                    {
                      edge: 's',
                      x: b.cx,
                      y: b.maxY,
                      ox: b.cx,
                      oy: b.minY,
                      cx: b.cx,
                      cy: b.cy,
                      axis: 'y' as const,
                    },
                    {
                      edge: 'w',
                      x: b.minX,
                      y: b.cy,
                      ox: b.maxX,
                      oy: b.cy,
                      cx: b.cx,
                      cy: b.cy,
                      axis: 'x' as const,
                    },
                  ] as const
                ).map((h) => (
                  (() => {
                    const rp = rot({ x: h.x, y: h.y });
                    const ro = rot({ x: h.ox, y: h.oy });
                    const rc = rot({ x: h.cx, y: h.cy });
                    return (
                  <rect
                    key={h.edge}
                    x={rp.x - 2 / zoom}
                    y={rp.y - 2 / zoom}
                    width={4 / zoom}
                    height={4 / zoom}
                    className={`scale-handle ${h.edge}${drag?.kind === 'scale' ? ' active' : ''}`}
                    style={{ strokeWidth: 1.1 / zoom }}
                    vectorEffect="non-scaling-stroke"
                    onPointerDown={(e) => {
                      if (spaceDown) return;
                      e.stopPropagation();
                      pushUndo();
                      setDrag({
                        kind: 'scale',
                        pathIndex: selectedPath,
                        affectAll: transformAllPaths || selectedPaths.length > 1,
                        targetPathIndices: transformTargetIndices,
                        axis: h.axis,
                        originOpp: ro,
                        originCenter: rc,
                        startVecOpp: { x: rp.x - ro.x, y: rp.y - ro.y },
                        startVecCenter: { x: rp.x - rc.x, y: rp.y - rc.y },
                        baseShapes: cloneShapes(shapes),
                      });
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                  />
                    );
                  })()
                ))}
                <line
                  x1={topMid.x}
                  y1={topMid.y}
                  x2={rotArmEnd.x}
                  y2={rotArmEnd.y}
                  className="scale-rotate-arm"
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={rotHandle.x}
                  cy={rotHandle.y}
                  r={3 / zoom}
                  className={`scale-rotate-handle${drag?.kind === 'rotate' ? ' active' : ''}`}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(e) => {
                    if (spaceDown) return;
                    e.stopPropagation();
                    pushUndo();
                    const svg = e.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    const startPos = toLocal(e.clientX, e.clientY, svg);
                    setDrag({
                      kind: 'rotate',
                      pathIndex: selectedPath,
                      affectAll: transformAllPaths || selectedPaths.length > 1,
                      targetPathIndices: transformTargetIndices,
                      originCenter: { x: b.cx, y: b.cy },
                      startAngle: Math.atan2(startPos.y - b.cy, startPos.x - b.cx),
                      baseShapes: cloneShapes(shapes),
                    });
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                />
                <circle
                  cx={b.cx}
                  cy={b.cy}
                  r={8 / zoom}
                  className="scale-pivot-hit"
                  onPointerDown={(e) => {
                    if (spaceDown) return;
                    e.stopPropagation();
                    const svg = e.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    const startPos = toLocal(e.clientX, e.clientY, svg);
                    startMoveDrag(startPos, e.pointerId, e.currentTarget);
                  }}
                />
                <circle cx={b.cx} cy={b.cy} r={3.2 / zoom} className="scale-pivot" vectorEffect="non-scaling-stroke" />
                <line
                  x1={axisX1.x}
                  y1={axisX1.y}
                  x2={axisX2.x}
                  y2={axisX2.y}
                  className="scale-pivot-line"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={axisY1.x}
                  y1={axisY1.y}
                  x2={axisY2.x}
                  y2={axisY2.y}
                  className="scale-pivot-line"
                  vectorEffect="non-scaling-stroke"
                />
                    </>
                  );
                })()}
              </>
            ) : null}

    </>
  );
};

export default TransformOverlay;
