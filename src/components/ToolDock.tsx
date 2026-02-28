import { Expand, Merge, MousePointer2, PaintBucket, PenLine, PenTool, SquareDashed, WandSparkles } from 'lucide-react';
import Tooltip from '@mui/material/Tooltip';

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
      <Tooltip title="Select Tool (V)" placement="right" enterDelay={0} enterNextDelay={0} leaveDelay={0}>
        <button className={tool === 'select' ? 'tool active' : 'tool'} onClick={onSelectTool}>
          <MousePointer2 />
        </button>
      </Tooltip>
      <Tooltip title="Pen Tool (P)" placement="right" enterDelay={0} enterNextDelay={0} leaveDelay={0}>
        <button className={tool === 'pen' ? 'tool active' : 'tool'} onClick={onPenTool}>
          <PenTool />
        </button>
      </Tooltip>
      <Tooltip title="Transform Tool (T)" placement="right" enterDelay={0} enterNextDelay={0} leaveDelay={0}>
        <button className={tool === 'scale' ? 'tool active' : 'tool'} onClick={onScaleTool}>
          <Expand />
        </button>
      </Tooltip>
      <div className="tool-divider" />
      <Tooltip title="Fill" placement="right" enterDelay={0} enterNextDelay={0} leaveDelay={0}>
        <button
          ref={(el) => setStyleTriggerRef(0, el)}
          className={styleMenuKind === 'fill' ? 'tool active' : 'tool'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStyleMenu('fill', e.currentTarget.getBoundingClientRect());
          }}
        >
          <PaintBucket />
        </button>
      </Tooltip>
      <Tooltip title="Stroke" placement="right" enterDelay={0} enterNextDelay={0} leaveDelay={0}>
        <button
          ref={(el) => setStyleTriggerRef(1, el)}
          className={styleMenuKind === 'stroke' ? 'tool active' : 'tool'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStyleMenu('stroke', e.currentTarget.getBoundingClientRect());
          }}
        >
          <PenLine />
        </button>
      </Tooltip>
      <Tooltip title="Opacity" placement="right" enterDelay={0} enterNextDelay={0} leaveDelay={0}>
        <button
          ref={(el) => setStyleTriggerRef(2, el)}
          className={styleMenuKind === 'opacity' ? 'tool active' : 'tool'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStyleMenu('opacity', e.currentTarget.getBoundingClientRect());
          }}
        >
          <SquareDashed />
        </button>
      </Tooltip>
      <div className="tool-divider" />
      <Tooltip
        title={pathSelected ? 'Smooth Path' : 'Smooth SVG'}
        placement="right"
        enterDelay={0}
        enterNextDelay={0}
        leaveDelay={0}
      >
        <button className="tool" onClick={onSmooth}>
          <WandSparkles />
        </button>
      </Tooltip>
      <Tooltip title="Merge Points" placement="right" enterDelay={0} enterNextDelay={0} leaveDelay={0}>
        <span>
          <button className="tool" onClick={onMerge} disabled={!canMerge}>
            <Merge />
          </button>
        </span>
      </Tooltip>
    </aside>
  );
};

export default ToolDock;
