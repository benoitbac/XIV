import { describe, expect, it } from 'vitest';
import { slopeSteps } from '../src/world/Level.ts';

/**
 * Regression cover for a bug that made chapter one unfinishable: the slope
 * joining the crash bowl to the tree line was built with its end heights
 * swapped, so instead of a ramp the player met a six-metre drop followed by a
 * wall. It looked correct from every camera angle.
 */
describe('slopeSteps', () => {
  it('rises from the -Z end to the +Z end, in order', () => {
    const steps = slopeSteps(24, 12, 8, 14, 6);

    expect(steps).toHaveLength(6);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.z).toBeGreaterThan(steps[i - 1]!.z);
      expect(steps[i]!.top).toBeGreaterThan(steps[i - 1]!.top);
    }
  });

  it('meets both shelves it joins, within one tread', () => {
    const steps = slopeSteps(24, 12, 8, 14, 12);
    const treadRise = (14 - 8) / 12;

    // The low end must arrive at the lower shelf, the high end at the upper one.
    expect(steps[0]!.top).toBeCloseTo(8 + treadRise, 6);
    expect(steps.at(-1)!.top).toBeCloseTo(14, 6);
  });

  it('descends when the +Z end is the lower one', () => {
    const steps = slopeSteps(0, 10, 8, 4, 5);
    expect(steps[0]!.top).toBeGreaterThan(steps.at(-1)!.top);
    expect(steps.at(-1)!.top).toBeCloseTo(4, 6);
  });

  it('spans exactly the requested depth, with treads that overlap slightly', () => {
    const depth = 12;
    const steps = slopeSteps(24, depth, 8, 14, 8);
    const first = steps[0]!;
    const last = steps.at(-1)!;

    expect(first.z - first.depth / 2).toBeLessThanOrEqual(24 - depth / 2 + 0.02);
    expect(last.z + last.depth / 2).toBeGreaterThanOrEqual(24 + depth / 2 - 0.02);
    // The overlap is what stops a hairline gap opening between treads.
    expect(first.depth).toBeGreaterThan(depth / 8);
  });

  it('never produces a tread taller than the character can step up', () => {
    const steps = slopeSteps(0, 12, 4, 14, 24);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.top - steps[i - 1]!.top).toBeLessThan(0.42);
    }
  });
});
