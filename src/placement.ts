/**
 * Callout placement geometry.
 *
 * Kept as a pure function of (target box, card size, viewport, preference)
 * deliberately: given those four inputs there is exactly one right answer, and
 * pulling it out of the component means the rules can be reasoned about and
 * tested without a DOM — jsdom reports every element as 0x0, so a
 * render-and-assert test of placement would prove nothing at all.
 */
import type { ResolvedPlacement, TourPlacement } from './types';

/** Gap between the spotlight ring and the callout card, in px. */
export const CALLOUT_GAP = 14;
/** Closest the callout is allowed to sit to a viewport edge, in px. */
export const VIEWPORT_MARGIN = 12;
/** Default breathing room between the target's box and the ring, in px. */
export const DEFAULT_SPOTLIGHT_PADDING = 8;

/** Viewport-relative box of a spotlight target. */
export interface SpotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Width/height pair, used for both the card and the viewport. */
export interface Size {
  width: number;
  height: number;
}

/** Where the callout ended up, and which side it settled on. */
export interface CalloutPosition {
  top: number;
  left: number;
  placement: ResolvedPlacement;
}

/**
 * Clamps `value` into `[min, max]`.
 *
 * `max` can legitimately fall below `min` on a viewport narrower than the card;
 * `min` wins in that case so the card stays reachable at the top-left rather
 * than being pushed off the opposite edge.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

/** The side a flip goes to first — the natural mirror of the preference. */
const OPPOSITE: Record<TourPlacement, TourPlacement> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

/**
 * Places the callout beside the target, flipping to another side when the
 * preferred one would overflow the viewport.
 *
 * Search order is preference → its opposite → the remaining sides. The first
 * side that fits entirely inside the viewport (minus a margin) wins. If nothing
 * fits — a tall card next to a target in the middle of a short window — the
 * preference is kept and simply pulled back into view: overlapping the target
 * is annoying, hanging off the edge of the screen is broken.
 */
export function placeCallout(
  target: SpotRect | null,
  callout: Size,
  viewport: Size,
  preferred: TourPlacement,
  spotlightPadding: number = DEFAULT_SPOTLIGHT_PADDING,
): CalloutPosition {
  // A viewport that cannot contain the card plus its margins has no "beside"
  // to speak of. Centering is always readable, so it is the honest fallback —
  // as it is when no target has resolved yet.
  const tooSmall =
    viewport.width < callout.width + 2 * VIEWPORT_MARGIN ||
    viewport.height < callout.height + 2 * VIEWPORT_MARGIN;

  if (target === null || tooSmall) {
    return {
      top: Math.max(VIEWPORT_MARGIN, (viewport.height - callout.height) / 2),
      left: Math.max(VIEWPORT_MARGIN, (viewport.width - callout.width) / 2),
      placement: 'center',
    };
  }

  const offset = spotlightPadding + CALLOUT_GAP;
  const maxLeft = viewport.width - callout.width - VIEWPORT_MARGIN;
  const maxTop = viewport.height - callout.height - VIEWPORT_MARGIN;

  const candidate = (placement: TourPlacement): CalloutPosition => {
    switch (placement) {
      case 'bottom':
        return {
          top: target.top + target.height + offset,
          left: clamp(
            target.left + target.width / 2 - callout.width / 2,
            VIEWPORT_MARGIN,
            maxLeft,
          ),
          placement,
        };
      case 'top':
        return {
          top: target.top - offset - callout.height,
          left: clamp(
            target.left + target.width / 2 - callout.width / 2,
            VIEWPORT_MARGIN,
            maxLeft,
          ),
          placement,
        };
      case 'right':
        return {
          top: clamp(
            target.top + target.height / 2 - callout.height / 2,
            VIEWPORT_MARGIN,
            maxTop,
          ),
          left: target.left + target.width + offset,
          placement,
        };
      case 'left':
        return {
          top: clamp(
            target.top + target.height / 2 - callout.height / 2,
            VIEWPORT_MARGIN,
            maxTop,
          ),
          left: target.left - offset - callout.width,
          placement,
        };
    }
  };

  const fits = (position: CalloutPosition): boolean =>
    position.top >= VIEWPORT_MARGIN &&
    position.left >= VIEWPORT_MARGIN &&
    position.top + callout.height <= viewport.height - VIEWPORT_MARGIN &&
    position.left + callout.width <= viewport.width - VIEWPORT_MARGIN;

  const order: TourPlacement[] = [
    preferred,
    OPPOSITE[preferred],
    'bottom',
    'top',
    'right',
    'left',
  ];

  for (const placement of order) {
    const position = candidate(placement);
    if (fits(position)) return position;
  }

  const fallback = candidate(preferred);
  return {
    top: clamp(fallback.top, VIEWPORT_MARGIN, maxTop),
    left: clamp(fallback.left, VIEWPORT_MARGIN, maxLeft),
    placement: fallback.placement,
  };
}
