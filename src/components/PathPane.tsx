import { Check, Shapes, Trash2, X } from 'lucide-react';
import { type RefObject } from 'react';

type ShapeTab = {
  id: string;
  name: string;
  svgId: string;
};

type Props = {
  shapes: ShapeTab[];
  pathSelected: boolean;
  selectedPath: number;
  pathMetaMenuPathIndex: number | null;
  onPathDoubleClick: (pathIndex: number, rect: DOMRect) => void;
  onPathClick: (pathIndex: number) => void;
  shapeTriggerRef: RefObject<HTMLButtonElement | null>;
  onOpenShapeMenu: (rect: DOMRect) => void;
  confirmDeletePath: boolean;
  canDeletePath: boolean;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
};

const PathPane = ({
  shapes,
  pathSelected,
  selectedPath,
  pathMetaMenuPathIndex,
  onPathDoubleClick,
  onPathClick,
  shapeTriggerRef,
  onOpenShapeMenu,
  confirmDeletePath,
  canDeletePath,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: Props) => {
  return (
    <aside className="paths-pane">
      <div className="paths-pane-header">
        <h2>Paths</h2>
        <div className="paths-pane-actions">
          <button
            ref={shapeTriggerRef}
            className="icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              onOpenShapeMenu(e.currentTarget.getBoundingClientRect());
            }}
            title="Add Preset Shape"
          >
            <Shapes />
          </button>

          {!confirmDeletePath ? (
            <button
              className="icon-btn delete-path-btn"
              disabled={!canDeletePath}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRequestDelete();
              }}
              title="Delete Path"
            >
              <Trash2 />
            </button>
          ) : (
            <>
              <button
                className="icon-btn confirm-text"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onConfirmDelete();
                }}
                title="Confirm Delete"
              >
                <Check />
              </button>
              <button
                className="icon-btn confirm-no"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelDelete();
                }}
                title="Cancel"
              >
                <X />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="paths-list" role="listbox" aria-label="Paths">
        {shapes.map((shape, i) => (
          <button
            key={shape.id}
            className={`${pathSelected && i === selectedPath ? 'tab active' : 'tab'} paths-list-tab${
              pathMetaMenuPathIndex === i ? ' menu-open' : ''
            }`}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onPathDoubleClick(i, e.currentTarget.getBoundingClientRect());
            }}
            onClick={() => onPathClick(i)}
          >
            {shape.svgId.trim() || shape.name}
          </button>
        ))}
      </div>
    </aside>
  );
};

export default PathPane;
