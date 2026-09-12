import { X } from 'lucide-react';

type Shortcut = {
  action: string;
  combos: string[][];
};

type ShortcutSection = {
  title: string;
  items: Shortcut[];
};

type Props = {
  open: boolean;
  onClose: () => void;
};

const sections: ShortcutSection[] = [
  {
    title: 'Tools',
    items: [
      { action: 'Select tool', combos: [['V']] },
      { action: 'Pen tool', combos: [['P']] },
      { action: 'Transform tool', combos: [['T']] },
    ],
  },
  {
    title: 'Edit',
    items: [
      { action: 'Undo', combos: [['Cmd/Ctrl', 'Z']] },
      { action: 'Redo', combos: [['Cmd/Ctrl', 'Shift', 'Z'], ['Cmd/Ctrl', 'Y']] },
      { action: 'Select all paths', combos: [['Cmd/Ctrl', 'A']] },
      { action: 'Copy selected paths', combos: [['Cmd/Ctrl', 'C']] },
      { action: 'Cut selected paths', combos: [['Cmd/Ctrl', 'X']] },
      { action: 'Paste paths', combos: [['Cmd/Ctrl', 'V']] },
      { action: 'Group selection', combos: [['Cmd/Ctrl', 'G']] },
      { action: 'Ungroup selection', combos: [['Cmd/Ctrl', 'Shift', 'G']] },
      { action: 'Delete selected path', combos: [['Delete'], ['Backspace']] },
    ],
  },
  {
    title: 'Pen',
    items: [
      { action: 'Place a point', combos: [['Click canvas']] },
      { action: 'Draw a curved point', combos: [['Drag on canvas']] },
      { action: 'Move point or handle', combos: [['Drag point/handle']] },
      { action: 'Delete point', combos: [['Alt/Option', 'Click point']] },
      { action: 'Insert point on path', combos: [['Click path edge']] },
      { action: 'Close drawn shape', combos: [['Click first point']] },
      { action: 'Finish open path', combos: [['Enter'], ['Escape']] },
    ],
  },
  {
    title: 'File',
    items: [
      { action: 'Open SVG', combos: [['Cmd/Ctrl', 'O']] },
      { action: 'Save SVG', combos: [['Cmd/Ctrl', 'S']] },
    ],
  },
  {
    title: 'Canvas',
    items: [
      { action: 'Pan while dragging', combos: [['Hold', 'Space']] },
      { action: 'Scale uniformly while dragging', combos: [['Hold', 'Shift']] },
      { action: 'Scale from center while dragging', combos: [['Hold', 'Alt']] },
    ],
  },
  {
    title: 'Selection',
    items: [
      { action: 'Add/remove path from selection', combos: [['Shift', 'Click path']] },
      { action: 'Add/remove anchor from selection', combos: [['Shift', 'Click anchor']] },
      { action: 'Select next group for active path', combos: [['Enter']] },
    ],
  },
  {
    title: 'Panels',
    items: [
      { action: 'Close About dialog', combos: [['Escape']] },
      { action: 'Close Path/Group/Lucide menu', combos: [['Escape']] },
    ],
  },
];

const ShortcutsHelpPanel = ({ open, onClose }: Props) => {
  if (!open) return null;

  return (
    <section
      className="shortcuts-help-panel"
      role="dialog"
      aria-label="Keyboard shortcuts"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="shortcuts-help-header">
        <h2>Shortcuts</h2>
        <button className="control-btn icon-only" type="button" onClick={onClose} title="Close shortcuts">
          <X />
        </button>
      </header>
      <div className="shortcuts-help-body">
        {sections.map((section) => (
          <div key={section.title} className="shortcuts-help-section">
            <h3>{section.title}</h3>
            {section.items.map((item) => (
              <div key={item.action} className="shortcuts-help-row">
                <span className="shortcuts-help-action">{item.action}</span>
                <span className="shortcuts-help-combos">
                  {item.combos.map((combo, comboIndex) => (
                    <span key={`${item.action}-${combo.join('-')}`} className="shortcuts-help-combo">
                      {combo.map((token, tokenIndex) => (
                        <span key={`${token}-${tokenIndex}`} className="shortcuts-help-token-wrap">
                          <kbd>{token}</kbd>
                          {tokenIndex < combo.length - 1 ? <span className="shortcuts-help-plus">+</span> : null}
                        </span>
                      ))}
                      {comboIndex < item.combos.length - 1 ? <span className="shortcuts-help-or">or</span> : null}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
};

export default ShortcutsHelpPanel;
