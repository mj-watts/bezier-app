import { Expand, Merge, MousePointer2, PaintBucket, PenLine, PenTool, SquareDashed, WandSparkles } from 'lucide-react';

type Tool = 'select' | 'pen' | 'scale';
type StylePanel = 'fill' | 'stroke' | 'opacity';

type Props = {
  tool: Tool;
  styleMenuKind: StylePanel | null;
  setStyleTriggerRef: (index: number, el: HTMLButtonElement | null) => void;
  onSelectTool: () => void;
  onPenTool: () => void;
  onScaleTool: () => void;
  onToggleStyleMenu: (kind: StylePanel, rect: DOMRect) => void;
  onSmooth: () => void;
  onMerge: () => void;
  canMerge: boolean;
  pathSelected: boolean;
};

const ToolDock = ({
  tool,
  styleMenuKind,
  setStyleTriggerRef,
  onSelectTool,
  onPenTool,
  onScaleTool,
  onToggleStyleMenu,
  onSmooth,
  onMerge,
  canMerge,
  pathSelected,
}: Props) => {
  return (
    <aside className="tool-dock">
      <button className={tool === 'select' ? 'tool active' : 'tool'} onClick={onSelectTool} title="Select Tool (V)">
        <MousePointer2 />
      </button>
      <button className={tool === 'pen' ? 'tool active' : 'tool'} onClick={onPenTool} title="Pen Tool (P)">
        <PenTool />
      </button>
      <button className={tool === 'scale' ? 'tool active' : 'tool'} onClick={onScaleTool} title="Transform Tool (T)">
        <Expand />
      </button>
      <div className="tool-divider" />
      <button
        ref={(el) => setStyleTriggerRef(0, el)}
        className={styleMenuKind === 'fill' ? 'tool active' : 'tool'}
        title="Fill"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggleStyleMenu('fill', e.currentTarget.getBoundingClientRect());
        }}
      >
        <PaintBucket />
      </button>
      <button
        ref={(el) => setStyleTriggerRef(1, el)}
        className={styleMenuKind === 'stroke' ? 'tool active' : 'tool'}
        title="Stroke"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggleStyleMenu('stroke', e.currentTarget.getBoundingClientRect());
        }}
      >
        <PenLine />
      </button>
      <button
        ref={(el) => setStyleTriggerRef(2, el)}
        className={styleMenuKind === 'opacity' ? 'tool active' : 'tool'}
        title="Opacity"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggleStyleMenu('opacity', e.currentTarget.getBoundingClientRect());
        }}
      >
        <SquareDashed />
      </button>
      <div className="tool-divider" />
      <button className="tool" onClick={onSmooth} title={pathSelected ? 'Smooth Path' : 'Smooth SVG'}>
        <WandSparkles />
      </button>
      <button className="tool" onClick={onMerge} disabled={!canMerge} title="Merge Points">
        <Merge />
      </button>
    </aside>
  );
};

export default ToolDock;
