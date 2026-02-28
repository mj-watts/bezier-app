import { Check, Trash2, X } from 'lucide-react';

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
  confirmDeletePath,
  canDeletePath,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: Props) => {
  return (
    <aside className="paths-pane">
      <div className="paths-pane-header">
        <div className="paths-pane-actions">
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
