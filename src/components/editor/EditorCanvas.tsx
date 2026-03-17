import { type Dispatch, type MouseEvent, type MutableRefObject, type PointerEvent, type SetStateAction } from 'react';
import {
  getPathBounds,
  height,
  pathData,
  sampleBezier,
  type DragTarget,
  type PathShape,
  type PenHover,
  type Tool,
  type Vec,
  width,
  WORLD_LIMIT,
} from '../../lib/editor-core';
import { type CursorZoomFocus, type MarqueeState, type TransformFrame } from '../../types/app-types';
import AnchorsOverlay from './AnchorsOverlay';
import TransformOverlay from './TransformOverlay';

type Props = {
  editorSvgRef: MutableRefObject<SVGSVGElement | null>;
  spaceDown: boolean;
  tool: Tool;
  viewOrigin: Vec;
  zoom: number;
  currentColorValue: string;
  setDrag: Dispatch<SetStateAction<DragTarget>>;
  onCanvasMove: (e: PointerEvent<SVGSVGElement>) => void;
  setCursorZoomFocus: Dispatch<SetStateAction<CursorZoomFocus | null>>;
  setPenHover: Dispatch<SetStateAction<PenHover>>;
  onCanvasClick: (e: MouseEvent<SVGSVGElement>) => void;
  clearSelection: () => void;
  toLocal: (clientX: number, clientY: number, target: SVGSVGElement) => Vec;
  marquee: MarqueeState | null;
  setMarquee: Dispatch<SetStateAction<MarqueeState | null>>;
  shapes: PathShape[];
  allPointIndicesForPath: (pathIndex: number) => number[];
  setPathSelected: Dispatch<SetStateAction<boolean>>;
  setSelectedPaths: Dispatch<SetStateAction<number[]>>;
  setSelectedPath: Dispatch<SetStateAction<number>>;
  setSelectedPoint: Dispatch<SetStateAction<number>>;
  setSelectedPoints: Dispatch<SetStateAction<number[]>>;
  enterTransformMode: () => void;
  onPathDoubleClick: (pathIndex: number) => void;
  showViewBox: boolean;
  editorDocViewBox: { minX: number; minY: number; vbW: number; vbH: number };
  docViewBox: { minX: number; minY: number; vbW: number; vbH: number };
  pathDs: string[];
  pathSelected: boolean;
  selectedPaths: number[];
  activePath: PathShape;
  selectedPoints: number[];
  selectedPoint: number;
  penHover: PenHover;
  pushUndo: () => void;
  selectedPath: number;
  transformFrame: TransformFrame | null;
  transformAllPaths: boolean;
  transformTargetIndices: number[];
  isInsideTransformFrame: (pos: Vec) => boolean;
  isOverSelectedStroke: (pos: Vec) => boolean;
  isOverSelectedFill: (pos: Vec) => boolean;
  startMoveDrag: (startPos: Vec, pointerId: number, target: SVGGeometryElement) => void;
  drag: DragTarget;
};

const EditorCanvas = ({
  editorSvgRef,
  spaceDown,
  tool,
  viewOrigin,
  zoom,
  currentColorValue,
  setDrag,
  onCanvasMove,
  setCursorZoomFocus,
  setPenHover,
  onCanvasClick,
  clearSelection,
  toLocal,
  marquee,
  setMarquee,
  shapes,
  allPointIndicesForPath,
  setPathSelected,
  setSelectedPaths,
  setSelectedPath,
  setSelectedPoint,
  setSelectedPoints,
  enterTransformMode,
  onPathDoubleClick,
  showViewBox,
  editorDocViewBox,
  docViewBox,
  pathDs,
  pathSelected,
  selectedPaths,
  activePath,
  selectedPoints,
  selectedPoint,
  penHover,
  pushUndo,
  selectedPath,
  transformFrame,
  transformAllPaths,
  transformTargetIndices,
  isInsideTransformFrame,
  isOverSelectedStroke,
  isOverSelectedFill,
  startMoveDrag,
  drag,
}: Props) => {
  const svgElement = editorSvgRef.current;
  const scaleX = svgElement ? svgElement.clientWidth / (width / zoom) : zoom;
  const scaleY = svgElement ? svgElement.clientHeight / (height / zoom) : zoom;
  const screenScale = Math.max(0.0001, Math.min(scaleX, scaleY));
  const worldUnitsPerPx = 1 / screenScale;
  const clipDefs = new Map<string, { id: string; d: string }>();
  for (const shape of shapes) {
    const ref = shape.clipPathRef.trim();
    if (!ref || !shape.clipPathPoints?.length || clipDefs.has(ref)) continue;
    clipDefs.set(ref, {
      id: `clipdef-${clipDefs.size}`,
      d: shape.clipPathMappedD ?? pathData(shape.clipPathPoints, shape.clipPathClosed),
    });
  }

  return (
    <>
          <svg
            ref={editorSvgRef}
            className={spaceDown ? 'editor pan' : tool === 'pen' ? 'editor pen' : tool === 'scale' ? 'editor scale' : 'editor'}
            tabIndex={0}
            viewBox={`${viewOrigin.x} ${viewOrigin.y} ${width / zoom} ${height / zoom}`}
            style={{ color: currentColorValue }}
            onPointerDown={(e) => {
              e.currentTarget.focus();
              if (!spaceDown) return;
              e.preventDefault();
              setDrag({
                kind: 'viewportPan',
                startClient: { x: e.clientX, y: e.clientY },
                startOrigin: { ...viewOrigin },
              });
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={onCanvasMove}
            onPointerUp={() => setDrag(null)}
            onPointerLeave={(e) => {
              setDrag(null);
              setCursorZoomFocus(null);
              if (tool === 'pen') setPenHover(null);
              e.currentTarget.style.cursor = '';
            }}
            onClick={onCanvasClick}
          >
            <defs>
              <pattern id="grid-small" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              </pattern>
              <pattern id="grid-large" width="120" height="120" patternUnits="userSpaceOnUse">
                <rect width="120" height="120" fill="url(#grid-small)" />
                <path d="M 120 0 L 0 0 0 120" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              </pattern>
              {[...clipDefs.values()].map((clip) => (
                <clipPath key={clip.id} id={clip.id} clipPathUnits="userSpaceOnUse">
                  <path d={clip.d} />
                </clipPath>
              ))}
            </defs>
            <rect
              x={-WORLD_LIMIT}
              y={-WORLD_LIMIT}
              width={WORLD_LIMIT * 2}
              height={WORLD_LIMIT * 2}
              className="grid-bg"
              fill="url(#grid-large)"
              onPointerDown={(e) => {
                if (spaceDown) return;
                e.stopPropagation();
                clearSelection();
                if (tool !== 'select') return;
                const svg = e.currentTarget.ownerSVGElement;
                if (!svg) return;
                const start = toLocal(e.clientX, e.clientY, svg);
                setMarquee({ start, current: start });
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!marquee) return;
                const svg = e.currentTarget.ownerSVGElement;
                if (!svg) return;
                const current = toLocal(e.clientX, e.clientY, svg);
                setMarquee((m) => (m ? { ...m, current } : m));
              }}
              onPointerUp={() => {
                if (!marquee) return;
                const minX = Math.min(marquee.start.x, marquee.current.x);
                const maxX = Math.max(marquee.start.x, marquee.current.x);
                const minY = Math.min(marquee.start.y, marquee.current.y);
                const maxY = Math.max(marquee.start.y, marquee.current.y);
                const w = maxX - minX;
                const h = maxY - minY;

                if (w < 2 && h < 2) {
                  setMarquee(null);
                  return;
                }

                const hits = shapes
                  .map((shape, i) => ({ i, b: getPathBounds(shape.points) }))
                  .filter(({ b }) => b !== null)
                  .filter(({ b }) => {
                    if (!b) return false;
                    return b.minX >= minX && b.maxX <= maxX && b.minY >= minY && b.maxY <= maxY;
                  })
                  .map(({ i }) => i);

                if (hits.length) {
                  const all = allPointIndicesForPath(hits[0]);
                  setPathSelected(true);
                  setSelectedPaths(hits);
                  setSelectedPath(hits[0]);
                  setSelectedPoint(all[0]);
                  setSelectedPoints(all);
                  enterTransformMode();
                }
                setMarquee(null);
              }}
            />
            {showViewBox ? (
              <>
                <rect
                  x={editorDocViewBox.minX}
                  y={editorDocViewBox.minY}
                  width={editorDocViewBox.vbW}
                  height={editorDocViewBox.vbH}
                  className="viewbox-overlay"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
                <text
                  x={editorDocViewBox.minX + 8 / zoom}
                  y={editorDocViewBox.minY + 16 / zoom}
                  className="viewbox-label"
                  style={{ fontSize: `${11 / zoom}px` }}
                  pointerEvents="none"
                >
                  {`viewBox ${docViewBox.minX.toFixed(2)} ${docViewBox.minY.toFixed(2)} ${docViewBox.vbW.toFixed(2)} ${docViewBox.vbH.toFixed(2)}`}
                </text>
              </>
            ) : null}

            {shapes.map((shape, i) => (
              <path
                key={shape.id}
                d={pathDs[i]}
                clipPath={(() => {
                  const ref = shape.clipPathRef.trim();
                  if (!ref) return undefined;
                  const clip = clipDefs.get(ref);
                  return clip ? `url(#${clip.id})` : undefined;
                })()}
                fill={shape.fillExplicit ? shape.fill : 'currentColor'}
                stroke={shape.strokeExplicit ? shape.stroke : 'none'}
                strokeWidth={shape.strokeWidthExplicit ? shape.strokeWidth : undefined}
                strokeLinecap={shape.strokeLinecapExplicit ? shape.strokeLinecap : undefined}
                strokeLinejoin={shape.strokeLinejoinExplicit ? shape.strokeLinejoin : undefined}
                opacity={shape.opacityExplicit ? shape.opacity : 1}
                onPointerDown={(e) => {
                  if (!spaceDown && (tool === 'select' || tool === 'scale')) {
                    setPathSelected(true);
                    enterTransformMode();
                    if (e.shiftKey) {
                      setSelectedPaths((curr) => {
                        const exists = curr.includes(i);
                        const next = exists ? curr.filter((v) => v !== i) : [...curr, i].sort((a, b) => a - b);
                        const safe = next.length ? next : [i];
                        const all = allPointIndicesForPath(safe[0]);
                        setSelectedPath(safe[0]);
                        setSelectedPoint(all[0]);
                        setSelectedPoints(all);
                        return safe;
                      });
                    } else {
                      const all = allPointIndicesForPath(i);
                      const preserveGroupSelection = selectedPaths.length > 1 && selectedPaths.includes(i);
                      if (!preserveGroupSelection) setSelectedPaths([i]);
                      setSelectedPath(i);
                      setSelectedPoint(all[0]);
                      setSelectedPoints(all);
                    }
                  }
                }}
                onDoubleClick={() => {
                  onPathDoubleClick(i);
                }}
              />
            ))}
            {pathSelected
              ? selectedPaths.map((idx) => (
                  <path
                    key={`sel-${shapes[idx]?.id ?? idx}`}
                    d={pathDs[idx]}
                    fill="none"
                    stroke="#ff9a00"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                    opacity={1}
                    pointerEvents="none"
                  />
                ))
              : null}

            <TransformOverlay
              pathSelected={pathSelected}
              tool={tool}
              transformFrame={transformFrame}
              zoom={zoom}
              spaceDown={spaceDown}
              toLocal={toLocal}
              isInsideTransformFrame={isInsideTransformFrame}
              isOverSelectedStroke={isOverSelectedStroke}
              isOverSelectedFill={isOverSelectedFill}
              clearSelection={clearSelection}
              startMoveDrag={startMoveDrag}
              pushUndo={pushUndo}
              setDrag={setDrag}
              selectedPath={selectedPath}
              transformAllPaths={transformAllPaths}
              selectedPaths={selectedPaths}
              transformTargetIndices={transformTargetIndices}
              shapes={shapes}
              drag={drag}
            />

            <AnchorsOverlay
              pathSelected={pathSelected}
              selectedPaths={selectedPaths}
              activePath={activePath}
              tool={tool}
              selectedPoints={selectedPoints}
              selectedPoint={selectedPoint}
              worldUnitsPerPx={worldUnitsPerPx}
              penHover={penHover}
              spaceDown={spaceDown}
              pushUndo={pushUndo}
              toLocal={toLocal}
              setSelectedPoint={setSelectedPoint}
              setSelectedPoints={setSelectedPoints}
              setDrag={setDrag}
              selectedPath={selectedPath}
            />

            {tool === 'pen' && penHover?.kind === 'segment' ? (
              <rect
                x={
                  sampleBezier(
                    activePath.points[penHover.segmentIndex].p,
                    activePath.points[penHover.segmentIndex].out ?? activePath.points[penHover.segmentIndex].p,
                    activePath.points[(penHover.segmentIndex + 1) % activePath.points.length].in ??
                      activePath.points[(penHover.segmentIndex + 1) % activePath.points.length].p,
                    activePath.points[(penHover.segmentIndex + 1) % activePath.points.length].p,
                    0.5,
                  ).x - 3 * worldUnitsPerPx
                }
                y={
                  sampleBezier(
                    activePath.points[penHover.segmentIndex].p,
                    activePath.points[penHover.segmentIndex].out ?? activePath.points[penHover.segmentIndex].p,
                    activePath.points[(penHover.segmentIndex + 1) % activePath.points.length].in ??
                      activePath.points[(penHover.segmentIndex + 1) % activePath.points.length].p,
                    activePath.points[(penHover.segmentIndex + 1) % activePath.points.length].p,
                    0.5,
                  ).y - 3 * worldUnitsPerPx
                }
                width={6 * worldUnitsPerPx}
                height={6 * worldUnitsPerPx}
                className="pen-add"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}

            {marquee ? (
              <rect
                x={Math.min(marquee.start.x, marquee.current.x)}
                y={Math.min(marquee.start.y, marquee.current.y)}
                width={Math.abs(marquee.current.x - marquee.start.x)}
                height={Math.abs(marquee.current.y - marquee.start.y)}
                fill="none"
                stroke="#ff9a00"
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.8}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ) : null}
          </svg>
    </>
  );
};

export default EditorCanvas;
