/**
 * Small DOM helpers shared by the overlay. Separated so the component file
 * stays about behaviour rather than about browser quirks.
 */
import type { SpotRect } from './placement';
import type { TourTarget } from './types';

/**
 * Resolves a step's target to a live element, or null if it is not there yet.
 *
 * The function form is invoked defensively: it is authored by the consumer and
 * may reach into a ref that is momentarily undefined, or index an array that
 * has not loaded. A throw here would take down the host app's render, while the
 * caller already knows exactly what to do with "not found": wait, then skip.
 */
export function resolveTarget(target: TourTarget): Element | null {
  try {
    if (typeof target === 'function') return target();
    return document.querySelector(target);
  } catch {
    // An invalid selector string throws SyntaxError; treat a typo'd step the
    // same as a missing element so one bad step cannot brick the whole tour.
    return null;
  }
}

/** Viewport-relative box of an element. */
export function readRect(element: Element): SpotRect {
  const box = element.getBoundingClientRect();
  return { top: box.top, left: box.left, width: box.width, height: box.height };
}

/**
 * Honours the OS "reduce motion" setting.
 *
 * `matchMedia` is optional-chained because jsdom does not implement it, and a
 * library that crashes inside its consumer's unit tests will simply be removed
 * from the project.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Everything inside `root` that can hold focus, in tab order.
 *
 * Used by the focus trap. `:not([disabled])` matters because a disabled Back
 * button on step one would otherwise be the wrap-around landing spot, silently
 * dropping focus to the body.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * The tab stops inside `root`, in document order, which for a callout with no
 * positive `tabIndex` is also tab order.
 *
 * Matches `FOCUSABLE_SELECTOR` above (links with `href`, enabled
 * button/input/select/textarea, and anything with a `tabindex` other than `-1`),
 * then drops anything inside an `aria-hidden="true"` subtree.
 *
 * WHAT IT CANNOT SEE, because a selector cannot ask the layout engine anything:
 * an element that is `display: none`, `visibility: hidden`, zero-sized, behind
 * `content-visibility`, inside a closed `<details>`, or scrolled out of an
 * overflow container still matches and is still returned. Real focusability also
 * depends on the `inert` attribute and on shadow roots, neither of which
 * `querySelectorAll` crosses or evaluates. This is acceptable here only because
 * the argument is always the tour's own callout, whose controls are ours and are
 * either rendered or absent; do not lift this into a general-purpose focus-trap
 * helper without adding a visibility check.
 *
 * Returns a new array each call; the focus trap re-queries on every Tab rather
 * than caching, since the card's contents change with each step.
 */
export function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    // Decorative subtrees (the progress pips) are marked aria-hidden and must
    // not become tab stops even if a future style makes them focusable.
    (element) => element.closest('[aria-hidden="true"]') === null,
  );
}

/**
 * Brings the target into view before the spotlight is drawn around it.
 *
 * Smooth by default because the movement explains the jump; instant when the
 * reader has asked for reduced motion, since a scroll across the whole page is
 * exactly the kind of movement that setting exists to stop. The method is
 * optional-chained for jsdom, which does not implement it.
 */
export function scrollTargetIntoView(element: Element): void {
  element.scrollIntoView?.({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'center',
    inline: 'nearest',
  });
}

/**
 * Substitutes `{name}` placeholders in a label template.
 *
 * Deliberately dumber than a real i18n formatter: labels are five short strings
 * and pulling in a formatting library for them would cost consumers more than
 * the feature is worth.
 */
export function formatLabel(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}
