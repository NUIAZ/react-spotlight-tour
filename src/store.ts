/**
 * The tour's state lives in a module-level store, not in React context.
 *
 * WHY, since a provider is the reflexive answer:
 *
 * 1. **Replay buttons are scattered.** A "show me around again" control
 *    typically sits in a top bar, a help page and an empty state: three
 *    different subtrees, often lazily loaded. A provider would have to wrap all
 *    of them, which in practice means wrapping the whole app and threading a
 *    context through code that has nothing to do with tours. A 30-line
 *    subscriber set is less machinery than that, and `startTour()` is then a
 *    plain import with no positional requirement.
 *
 * 2. **It stays usable outside React.** A route guard, an analytics handler or
 *    a plain DOM event listener can start the tour without being a component.
 *
 * The trade-off is that exactly one `<SpotlightTour>` should be mounted at a
 * time, which is true of any modal overlay anyway, and is documented.
 *
 * Consumed through `useSyncExternalStore`, so the snapshot object is replaced
 * (never mutated) on every change: React compares snapshots by identity and
 * would silently skip renders if we mutated in place.
 */
import type { TourDirection, TourEndReason } from './types';

/** Immutable snapshot handed to React. */
export interface TourState {
  /** True while the overlay should be on screen. */
  active: boolean;
  /** Zero-based index of the current step. */
  index: number;
  /** Which way the reader last travelled. Decides where a skipped step lands. */
  direction: TourDirection;
  /** How many steps the mounted overlay is driving; 0 when none is mounted. */
  count: number;
  /**
   * Why the tour last ended. Kept in state (rather than passed through a
   * callback argument) so the component can report it from an effect after the
   * transition to `active: false` has actually rendered.
   */
  endReason: TourEndReason | null;
  /**
   * Increments on every `start()`. The step index alone cannot distinguish
   * "start again from step 0" from "already sitting on step 0", and a replay
   * button that does nothing on the second press is a bug report waiting to
   * happen.
   */
  runId: number;
}

const INITIAL: TourState = {
  active: false,
  index: 0,
  direction: 1,
  count: 0,
  endReason: null,
  runId: 0,
};

let state: TourState = INITIAL;

type Listener = () => void;
const listeners = new Set<Listener>();

function setState(patch: Partial<TourState>): void {
  const next: TourState = { ...state, ...patch };
  // Identity is the change signal for useSyncExternalStore; skipping the notify
  // when nothing actually differs avoids pointless renders on repeated calls
  // (a resize handler re-registering the same step count, for instance).
  const unchanged =
    next.active === state.active &&
    next.index === state.index &&
    next.direction === state.direction &&
    next.count === state.count &&
    next.endReason === state.endReason &&
    next.runId === state.runId;
  if (unchanged) return;

  state = next;
  for (const listener of listeners) listener();
}

/** Subscribe to state changes. Returns the unsubscribe function. */
export function subscribeTour(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current snapshot. Stable by identity until something actually changes. */
export function getTourState(): TourState {
  return state;
}

/**
 * Server snapshot for `useSyncExternalStore`. A tour is a client-only,
 * interaction-driven overlay: the correct SSR render is "not running", and
 * returning the live module state would risk a hydration mismatch if some
 * module-scope code started a tour during rendering.
 */
export function getTourServerState(): TourState {
  return INITIAL;
}

/**
 * Starts (or restarts) the tour from the given step.
 *
 * A no-op has no way to fail loudly here: if no `<SpotlightTour>` is mounted,
 * the state simply flips and nothing renders. That is the right behaviour for a
 * replay button on a page that renders before the overlay mounts; throwing
 * would turn a cosmetic ordering issue into a crash.
 */
export function startTour(options?: { at?: number }): void {
  const at = options?.at ?? 0;
  setState({
    active: true,
    index: Math.max(0, at),
    direction: 1,
    endReason: null,
    runId: state.runId + 1,
  });
}

/** Ends the tour. `reason` is reported to `onFinish`. */
export function stopTour(reason: TourEndReason = 'dismissed'): void {
  if (!state.active) return;
  setState({ active: false, endReason: reason });
}

/**
 * Moves by one step in `delta`'s direction.
 *
 * Walking off the end forwards completes the tour; walking off the start
 * backwards is treated as "no", not as an exit, because a reader hammering
 * Back on step one did not ask to be thrown out.
 */
export function moveTour(delta: TourDirection): void {
  if (!state.active) return;
  const next = state.index + delta;
  if (next < 0) return;
  if (state.count > 0 && next >= state.count) {
    setState({ active: false, endReason: 'completed', direction: delta });
    return;
  }
  setState({ index: next, direction: delta });
}

/** Jumps to a specific step, clamped into range. */
export function goToStep(index: number): void {
  if (!state.active) return;
  const max = state.count > 0 ? state.count - 1 : index;
  const clamped = Math.max(0, Math.min(index, max));
  if (clamped === state.index) return;
  setState({ index: clamped, direction: clamped > state.index ? 1 : -1 });
}

/**
 * Internal: used by the resolver when a step's target never appeared, to land
 * on `index` while preserving the direction the reader was travelling in.
 */
export function skipToStep(index: number, direction: TourDirection): void {
  if (!state.active) return;
  setState({ index, direction });
}

/**
 * Internal: the mounted overlay publishes how many steps it has so `moveTour`
 * knows where the end is. Registered on mount, cleared on unmount.
 */
export function setTourStepCount(count: number): void {
  setState({ count });
}

/**
 * Test-only reset. Module state outlives a single `render()`, and a leftover
 * `active: true` from one test would leak into the next.
 */
export function resetTourState(): void {
  state = INITIAL;
  for (const listener of listeners) listener();
}
