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

  it('parseSvg supports H/V commands', () => {
    const hvSvg = `<svg viewBox="0 0 10 10"><path d="M 1 1 H 9 V 9 H 1 Z" /></svg>`;
    const parsed = parseSvg(hvSvg);
    expect(parsed).not.toBeNull();
    expect(parsed?.shapes).toHaveLength(1);
    expect(parsed?.shapes[0]?.points).toHaveLength(4);
    expect(parsed?.shapes[0]?.closed).toBe(true);
  });

  it('parseSvg imports circle tags as closed paths', () => {
    const circleSvg = `<svg viewBox="0 0 24 24"><circle cx="11" cy="13" r="9" stroke="currentColor" stroke-width="2"/></svg>`;
    const parsed = parseSvg(circleSvg);
    expect(parsed).not.toBeNull();
    expect(parsed?.shapes).toHaveLength(1);
    const first = parsed?.shapes[0];
    expect(first?.closed).toBe(true);
    expect(first?.points).toHaveLength(4);
    expect(first?.points.every((pt) => pt.in !== null && pt.out !== null)).toBe(true);
    expect(first?.strokeWidth).toBeCloseTo(46.6667, 3);
    expect(first?.sourceD).toBeNull();
  });

  it('parseSvg supports arc commands used by lucide icons', () => {
    const bombSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="13" r="9"/><path d="M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95"/><path d="m22 2-1.5 1.5"/></svg>`;
    const parsed = parseSvg(bombSvg);
    expect(parsed).not.toBeNull();
    expect(parsed?.shapes).toHaveLength(3);
    const fuse = parsed?.shapes[1];
    expect(fuse?.points.length).toBeGreaterThanOrEqual(5);
    expect(fuse?.points.some((pt) => pt.in !== null || pt.out !== null)).toBe(true);
  });

  it('parseSvg supports quadratic and smooth cubic path commands', () => {
    const qstSvg = `<svg viewBox="0 0 24 24"><path d="M2 2 Q 12 0 22 22 T 2 22 M2 12 C 6 2 18 2 22 12 S 18 22 2 12"/></svg>`;
    const parsed = parseSvg(qstSvg);
    expect(parsed).not.toBeNull();
    expect(parsed?.shapes).toHaveLength(1);
    expect(parsed?.shapes[0]?.points.length).toBeGreaterThanOrEqual(5);
    expect(parsed?.shapes[0]?.points.some((pt) => pt.in !== null || pt.out !== null)).toBe(true);
  });

  it('parseSvg imports rect/ellipse/line/polyline/polygon tags', () => {
    const primitivesSvg = `<svg viewBox="0 0 24 24">
      <rect x="2" y="2" width="8" height="6"/>
      <rect x="12" y="2" width="10" height="8" rx="2" ry="2"/>
      <ellipse cx="6" cy="16" rx="4" ry="2"/>
      <line x1="12" y1="13" x2="22" y2="13"/>
      <polyline points="12,16 16,18 22,16"/>
      <polygon points="2,20 6,22 10,20"/>
    </svg>`;
    const parsed = parseSvg(primitivesSvg);
    expect(parsed).not.toBeNull();
    expect(parsed?.shapes).toHaveLength(6);
    expect(parsed?.shapes[0]?.closed).toBe(true);
    expect(parsed?.shapes[1]?.points.some((pt) => pt.in !== null || pt.out !== null)).toBe(true);
    expect(parsed?.shapes[2]?.closed).toBe(true);
    expect(parsed?.shapes[3]?.closed).toBe(false);
    expect(parsed?.shapes[4]?.closed).toBe(false);
    expect(parsed?.shapes[5]?.closed).toBe(true);
  });

  it('parseSvg captures nested group ancestry', () => {
    const groupedSvg = `<svg viewBox="0 0 10 10">
      <g id="outer">
        <path d="M1 1 L2 2" />
        <g id="inner">
          <path d="M3 3 L4 4" />
        </g>
      </g>
    </svg>`;
    const parsed = parseSvg(groupedSvg);
    expect(parsed).not.toBeNull();
    expect(parsed?.shapes).toHaveLength(2);
    expect(parsed?.shapes[0]?.groupChain).toEqual(['outer']);
    expect(parsed?.shapes[1]?.groupChain).toEqual(['outer', 'inner']);
  });

  it('parseSvg limits group ancestry depth to 3 levels', () => {
    const deepGroupedSvg = `<svg viewBox="0 0 10 10">
      <g id="g1"><g id="g2"><g id="g3"><g id="g4"><path d="M1 1 L2 2" /></g></g></g></g>
    </svg>`;
    const parsed = parseSvg(deepGroupedSvg);
    expect(parsed).not.toBeNull();
    expect(parsed?.shapes[0]?.groupChain).toEqual(['g1', 'g2', 'g3']);
  });

  it('parseSvg rejects unsupported path commands instead of mis-parsing', () => {
    const unsupportedSvg = `<svg viewBox="0 0 24 24"><path d="M2 2 R 12 0 22 22"/></svg>`;
    expect(parseSvg(unsupportedSvg)).toBeNull();
  });

  it('parseSvg inherits root fill/stroke defaults', () => {
    const inheritedSvg = `<svg viewBox="0 0 10 10" fill="none" stroke="#216979" stroke-width="0.5"><path d="M 1 1 H 9 V 9 H 1 Z" /></svg>`;
    const parsed = parseSvg(inheritedSvg);
    expect(parsed).not.toBeNull();
    const first = parsed?.shapes[0];
    expect(first?.fill).toBe('none');
    expect(first?.fillExplicit).toBe(true);
    expect(first?.stroke).toBe('#216979');
    expect(first?.strokeExplicit).toBe(true);
    expect(first?.strokeWidth).toBeCloseTo(28, 6);
    expect(first?.strokeWidthExplicit).toBe(true);
  });

  it('parseSvg and serializeSvg preserve round line caps and joins', () => {
    const roundedSvg = `<svg viewBox="0 0 24 24"><path d="M10 10V14" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const parsed = parseSvg(roundedSvg);
    expect(parsed).not.toBeNull();
    const first = parsed?.shapes[0];
    expect(first?.strokeLinecap).toBe('round');
    expect(first?.strokeLinejoin).toBe('round');
    expect(first?.strokeLinecapExplicit).toBe(true);
    expect(first?.strokeLinejoinExplicit).toBe(true);

    if (!parsed) return;
    const out = serializeSvg(parsed.shapes, parsed.viewBox);
    const pathTag = out.match(/<path\b[^>]*>/i)?.[0] ?? '';
    expect(pathTag).toContain('stroke-linecap="round"');
    expect(pathTag).toContain('stroke-linejoin="round"');
    expect(pathTag).toContain('stroke-width="2"');
  });

  it('parseSvg preserves closing curve handles when Z closes on the first anchor', () => {
    const roundedRectSvg = `<svg viewBox="0 0 24 24"><path d="M16 6H4C2.89543 6 2 6.89543 2 8V16C2 17.1046 2.89543 18 4 18H16C17.1046 18 18 17.1046 18 16V8C18 6.89543 17.1046 6 16 6Z" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const parsed = parseSvg(roundedRectSvg);
    expect(parsed).not.toBeNull();
    const first = parsed?.shapes[0]?.points[0];
    expect(first).toBeTruthy();
    expect(first?.in).not.toBeNull();
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

  it('serializeSvg emits nested groups from groupChain', () => {
    const groupedSvg = `<svg viewBox="0 0 10 10">
      <g id="outer">
        <g id="inner">
          <path d="M1 1 L2 2" />
          <path d="M3 3 L4 4" />
        </g>
      </g>
    </svg>`;
    const parsed = parseSvg(groupedSvg);
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    const out = serializeSvg(parsed.shapes, parsed.viewBox);
    expect(out).toContain('<g id="outer">');
    expect(out).toContain('<g id="inner">');
    expect(out.match(/<path\b/g)?.length ?? 0).toBe(2);
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
