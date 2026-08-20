/**
 * Placement rules.
 *
 * These are unit tests of a pure function on purpose: jsdom reports every
 * element as 0x0, so a render-and-assert test of "did the callout flip?" would
 * be asserting against a layout engine that does not exist. The geometry is the
 * part worth testing, and here it can be tested exactly.
 */
import { describe, expect, it } from 'vitest';
import { placeCallout, VIEWPORT_MARGIN } from '../placement';
import type { SpotRect } from '../placement';

const CARD = { width: 320, height: 200 };
const VIEWPORT = { width: 1280, height: 800 };

describe('placeCallout', () => {
  it('honours the preferred side when there is room for it', () => {
    const target: SpotRect = { top: 300, left: 500, width: 120, height: 40 };
    const result = placeCallout(target, CARD, VIEWPORT, 'bottom');

    expect(result.placement).toBe('bottom');
    // 300 (top) + 40 (height) + 8 (padding) + 14 (gap)
    expect(result.top).toBe(362);
  });

  it('flips to the opposite side when the preferred side would overflow', () => {
    // A target hard against the bottom edge: a card below it cannot fit, so the
    // natural mirror (above) must be chosen.
    const target: SpotRect = { top: 760, left: 500, width: 120, height: 30 };
    const result = placeCallout(target, CARD, VIEWPORT, 'bottom');

    expect(result.placement).toBe('top');
    expect(result.top).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
    expect(result.top + CARD.height).toBeLessThanOrEqual(VIEWPORT.height - VIEWPORT_MARGIN);
  });

  it('tries the other axis when neither vertical side fits', () => {
    // Tall target filling the viewport vertically: nothing fits above or below,
    // so the search has to move on to left/right rather than giving up.
    const target: SpotRect = { top: 10, left: 40, width: 100, height: 780 };
    const result = placeCallout(target, CARD, VIEWPORT, 'bottom');

    expect(result.placement).toBe('right');
    expect(result.left).toBe(40 + 100 + 8 + 14);
  });

  it('centres the card when no target has resolved yet', () => {
    const result = placeCallout(null, CARD, VIEWPORT, 'right');

    expect(result.placement).toBe('center');
    expect(result.left).toBe((VIEWPORT.width - CARD.width) / 2);
  });

  it('centres the card when the viewport is too small to sit it beside anything', () => {
    const target: SpotRect = { top: 20, left: 20, width: 50, height: 50 };
    const result = placeCallout(target, CARD, { width: 300, height: 180 }, 'bottom');

    expect(result.placement).toBe('center');
  });

  it('keeps the card fully on screen when no side fits cleanly', () => {
    // A card almost as tall as the viewport, next to a centred target: every
    // candidate clips. The preference is kept but pulled back into view;
    // overlapping the target beats hanging off the edge of the screen.
    const tallCard = { width: 320, height: 740 };
    const narrowViewport = { width: 700, height: 800 };
    const target: SpotRect = { top: 380, left: 300, width: 80, height: 40 };
    const result = placeCallout(target, tallCard, narrowViewport, 'bottom');

    expect(result.placement).toBe('bottom');
    expect(result.top).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
    expect(result.left).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
    expect(result.top + tallCard.height).toBeLessThanOrEqual(
      narrowViewport.height - VIEWPORT_MARGIN,
    );
  });

  it('respects a per-step spotlight padding when computing the offset', () => {
    const target: SpotRect = { top: 300, left: 500, width: 120, height: 40 };
    const tight = placeCallout(target, CARD, VIEWPORT, 'bottom', 0);
    const loose = placeCallout(target, CARD, VIEWPORT, 'bottom', 24);

    expect(loose.top - tight.top).toBe(24);
  });
});
