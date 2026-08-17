/**
 * Public entry point for react-spotlight-tour.
 *
 * The CSS is deliberately *not* imported here. Bundlers differ on how they
 * handle a CSS import inside a dependency's JS entry (and Node's require()
 * chokes on it outright), so the stylesheet is a separate, explicit import:
 *
 *   import 'react-spotlight-tour/styles.css';
 *
 * That also lets a consumer skip it entirely and write their own.
 */

// Named exports only, deliberately. Mixing a default export with named ones
// forces CommonJS consumers into `require('react-spotlight-tour').default`,
// which is a papercut nobody should have to discover at runtime.
export { SpotlightTour } from './SpotlightTour';
export type { SpotlightTourProps } from './SpotlightTour';

export { useTour } from './useTour';

// Imperative control. Usable from anywhere — including outside React — which is
// the whole reason the state lives in a module and not in context.
export { startTour, stopTour, moveTour, goToStep, subscribeTour, getTourState } from './store';
export type { TourState } from './store';

// Persistence helpers, exported so a host app can build its own "reset
// onboarding" affordance or manage the flag server-side with `persist={false}`.
export {
  DEFAULT_STORAGE_KEY,
  clearTourSeen,
  hasSeenTour,
  makeSeenKey,
  markTourSeen,
} from './persistence';

// Placement geometry. Pure and exported mostly so it is testable, but a
// consumer building a custom callout renderer can reuse the same rules.
export { placeCallout } from './placement';
export type { CalloutPosition, Size, SpotRect } from './placement';

export type {
  ResolvedPlacement,
  TourApi,
  TourDirection,
  TourEndReason,
  TourLabels,
  TourPlacement,
  TourStep,
  TourStepContext,
  TourTarget,
} from './types';
