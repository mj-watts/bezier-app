import { Shapes, Trash2, X } from 'lucide-react';
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
  onOpenAbout: () => void;
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

const TopBar = ({
  shapes,
  pathSelected,
  selectedPath,
  pathMetaMenuPathIndex,
  onOpenAbout,
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
    <header className="topbar">
      <button className="brand-trigger" type="button" onClick={onOpenAbout} title="About Bz">
        <span className="brand-mark">
          <span className="brand-b">B</span>
          <span className="brand-insert">é</span>
          <span className="brand-z">z</span>
          <span className="brand-tail">ier</span>
        </span>
      </button>

      <div className="path-tabs">
        {shapes.map((shape, i) => (
          <button
            key={shape.id}
            className={`${pathSelected && i === selectedPath ? 'tab active' : 'tab'}${pathMetaMenuPathIndex === i ? ' menu-open' : ''}`}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onPathDoubleClick(i, e.currentTarget.getBoundingClientRect());
            }}
            onClick={() => onPathClick(i)}
          >
            {shape.svgId.trim() || shape.name}
          </button>
        ))}

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
              className="control-btn confirm-text"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onConfirmDelete();
              }}
              title="Confirm Delete"
            >
              Confirm delete
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
    </header>
  );
};

export default TopBar;
