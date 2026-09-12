import { describe, expect, it } from 'vitest';
import { createPresetPath, serializeSvg } from './editor-core';

describe('basic shape presets', () => {
  it.each(['square', 'diamond', 'triangle'] as const)(
    '%s has straight edges and sharp corners', (preset) => {
      const shape = createPresetPath('Shape', preset, 200, 200);
      expect(shape.points).toHaveLength(preset === 'triangle' ? 3 : 4);
      expect(shape.points.every((point) => point.in === null && point.out === null)).toBe(true);
      expect(shape.strokeLinejoin).toBe('miter');
      expect(shape.strokeLinecap).toBe('butt');
      expect(serializeSvg([shape], { minX: 0, minY: 0, vbW: 400, vbH: 400 })).not.toContain('round');
    },
  );

  it('keeps circles curved', () => {
    const circle = createPresetPath('Circle', 'circle', 200, 200);
    expect(circle.points).toHaveLength(4);
    expect(circle.points.every((point) => point.in !== null && point.out !== null)).toBe(true);
  });
});

it.each([['cross', 12], ['star', 10], ['moon', 4]] as const)('%s is a distinct closed preset', (preset, points) => {
  const shape = createPresetPath(preset, preset, 200, 200);
  expect(shape.closed).toBe(true);
  expect(shape.points).toHaveLength(points);
  expect(shape.points.some((point) => point.in || point.out)).toBe(preset === 'moon');
});


it('editing the output viewBox preserves artwork coordinates', () => {
  const coordinateBox = { minX: 0, minY: 0, vbW: 400, vbH: 400 };
  const outputBox = { minX: -30, minY: 20, vbW: 200, vbH: 150 };
  const shapes = (['square', 'circle', 'cross', 'moon', 'star'] as const).map((preset) => createPresetPath(preset, preset, 200, 200));
  const before = serializeSvg(shapes, coordinateBox);
  const after = serializeSvg(shapes, outputBox, coordinateBox);
  expect(after).toContain('viewBox="-30 20 200 150"');
  expect(after.replace(/<svg[^>]*>/, '')).toBe(before.replace(/<svg[^>]*>/, ''));
});
