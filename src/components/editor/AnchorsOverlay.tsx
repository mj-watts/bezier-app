import { type Dispatch, type SetStateAction } from 'react';
import { clonePoint, editablePoint, type DragTarget, type PathShape, type PenHover, type Tool, type Vec } from '../../lib/editor-core';

type Props = {
  pathSelected: boolean;
  selectedPaths: number[];
  activePath: PathShape;
  tool: Tool;
  selectedPoints: number[];
  selectedPoint: number;
  worldUnitsPerPx: number;
  penHover: PenHover;
  altDown: boolean;
  spaceDown: boolean;
  pushUndo: () => void;
  toLocal: (clientX: number, clientY: number, target: SVGSVGElement) => Vec;
  setSelectedPoint: Dispatch<SetStateAction<number>>;
  setSelectedPoints: Dispatch<SetStateAction<number[]>>;
  setDrag: Dispatch<SetStateAction<DragTarget>>;
  selectedPath: number;
};

const AnchorsOverlay = ({
  pathSelected,
  selectedPaths,
  activePath,
  tool,
  selectedPoints,
  selectedPoint,
  worldUnitsPerPx,
  penHover,
  altDown,
  spaceDown,
  pushUndo,
  toLocal,
  setSelectedPoint,
  setSelectedPoints,
  setDrag,
  selectedPath,
}: Props) => {
  const maxPointDiameterPx = 6;
  const handleDiameterPx = Math.min(4, maxPointDiameterPx);
  const handleRadius = (handleDiameterPx / 2) * worldUnitsPerPx;
  const anchorDiameterFor = (isPrimary: boolean) => Math.min(isPrimary ? 5 : 4, maxPointDiameterPx) * worldUnitsPerPx;

  return (
    <>
            {pathSelected &&
              selectedPaths.length === 1 &&
              activePath.points.map((point) => tool === 'pen' ? editablePoint(point) : point).map((pt, i) => (
              <g key={pt.id}>
                {(tool === 'select' || tool === 'pen') && selectedPoints.length === 1 && i === selectedPoint && pt.in && (
                  <>
                    <line
                      x1={pt.p.x}
                      y1={pt.p.y}
                      x2={pt.in.x}
                      y2={pt.in.y}
                      className="guide"
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      cx={pt.in.x}
                      cy={pt.in.y}
                      r={handleRadius}
                      className="handle in"
                      onPointerDown={(e) => {
                        if (tool !== 'select' || spaceDown) return;
                        e.stopPropagation();
                        pushUndo();
                        const svg = e.currentTarget.ownerSVGElement;
                        if (!svg) return;
                        const startPos = toLocal(e.clientX, e.clientY, svg);
                        setSelectedPoint(i);
                        setSelectedPoints([i]);
                        setDrag({ kind: 'in', pathIndex: selectedPath, pointIndex: i, startPos, base: clonePoint(pt) });
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                    />
                  </>
                )}

                {(tool === 'select' || tool === 'pen') && selectedPoints.length === 1 && i === selectedPoint && pt.out && (
                  <>
                    <line
                      x1={pt.p.x}
                      y1={pt.p.y}
                      x2={pt.out.x}
                      y2={pt.out.y}
                      className="guide"
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      cx={pt.out.x}
                      cy={pt.out.y}
                      r={handleRadius}
                      className="handle out"
                      onPointerDown={(e) => {
                        if (tool !== 'select' || spaceDown) return;
                        e.stopPropagation();
                        pushUndo();
                        const svg = e.currentTarget.ownerSVGElement;
                        if (!svg) return;
                        const startPos = toLocal(e.clientX, e.clientY, svg);
                        setSelectedPoint(i);
                        setSelectedPoints([i]);
                        setDrag({ kind: 'out', pathIndex: selectedPath, pointIndex: i, startPos, base: clonePoint(pt) });
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                    />
                  </>
                )}

                <rect
                  x={pt.p.x - anchorDiameterFor(selectedPoints.length === 1 && i === selectedPoint) / 2}
                  y={pt.p.y - anchorDiameterFor(selectedPoints.length === 1 && i === selectedPoint) / 2}
                  width={anchorDiameterFor(selectedPoints.length === 1 && i === selectedPoint)}
                  height={anchorDiameterFor(selectedPoints.length === 1 && i === selectedPoint)}
                  className={
                    altDown && penHover?.kind === 'anchor' && penHover.pathIndex === selectedPath && penHover.pointIndex === i
                      ? 'anchor pen-delete'
                      : selectedPoints.includes(i)
                        ? 'anchor selected'
                        : 'anchor'
                  }
                  style={{ strokeWidth: selectedPoints.length === 1 && i === selectedPoint ? 1.4 : 1.1 }}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(e) => {
                    if (tool !== 'select' || spaceDown) return;
                    e.stopPropagation();
                    if (e.shiftKey) {
                      setSelectedPoints((currSel) => {
                        const exists = currSel.includes(i);
                        const next = exists ? currSel.filter((v) => v !== i) : [...currSel, i].sort((a, b) => a - b);
                        const safe = next.length ? next : [i];
                        setSelectedPoint(safe[safe.length - 1]);
                        return safe;
                      });
                      return;
                    }
                    pushUndo();
                    const svg = e.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    const startPos = toLocal(e.clientX, e.clientY, svg);
                    setSelectedPoint(i);
                    setSelectedPoints([i]);
                    setDrag({ kind: 'anchor', pathIndex: selectedPath, pointIndex: i, startPos, base: clonePoint(pt) });
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                />
              </g>
            ))}

    </>
  );
};

export default AnchorsOverlay;
