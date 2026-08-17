/**
 * "Has this person already seen the tour?" — the versioned localStorage flag.
 *
 * Two rules govern everything in this file:
 *
 * 1. **Storage access is always wrapped.** Private windows, embedded webviews,
 *    and browsers with third-party storage blocked in an iframe all throw on
 *    `localStorage` rather than returning null. "We could not read the flag"
 *    must degrade to "show the tour", never to a crash inside someone's app.
 *
 * 2. **Dismissing counts as seen.** A reader who pressed Skip does not want the
 *    tour ambushing them on the next page load. Replay is always one button
 *    away, so the cost of being wrong in this direction is zero.
 */

/** Default namespace for the seen flag. Overridable via the `storageKey` prop. */
export const DEFAULT_STORAGE_KEY = 'react-spotlight-tour';

/**
 * Builds the versioned key, e.g. `react-spotlight-tour:seen:v1`.
 *
 * ## When to bump the version
 *
 * Bumping changes the key, which makes the tour auto-play once more for
 * *everyone* — including people who deliberately dismissed it. That is a real
 * interruption, so spend it only when the tour genuinely teaches something new:
 *
 * - a page or major feature was added, removed or moved;
 * - navigation was restructured, so the old walkthrough describes a UI that no
 *   longer exists;
 * - the steps were rewritten rather than edited.
 *
 * Do **not** bump for a typo fix, a reworded sentence, or a placement tweak.
 * A tour that reappears after every deploy is a tour users train themselves to
 * dismiss without reading, which is worse than no tour at all.
 */
export function makeSeenKey(storageKey: string, version: number): string {
  return `${storageKey}:seen:v${version}`;
}

/** True once the reader has finished *or* dismissed this version of the tour. */
export function hasSeenTour(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    // No storage means no memory between visits. Auto-playing every time is
    // still a better outcome than never playing at all.
    return false;
  }
}

/** Records that the tour has been seen. Stores a timestamp purely for debugging. */
export function markTourSeen(key: string): void {
  try {
    window.localStorage.setItem(key, new Date().toISOString());
  } catch {
    // Best effort. The current session still gets a tour that closes on demand.
  }
}

/**
 * Clears the flag so the tour auto-plays again. Exported for the host app's own
 * "reset onboarding" affordance, and used by the demo site.
 */
export function clearTourSeen(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clear if storage was never readable in the first place.
  }
}
