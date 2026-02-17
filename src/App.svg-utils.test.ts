import { describe, expect, it } from 'vitest';
import { highlightSelectedPathHtml, parseSvg, pathIndexAtCaret, serializeSvg } from './App';

const sampleSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120.58 120.76">
  <path d="M10,10 C20,10 30,20 40,40" fill="#123456" stroke="#abcdef" stroke-width="2" />
  <path d="M5,5 L15,15 L20,10 Z" fill="none" />
</svg>`;

describe('SVG utils', () => {
  it('parseSvg parses paths and preserves viewBox', () => {
    const parsed = parseSvg(sampleSvg);
    expect(parsed).not.toBeNull();
    expect(parsed?.viewBox).toEqual({ minX: 0, minY: 0, vbW: 120.58, vbH: 120.76 });
    expect(parsed?.shapes).toHaveLength(2);
    expect(parsed?.shapes[0]?.fillExplicit).toBe(true);
    expect(parsed?.shapes[0]?.strokeExplicit).toBe(true);
    expect(parsed?.shapes[0]?.strokeWidthExplicit).toBe(true);
  });

  it('parseSvg returns null for invalid path data', () => {
    const invalid = `<svg viewBox="0 0 100 100"><path d="M 10 10 C 20 20"/></svg>`;
    expect(parseSvg(invalid)).toBeNull();
  });

  it('serializeSvg omits stroke attrs when stroke width is zero', () => {
    const parsed = parseSvg(sampleSvg);
    expect(parsed).not.toBeNull();
    if (!parsed) return;

    parsed.shapes[0] = {
      ...parsed.shapes[0],
      stroke: '#ff0000',
      strokeExplicit: true,
      strokeWidth: 0,
      strokeWidthExplicit: true,
      fill: '#000000',
      fillExplicit: true,
      geometryDirty: true,
    };

    const out = serializeSvg(parsed.shapes, parsed.viewBox);
    const firstPathTag = out.match(/<path\b[^>]*>/i)?.[0] ?? '';
    expect(firstPathTag).not.toContain('stroke="');
    expect(firstPathTag).not.toContain('stroke-width="');
    expect(firstPathTag).toContain('fill="#000000"');
  });

  it('pathIndexAtCaret finds the path tag at cursor', () => {
    const svg = `<svg viewBox="0 0 10 10"><path d="M0 0 L1 1"/><path d="M2 2 L3 3"/></svg>`;
    const firstIndex = svg.indexOf('<path');
    const secondIndex = svg.indexOf('<path', firstIndex + 1);
    expect(pathIndexAtCaret(svg, firstIndex + 5)).toBe(0);
    expect(pathIndexAtCaret(svg, secondIndex + 5)).toBe(1);
  });

  it('highlightSelectedPathHtml wraps selected path and selected point tokens', () => {
    const svg = `<svg viewBox="0 0 10 10"><path d="M 0 0 C 1 1 2 2 3 3"/></svg>`;
    const html = highlightSelectedPathHtml(svg, 0, [1]);
    expect(html).toContain('selected-code');
    expect(html).toContain('selected-point-code');
  });
});
