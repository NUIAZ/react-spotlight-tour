/**
 * `useTour()` — the React-facing view of the module-level store.
 *
 * The imperative functions (`startTour`, `stopTour`) are usable from anywhere,
 * including outside React. This hook exists for the cases where a component
 * needs to *react* to the tour rather than merely command it: disabling a
 * button while a tour runs, showing "Step 3 of 9" in a status bar, or firing
 * analytics on step changes.
 *
 * `useSyncExternalStore` is the correct primitive here rather than
 * `useState` + `useEffect`: it subscribes during render, so a tour started
 * between render and effect-flush cannot be missed, and it is tear-free under
 * concurrent rendering.
 */
import { useSyncExternalStore } from 'react';
import {
  getTourServerState,
  getTourState,
  goToStep,
  moveTour,
  startTour,
  stopTour,
  subscribeTour,
} from './store';
import type { TourApi } from './types';

/**
 * Subscribes to tour state and returns the control surface.
 *
 * The returned action functions are the module-level singletons, so they are
 * referentially stable forever and safe to list in dependency arrays or pass
 * to memoised children without wrapping.
 */
export function useTour(): TourApi {
  const state = useSyncExternalStore(subscribeTour, getTourState, getTourServerState);

  return {
    isActive: state.active,
    stepIndex: state.index,
    stepCount: state.count,
    start: startTour,
    stop: stopTour,
    next: NEXT,
    back: BACK,
    goTo: goToStep,
  };
}

// Hoisted so `useTour()` returns the same function identities on every call —
// inline arrows would defeat memoisation in any consumer that depends on them.
const NEXT = (): void => moveTour(1);
const BACK = (): void => moveTour(-1);
