import { Redo2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { type ReactNode } from 'react';

type Tool = 'select' | 'pen' | 'scale';

type Props = {
  closed: boolean;
  onToggleClosed: () => void;
  tool: Tool;
  transformAllPaths: boolean;
  onToggleTransformAllPaths: (next: boolean) => void;
  showViewBox: boolean;
  onToggleShowViewBox: () => void;
  zoom: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onResetView: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  renderCurrentColorControl: ReactNode;
};

const ControlsBar = ({
  closed,
  onToggleClosed,
  tool,
  transformAllPaths,
  onToggleTransformAllPaths,
  showViewBox,
  onToggleShowViewBox,
  zoom,
  onZoomOut,
  onZoomIn,
  onResetView,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  renderCurrentColorControl,
}: Props) => {
  return (
    <div className="controls-row">
      <button
        className={`control-btn text-sm switch-btn${closed ? ' active' : ''}`}
        type="button"
        onClick={onToggleClosed}
        aria-pressed={closed}
        title="Closed"
      >
        <span className="switch-track" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
        <span>Closed</span>
      </button>

      <span className="control-group-divider" aria-hidden="true" />

      <div className="control-group">{renderCurrentColorControl}</div>

      {tool === 'scale' ? (
        <label>
          All Paths
          <input
            type="checkbox"
            checked={transformAllPaths}
            onChange={(e) => onToggleTransformAllPaths(e.target.checked)}
          />
        </label>
      ) : null}

      <div className="controls-actions">
        <button
          className={`control-btn text-sm switch-btn${showViewBox ? ' active' : ''}`}
          type="button"
          onClick={onToggleShowViewBox}
          aria-pressed={showViewBox}
          title="Show viewBox"
        >
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          <span>Show viewBox</span>
        </button>

        <span className="control-group-divider" aria-hidden="true" />

        <div className="control-group">
          <div className="zoom-controls">
            <button className="control-btn icon-only" type="button" onClick={onZoomOut} title="Zoom Out">
              <ZoomOut />
            </button>
            <strong className="zoom-readout">{Math.round(zoom * 100)}%</strong>
            <button className="control-btn icon-only" type="button" onClick={onZoomIn} title="Zoom In">
              <ZoomIn />
            </button>
            <button className="control-btn text-sm" type="button" onClick={onResetView} title="Reset View">
              100%
            </button>
          </div>
        </div>

        <span className="control-group-divider" aria-hidden="true" />

        <button className="control-btn icon-only" onClick={onUndo} disabled={!canUndo} title="Undo (Cmd/Ctrl+Z)">
          <Undo2 />
        </button>
        <button className="control-btn icon-only" onClick={onRedo} disabled={!canRedo} title="Redo (Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y)">
          <Redo2 />
        </button>
      </div>
    </div>
  );
};

export default ControlsBar;
