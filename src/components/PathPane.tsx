import { Check, Trash2, X } from "lucide-react";
import { useState, type DragEvent } from "react";

export type PathPaneRow =
  | {
      key: string;
      kind: "group";
      depth: number;
      label: string;
      pathIndex: number;
      groupDepth: number;
      selected: boolean;
    }
  | {
      key: string;
      kind: "divider";
    }
  | {
      key: string;
      kind: "path";
      depth: number;
      pathIndex: number;
      label: string;
      selected: boolean;
      menuOpen: boolean;
    };

type Props = {
  rows: PathPaneRow[];
  onPathDoubleClick: (pathIndex: number, rect: DOMRect) => void;
  onPathClick: (pathIndex: number) => void;
  onGroupRenameClick: (pathIndex: number, depth: number, rect: DOMRect) => void;
  onGroupDoubleClick: (pathIndex: number, depth: number) => void;
  onReorderPath: (
    fromPathIndex: number,
    toPathIndex: number,
    placement: "before" | "after",
  ) => void;
  onDropPathOnGroup: (fromPathIndex: number, targetPathIndex: number, groupDepth: number) => void;
  onDropPathOnUngrouped: (fromPathIndex: number) => void;
  confirmDeletePath: boolean;
  canDeletePath: boolean;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
};

const PathPane = ({
  rows,
  onPathDoubleClick,
  onPathClick,
  onGroupRenameClick,
  onGroupDoubleClick,
  onReorderPath,
  onDropPathOnGroup,
  onDropPathOnUngrouped,
  confirmDeletePath,
  canDeletePath,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: Props) => {
  const [draggedPathIndex, setDraggedPathIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    pathIndex: number;
    placement: "before" | "after";
  } | null>(null);
  const [dropGroupKey, setDropGroupKey] = useState<string | null>(null);
  const [dropOnDivider, setDropOnDivider] = useState(false);
  const treeBase = 0;
  const treeStep = 20;
  const draggedIndexFromEvent = (e: DragEvent<HTMLElement>) => {
    const sourceFromState = draggedPathIndex;
    const sourceFromData = Number(e.dataTransfer.getData("text/plain"));
    return sourceFromState ?? (Number.isFinite(sourceFromData) ? sourceFromData : null);
  };
  const clearDropState = () => {
    setDropTarget(null);
    setDropGroupKey(null);
    setDropOnDivider(false);
  };
  const mapVisualPlacementToDataPlacement = (
    placement: "before" | "after",
  ): "before" | "after" => (placement === "before" ? "after" : "before");
  const handlePathDropZoneDragOver = (
    e: DragEvent<HTMLElement>,
    pathIndex: number,
    placement: "before" | "after",
  ) => {
    const source = draggedIndexFromEvent(e);
    if (source === null || source === pathIndex) return;
    e.preventDefault();
    setDropTarget((prev) => {
      if (prev?.pathIndex === pathIndex && prev.placement === placement) return prev;
      return { pathIndex, placement };
    });
    setDropGroupKey(null);
    setDropOnDivider(false);
  };
  const handlePathDropZoneDrop = (
    e: DragEvent<HTMLElement>,
    pathIndex: number,
    placement: "before" | "after",
  ) => {
    e.preventDefault();
    const source = draggedIndexFromEvent(e);
    if (source !== null && source !== pathIndex) {
      onReorderPath(source, pathIndex, mapVisualPlacementToDataPlacement(placement));
    }
    setDraggedPathIndex(null);
    clearDropState();
  };
  const resolvePathInsertionTarget = (
    rowIndex: number,
    pathIndex: number,
    clientY: number,
    rect: DOMRect,
  ): { pathIndex: number; placement: "before" | "after" } => {
    const insertBeforeCurrent = clientY < rect.top + rect.height / 2;
    if (insertBeforeCurrent) {
      return { pathIndex, placement: "before" };
    }

    for (let nextIndex = rowIndex + 1; nextIndex < rows.length; nextIndex += 1) {
      const nextRow = rows[nextIndex];
      if (nextRow?.kind === "path") {
        return { pathIndex: nextRow.pathIndex, placement: "before" };
      }
    }

    return { pathIndex, placement: "after" };
  };

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
        {(() => {
          const firstPathRow = rows.find((row): row is Extract<PathPaneRow, { kind: "path" }> => row.kind === "path");
          if (!firstPathRow) return null;
          return (
            <div
              className={`paths-list-drop-zone top${
                dropTarget?.pathIndex === firstPathRow.pathIndex && dropTarget.placement === "before"
                  ? " active"
                  : ""
              }`}
              aria-hidden="true"
              onDragOver={(e) => handlePathDropZoneDragOver(e, firstPathRow.pathIndex, "before")}
              onDragLeave={() => {
                setDropTarget((curr) =>
                  curr?.pathIndex === firstPathRow.pathIndex && curr.placement === "before" ? null : curr,
                );
              }}
              onDrop={(e) => handlePathDropZoneDrop(e, firstPathRow.pathIndex, "before")}
            >
              <div className="paths-drop-line top" aria-hidden="true" />
            </div>
          );
        })()}
        {rows.map((row, rowIndex) => {
          const nextRow = rows[rowIndex + 1];
          const showTrailingAfterZone =
            row.kind === "path" && (!nextRow || nextRow.kind !== "path");
          const firstPathIndex = rows.findIndex((item) => item.kind === "path");
          const showLeadingBeforeZone = row.kind === "path" && rowIndex !== firstPathIndex;

          return row.kind === "divider" ? (
            <div
              key={row.key}
              className={`paths-divider${dropOnDivider ? " drop-target" : ""}`}
              aria-hidden="true"
              onDragOver={(e) => {
                const source = draggedIndexFromEvent(e);
                if (source === null) return;
                e.preventDefault();
                setDropOnDivider(true);
                setDropGroupKey(null);
                setDropTarget(null);
              }}
              onDragLeave={() => setDropOnDivider(false)}
              onDrop={(e) => {
                e.preventDefault();
                const source = draggedIndexFromEvent(e);
                if (source !== null) onDropPathOnUngrouped(source);
                setDraggedPathIndex(null);
                clearDropState();
              }}
            />
          ) : row.kind === "group" ? (
            <div key={row.key} className="paths-tree-item">
              <button
                className={`paths-tree-row paths-group-row${row.selected ? " active" : ""}${dropGroupKey === row.key ? " drop-target" : ""}`}
                style={{
                  marginLeft: `${treeBase + row.depth * treeStep}px`,
                  width: `calc(100% - ${treeBase + row.depth * treeStep}px)`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onGroupDoubleClick(row.pathIndex, row.groupDepth);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onGroupRenameClick(
                    row.pathIndex,
                    row.groupDepth,
                    e.currentTarget.getBoundingClientRect(),
                  );
                }}
                onDragOver={(e) => {
                  const source = draggedIndexFromEvent(e);
                  if (source === null) return;
                  e.preventDefault();
                  setDropGroupKey(row.key);
                  setDropOnDivider(false);
                  setDropTarget(null);
                }}
                onDragLeave={() => {
                  setDropGroupKey((curr) => (curr === row.key ? null : curr));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const source = draggedIndexFromEvent(e);
                  if (source !== null) {
                    onDropPathOnGroup(source, row.pathIndex, row.groupDepth);
                  }
                  setDraggedPathIndex(null);
                  clearDropState();
                }}
                title="Click to select group. Double-click to rename group."
              >
                {row.label}
              </button>
            </div>
          ) : (
            <div key={row.key} className="paths-tree-item paths-path-row-wrap">
              {showLeadingBeforeZone ? (
                <div
                  className={`paths-drop-zone before${
                    dropTarget?.pathIndex === row.pathIndex && dropTarget.placement === "before"
                      ? " active"
                      : ""
                  }`}
                  aria-hidden="true"
                  onDragOver={(e) => handlePathDropZoneDragOver(e, row.pathIndex, "before")}
                  onDragLeave={() => {
                    setDropTarget((curr) =>
                      curr?.pathIndex === row.pathIndex && curr.placement === "before" ? null : curr,
                    );
                  }}
                  onDrop={(e) => handlePathDropZoneDrop(e, row.pathIndex, "before")}
                >
                  <div className="paths-drop-line before" aria-hidden="true" />
                </div>
              ) : null}
              <button
                className={`tab paths-list-tab paths-tree-row paths-path-row${row.selected ? " active" : ""}${row.menuOpen ? " menu-open" : ""}${
                  draggedPathIndex === row.pathIndex ? " dragging" : ""
                }`}
                style={{
                  marginLeft: `${treeBase + row.depth * treeStep}px`,
                  width: `calc(100% - ${treeBase + row.depth * treeStep}px)`,
                }}
                draggable
                onDragStart={(e) => {
                  setDraggedPathIndex(row.pathIndex);
                  setDropTarget(null);
                  setDropGroupKey(null);
                  setDropOnDivider(false);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(row.pathIndex));
                  const transparentPixel = new Image();
                  transparentPixel.src =
                    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
                  e.dataTransfer.setDragImage(transparentPixel, 0, 0);
                }}
                onDragEnd={() => {
                  setDraggedPathIndex(null);
                  clearDropState();
                }}
                onDragOver={(e) => {
                  const source = draggedIndexFromEvent(e);
                  if (source === null || source === row.pathIndex) return;
                  e.preventDefault();
                  const target = resolvePathInsertionTarget(
                    rowIndex,
                    row.pathIndex,
                    e.clientY,
                    e.currentTarget.getBoundingClientRect(),
                  );
                  setDropTarget((prev) => {
                    if (prev?.pathIndex === target.pathIndex && prev.placement === target.placement) {
                      return prev;
                    }
                    return target;
                  });
                  setDropGroupKey(null);
                  setDropOnDivider(false);
                }}
                onDrop={(e) => {
                  const source = draggedIndexFromEvent(e);
                  if (source === null || source === row.pathIndex) return;
                  e.preventDefault();
                  const target = resolvePathInsertionTarget(
                    rowIndex,
                    row.pathIndex,
                    e.clientY,
                    e.currentTarget.getBoundingClientRect(),
                  );
                  if (source !== target.pathIndex || target.placement !== "before") {
                    onReorderPath(
                      source,
                      target.pathIndex,
                      mapVisualPlacementToDataPlacement(target.placement),
                    );
                  }
                  setDraggedPathIndex(null);
                  clearDropState();
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onPathDoubleClick(
                    row.pathIndex,
                    e.currentTarget.getBoundingClientRect(),
                  );
                }}
                onClick={() => onPathClick(row.pathIndex)}
              >
                {row.label}
              </button>
              {showTrailingAfterZone ? (
                <div
                  className={`paths-drop-zone after${
                    dropTarget?.pathIndex === row.pathIndex && dropTarget.placement === "after"
                      ? " active"
                      : ""
                  }`}
                  aria-hidden="true"
                  onDragOver={(e) => handlePathDropZoneDragOver(e, row.pathIndex, "after")}
                  onDragLeave={() => {
                    setDropTarget((curr) =>
                      curr?.pathIndex === row.pathIndex && curr.placement === "after" ? null : curr,
                    );
                  }}
                  onDrop={(e) => handlePathDropZoneDrop(e, row.pathIndex, "after")}
                >
                  <div className="paths-drop-line after" aria-hidden="true" />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
};

export default PathPane;
