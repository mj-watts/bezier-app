import { describe, expect, it } from 'vitest';
import { closestSegment, createPresetPath, sampleBezier, splitPathSegment } from './editor-core';

describe('pen geometry', () => {
  it('projects onto a straight segment at the cursor position', () => {
    const path = createPresetPath('Square', 'square', 200, 200);
    const hit = closestSegment(path, { x: 164, y: 112 });
    expect(hit?.position.x).toBeCloseTo(164, 3);
    expect(hit?.position.y).toBeCloseTo(110, 3);
    expect(hit?.t).toBeCloseTo(0.3, 3);
    expect(hit?.distance).toBeCloseTo(2, 3);
  });

  it('inserting an anchor preserves the original curve', () => {
    const path = createPresetPath('Circle', 'circle', 200, 200);
    const a = path.points[0];
    const b = path.points[1];
    const split = splitPathSegment(path, 0, 0.3);
    expect(split.points).toHaveLength(5);
    for (const t of [0, 0.2, 0.6, 1]) {
      const before = sampleBezier(a.p, a.out!, b.in!, b.p, t * 0.3);
      const left = split.points[0];
      const inserted = split.points[1];
      const after = sampleBezier(left.p, left.out!, inserted.in!, inserted.p, t);
      expect(after.x).toBeCloseTo(before.x, 5);
      expect(after.y).toBeCloseTo(before.y, 5);
    }
  });
});
