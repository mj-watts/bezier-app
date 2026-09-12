import { describe, expect, it } from 'vitest';
import { createPresetPath, serializeSvg } from './editor-core';

describe('basic shape presets', () => {
  it.each(['roundedSquare', 'roundedDiamond', 'roundedTriangle'] as const)(
    '%s has straight edges and sharp corners', (preset) => {
      const shape = createPresetPath('Shape', preset, 200, 200);
      expect(shape.points).toHaveLength(preset === 'roundedTriangle' ? 3 : 4);
      expect(shape.points.every((point) => point.in === null && point.out === null)).toBe(true);
      expect(shape.strokeLinejoin).toBe('miter');
      expect(shape.strokeLinecap).toBe('butt');
      expect(serializeSvg([shape])).not.toContain('round');
    },
  );

  it('keeps circles curved', () => {
    const circle = createPresetPath('Circle', 'circle', 200, 200);
    expect(circle.points).toHaveLength(4);
    expect(circle.points.every((point) => point.in !== null && point.out !== null)).toBe(true);
  });
});
