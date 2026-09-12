import {
  BadgeInfo,
  CircleHelp,
  Merge,
  MousePointer2,
  PaintBucket,
  PenLine,
  PenTool,
  Shapes,
  SquareDashed,
  WandSparkles,
} from "lucide-react";
import Tooltip from "@mui/material/Tooltip";
import { type RefObject } from "react";

type Tool = "select" | "pen" | "scale";
type StylePanel = "fill" | "stroke" | "opacity";

type Props = {
  tool: Tool;
  styleMenuKind: StylePanel | null;
  setStyleTriggerRef: (index: number, el: HTMLButtonElement | null) => void;
  onSelectTool: () => void;
  onPenTool: () => void;
  shapeTriggerRef: RefObject<HTMLButtonElement | null>;
  lucideTriggerRef: RefObject<HTMLButtonElement | null>;
  onOpenShapeMenu: (rect: DOMRect) => void;
  onOpenLucideMenu: (rect: DOMRect) => void;
  onToggleStyleMenu: (kind: StylePanel, rect: DOMRect) => void;
  onSmooth: () => void;
  onMerge: () => void;
  canMerge: boolean;
  pathSelected: boolean;
  helpOpen: boolean;
  onToggleHelp: () => void;
};

const ToolDock = ({
  tool,
  styleMenuKind,
  setStyleTriggerRef,
  onSelectTool,
  onPenTool,
  shapeTriggerRef,
  lucideTriggerRef,
  onOpenShapeMenu,
  onOpenLucideMenu,
  onToggleStyleMenu,
  onSmooth,
  onMerge,
  canMerge,
  pathSelected,
  helpOpen,
  onToggleHelp,
}: Props) => {
  return (
    <aside className="tool-dock">
      <Tooltip
        title="Select Tool (V)"
        placement="right"
        enterDelay={0}
        enterNextDelay={0}
        leaveDelay={0}
      >
        <button
          className={tool === "select" ? "tool active" : "tool"}
          onClick={onSelectTool}
        >
          <MousePointer2 />
        </button>
      </Tooltip>
      <Tooltip
        title="Pen Tool (P)"
        placement="right"
        enterDelay={0}
        enterNextDelay={0}
        leaveDelay={0}
      >
        <button
          className={tool === "pen" ? "tool active" : "tool"}
          onClick={onPenTool}
        >
          <PenTool />
        </button>
      </Tooltip>
      <Tooltip
        title="Add Preset Shape"
        placement="right"
        enterDelay={0}
        enterNextDelay={0}
        leaveDelay={0}
      >
        <button
          ref={shapeTriggerRef}
          className="tool"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenShapeMenu(e.currentTarget.getBoundingClientRect());
          }}
        >
          <Shapes />
        </button>
      </Tooltip>
      <Tooltip
        title="Add Lucide Icon"
        placement="right"
        enterDelay={0}
        enterNextDelay={0}
        leaveDelay={0}
      >
        <button
          ref={lucideTriggerRef}
          className="tool"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenLucideMenu(e.currentTarget.getBoundingClientRect());
          }}
        >
          <BadgeInfo />
        </button>
      </Tooltip>
      <div className="tool-divider" />
      <Tooltip
        title="Fill"
        placement="right"
        enterDelay={0}
        enterNextDelay={0}
        leaveDelay={0}
      >
        <button
          ref={(el) => setStyleTriggerRef(0, el)}
          className={styleMenuKind === "fill" ? "tool active" : "tool"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStyleMenu("fill", e.currentTarget.getBoundingClientRect());
          }}
        >
          <PaintBucket />
        </button>
      </Tooltip>
      <Tooltip
        title="Stroke"
        placement="right"
        enterDelay={0}
        enterNextDelay={0}
        leaveDelay={0}
      >
        <button
          ref={(el) => setStyleTriggerRef(1, el)}
          className={styleMenuKind === "stroke" ? "tool active" : "tool"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStyleMenu(
              "stroke",
              e.currentTarget.getBoundingClientRect(),
            );
          }}
        >
          <PenLine />
        </button>
      </Tooltip>
      <Tooltip
        title="Opacity"
        placement="right"
        enterDelay={0}
        enterNextDelay={0}
        leaveDelay={0}
      >
        <button
          ref={(el) => setStyleTriggerRef(2, el)}
          className={styleMenuKind === "opacity" ? "tool active" : "tool"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStyleMenu(
              "opacity",
              e.currentTarget.getBoundingClientRect(),
            );
          }}
        >
          <SquareDashed />
        </button>
      </Tooltip>
      <div className="tool-divider" />
      <Tooltip
        title={pathSelected ? "Smooth Path" : "Smooth SVG"}
        placement="right"
        enterDelay={0}
        enterNextDelay={0}
        leaveDelay={0}
      >
        <button className="tool" onClick={onSmooth}>
          <WandSparkles />
        </button>
      </Tooltip>
      <Tooltip
        title="Merge Points"
        placement="right"
        enterDelay={0}
        enterNextDelay={0}
        leaveDelay={0}
      >
        <span>
          <button className="tool" onClick={onMerge} disabled={!canMerge}>
            <Merge />
          </button>
        </span>
      </Tooltip>
      <div className="tool-divider" />
      <Tooltip
        title="Keyboard Shortcuts"
        placement="right"
        enterDelay={0}
        enterNextDelay={0}
        leaveDelay={0}
      >
        <button className={helpOpen ? "tool active" : "tool"} onClick={onToggleHelp}>
          <CircleHelp />
        </button>
      </Tooltip>
    </aside>
  );
};

export default ToolDock;
