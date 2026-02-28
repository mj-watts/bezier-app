import { Copy, GripVertical } from 'lucide-react';
import { type ClipboardEvent, type RefObject } from 'react';

type Props = {
  copied: boolean;
  onCopy: () => void;
  onFormatCode: () => void;
  codeOverlayRef: RefObject<HTMLPreElement | null>;
  codeTextareaRef: RefObject<HTMLTextAreaElement | null>;
  highlightedCodeHtml: string;
  codeText: string;
  codeError: string;
  onCodeChange: (next: string) => void;
  onCodeClick: (el: HTMLTextAreaElement) => void;
  onCodeKeyUp: (el: HTMLTextAreaElement) => void;
  onCodeSelect: (el: HTMLTextAreaElement) => void;
  onCodePaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onCodeScroll: (el: HTMLTextAreaElement) => void;
  paneDrag: { startX: number; startWidth: number } | null;
  onPaneDragStart: (x: number, el: HTMLDivElement, pointerId: number) => void;
  onPaneDragMove: (x: number) => void;
  onPaneDragEnd: () => void;
};

const CodePane = ({
  copied,
  onCopy,
  onFormatCode,
  codeOverlayRef,
  codeTextareaRef,
  highlightedCodeHtml,
  codeText,
  codeError,
  onCodeChange,
  onCodeClick,
  onCodeKeyUp,
  onCodeSelect,
  onCodePaste,
  onCodeScroll,
  paneDrag,
  onPaneDragStart,
  onPaneDragMove,
  onPaneDragEnd,
}: Props) => {
  return (
    <>
      <div
        className="pane-splitter"
        onPointerDown={(e) => onPaneDragStart(e.clientX, e.currentTarget, e.pointerId)}
        onPointerMove={(e) => {
          if (!paneDrag) return;
          onPaneDragMove(e.clientX);
        }}
        onPointerUp={onPaneDragEnd}
        onPointerCancel={onPaneDragEnd}
      >
        <GripVertical className="splitter-grip" />
      </div>

      <aside className="right-pane">
        <div className="code-header">
          <h2>SVG code</h2>
          <div className="code-header-actions">
            <button className="control-btn text-sm" onClick={onFormatCode} title="Format SVG code now">
              Format
            </button>
            <button className="control-btn icon-only" onClick={onCopy} title={copied ? 'Copied' : 'Copy SVG'}>
              <Copy />
            </button>
          </div>
        </div>

        <div className="code-wrap">
          <pre
            ref={codeOverlayRef}
            className="code-overlay"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: `${highlightedCodeHtml}\n` }}
          />
          <textarea
            id="live-svg-code"
            ref={codeTextareaRef}
            value={codeText}
            onChange={(e) => onCodeChange(e.target.value)}
            onClick={(e) => onCodeClick(e.currentTarget)}
            onKeyUp={(e) => onCodeKeyUp(e.currentTarget)}
            onSelect={(e) => onCodeSelect(e.currentTarget)}
            onPaste={onCodePaste}
            onScroll={(e) => onCodeScroll(e.currentTarget)}
            spellCheck={false}
          />
        </div>

        <p className="error">{codeError || '\u00A0'}</p>
      </aside>
    </>
  );
};

export default CodePane;
