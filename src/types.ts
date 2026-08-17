/**
 * Public types for react-spotlight-tour.
 *
 * Everything a consumer writes by hand — the step list, the labels, the
 * callbacks — is declared here rather than beside the component that renders
 * it. Content and machinery are separate concerns: a step list is data that
 * product people review, and it should be readable without opening the
 * overlay's source.
 */
import type { ReactNode } from 'react';

/**
 * Preferred side of the target for the callout card.
 *
 * "Preferred" is the operative word: the overlay flips to the opposite side,
 * and then to the other axis, whenever the requested side would push the card
 * off-screen. Authors describe intent, the runtime guarantees visibility.
 */
export type TourPlacement = 'top' | 'bottom' | 'left' | 'right';

/**
 * Where the callout actually ended up. `center` is the honest answer when no
 * target resolved, or when the viewport is too small to sit a card beside
 * anything at all.
 */
export type ResolvedPlacement = TourPlacement | 'center';

/**
 * How a step names the element it spotlights.
 *
 * A CSS selector covers the overwhelming majority of cases and keeps step
 * lists serialisable (they can live in JSON, a CMS, or a translation file).
 * The function form exists for the rest: elements inside a shadow root, a node
 * you already hold a ref to, or a "last row of the table" lookup that no
 * selector expresses cleanly. It is re-invoked on every resolve attempt, so
 * returning `null` simply means "not ready yet".
 */
export type TourTarget = string | (() => Element | null);

/** Why the tour stopped. Passed to `onFinish` so hosts can distinguish the two. */
export type TourEndReason = 'completed' | 'dismissed';

/** Direction of travel through the step list. Decides where a skipped step lands. */
export type TourDirection = 1 | -1;

/**
 * Everything a step lifecycle hook is told about the moment it fires. Passed as
 * one object rather than positional arguments so new fields can be added later
 * without breaking existing hooks.
 */
export interface TourStepContext {
  /** The step being entered or left. */
  step: TourStep;
  /** Zero-based position of that step in the list. */
  index: number;
  /** Total number of steps, for "3 of 9"-style messaging. */
  total: number;
  /** 1 while moving forwards, -1 while moving backwards. */
  direction: TourDirection;
}

/** One stop on the tour. */
export interface TourStep {
  /**
   * Stable identifier. Used as the React key, as the seed for the callout's
   * `aria-labelledby`/`aria-describedby` ids, and as the value reported to
   * `onStepChange` — so keep it stable across releases even if the copy changes.
   */
  id: string;

  /** The element to ring. See {@link TourTarget}. */
  target: TourTarget;

  /** Heading of the callout. Also the accessible name of the tour dialog. */
  title: string;

  /**
   * Body of the callout. Plain strings are the common case; a ReactNode is
   * allowed for the occasional link, `<kbd>` or list.
   */
  content: string | ReactNode;

  /** Preferred side for the callout. Defaults to `'bottom'`. */
  placement?: TourPlacement;

  /**
   * Route this step lives on. Purely a value the tour hands to `onNavigate` —
   * this library never imports a router. Steps that point at persistent chrome
   * (a top bar, a sidebar) leave it undefined and run wherever the reader is.
   */
  route?: string;

  /**
   * Runs when the step becomes current, *before* its target is looked up.
   *
   * The ordering is deliberate and is the whole point of the hook: the most
   * common use is opening the drawer, expanding the accordion or switching the
   * tab that contains the element about to be spotlighted. Firing after
   * resolution would mean the target never existed in time.
   */
  onEnter?: (context: TourStepContext) => void;

  /**
   * Runs when the step stops being current — including when the tour ends or
   * unmounts while sitting on it. Use it to undo whatever `onEnter` did.
   */
  onExit?: (context: TourStepContext) => void;

  /** Per-step override for the breathing room between target and ring, in px. */
  spotlightPadding?: number;
}

/**
 * User-visible strings. Exposed as a prop because a tour is prose, and prose
 * gets translated; hardcoding English into the overlay would make this library
 * unusable outside en-* apps.
 */
export interface TourLabels {
  /** Text of the "move forward" button on every step but the last. */
  next: string;
  /** Text of the "move forward" button on the last step. */
  finish: string;
  /** Text of the "move backward" button. */
  back: string;
  /** Text of the dismiss control in the callout header. */
  skip: string;
  /**
   * Progress readout. `{current}` and `{total}` are substituted; both are
   * optional so a locale can drop one, and the raw string is used if neither
   * placeholder appears.
   */
  stepCount: string;
  /**
   * What screen readers hear when the step changes. `{current}`, `{total}` and
   * `{title}` are substituted.
   */
  announcement: string;
}

/** Imperative surface returned by `useTour()`. */
export interface TourApi {
  /** True while the overlay is on screen. */
  isActive: boolean;
  /** Zero-based index of the current step; meaningless while inactive. */
  stepIndex: number;
  /** Number of steps the mounted `<SpotlightTour>` is currently driving. */
  stepCount: number;
  /** Starts (or restarts) the tour. Pass an index to open partway in. */
  start: (options?: { at?: number }) => void;
  /** Ends the tour. Defaults to reporting `'dismissed'`. */
  stop: (reason?: TourEndReason) => void;
  /** Moves forward one step; finishing past the last step ends the tour. */
  next: () => void;
  /** Moves back one step; a no-op on the first step. */
  back: () => void;
  /** Jumps to an arbitrary step index, clamped to the list. */
  goTo: (index: number) => void;
}
