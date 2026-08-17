/**
 * SpotlightTour: the overlay that dims the page, rings one element at a time,
 * and explains it.
 *
 * Mount it once, near the root of the app. It renders nothing until a tour is
 * running, so the cost of having it mounted is a subscription and no DOM.
 *
 * Five design decisions worth knowing about before changing anything here:
 *
 * 1. **A missing target skips the step; it never stalls.** Steps point at
 *    elements on lazily-loaded routes, at panels that only exist once data
 *    arrives, and at chrome a narrow viewport hides. Every step therefore gets
 *    a short grace period to appear, and if it does not, the tour keeps
 *    travelling in whichever direction the reader was going. A tour frozen on a
 *    blank spotlight is the failure mode that makes the whole feature look
 *    broken, and it is far worse than one step nobody saw.
 *
 * 2. **Routing is a callback, not a dependency.** The component never imports a
 *    router. A step declares `route`, and if it differs from the `currentRoute`
 *    prop the tour calls `onNavigate(route)` and waits for `currentRoute` to
 *    change. That makes the same build work under react-router, Next.js, TanStack
 *    Router, or no router at all — which is the common case for a settings
 *    dialog tour.
 *
 * 3. **The scrim is one box-shadow, not a mask or four divs.** The spotlight is
 *    a single absolutely-positioned box carrying a 9999px shadow spread:
 *    everything outside it gets the wash, the box itself stays untouched. It is
 *    one element, it animates cleanly between targets, and it degrades to
 *    "everything dimmed" if the geometry is ever wrong.
 *
 * 4. **`onEnter` fires before target resolution.** Its main job is to *create*
 *    the target — open the drawer, expand the accordion, switch the tab. Firing
 *    it after resolution would guarantee the element was never there in time.
 *
 * 5. **There is always a way out.** Escape, the Skip control, and (optionally)
 *    a scrim click all end the tour, and the callout is rendered even when no
 *    target resolves. Trapping someone inside an onboarding overlay is the one
 *    unforgivable bug in this category of component.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { createPortal } from 'react-dom';
import {
  focusableWithin,
  formatLabel,
  prefersReducedMotion,
  readRect,
  resolveTarget,
  scrollTargetIntoView,
} from './dom';
import { DEFAULT_SPOTLIGHT_PADDING, placeCallout } from './placement';
import type { CalloutPosition, SpotRect } from './placement';
import {
  DEFAULT_STORAGE_KEY,
  hasSeenTour,
  makeSeenKey,
  markTourSeen,
} from './persistence';
import {
  getTourServerState,
  getTourState,
  moveTour,
  setTourStepCount,
  skipToStep,
  startTour,
  stopTour,
  subscribeTour,
} from './store';
import type {
  TourEndReason,
  TourLabels,
  TourStep,
  TourStepContext,
} from './types';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Re-check interval while waiting for a step's target to appear, in ms. */
const POLL_INTERVAL_MS = 60;
/** Default grace period for a step target before the step is skipped, in ms. */
const DEFAULT_RESOLVE_TIMEOUT_MS = 2500;
/** Default ceiling on how long auto-start waits for its readiness gate, in ms. */
const DEFAULT_AUTO_START_TIMEOUT_MS = 8000;

/** English defaults. Every one of them is overridable via the `labels` prop. */
const DEFAULT_LABELS: TourLabels = {
  next: 'Next',
  finish: 'Finish',
  back: 'Back',
  skip: 'Skip',
  stepCount: '{current} of {total}',
  announcement: 'Step {current} of {total}: {title}',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SpotlightTourProps {
  /**
   * The steps, in order.
   *
   * Treated as stable: the tour reads it through a ref for lifecycle hooks so
   * that an inline array literal re-created on every render does not re-fire
   * `onEnter` in a loop. Define it at module scope, or memoise it.
   */
  steps: TourStep[];

  /**
   * Auto-play the tour once, for readers who have not seen this version.
   *
   * Off by default. A library that ambushes people on first mount is a library
   * that gets ripped out, and the host app almost always knows better than we
   * do when its UI is actually ready to be pointed at.
   */
  autoStart?: boolean;

  /**
   * CSS selector that must exist before auto-start fires.
   *
   * The point is to wait for real content instead of a loading skeleton —
   * auto-starting any earlier lands the very first spotlight on a spinner.
   * Polled until `autoStartTimeoutMs`; if it never appears the tour stays
   * quiet, because spotlighting an error state helps nobody.
   */
  autoStartWhen?: string;

  /** Ceiling on the auto-start readiness wait. Default 8000ms. */
  autoStartTimeoutMs?: number;

  /**
   * Whether the library reads and writes the "has seen" flag itself.
   *
   * Set `false` to opt out entirely: nothing is read, nothing is written, and
   * `autoStart` then starts the tour every time. That is the mode to use when
   * the flag belongs on the user's server-side profile rather than in one
   * browser's localStorage.
   */
  persist?: boolean;

  /** Namespace for the persisted flag. Default `'react-spotlight-tour'`. */
  storageKey?: string;

  /**
   * Version of the walkthrough. Bumping it re-plays the tour for everyone —
   * see the guidance on {@link makeSeenKey} before you do.
   */
  version?: number;

  /** Grace period for a step target before the step is skipped. Default 2500ms. */
  resolveTimeoutMs?: number;

  /** Default breathing room between target and ring, in px. Default 8. */
  spotlightPadding?: number;

  /**
   * The route the host app is currently on. Only meaningful alongside
   * `onNavigate`; the tour compares it with `step.route` to decide whether it
   * still needs to navigate.
   */
  currentRoute?: string;

  /**
   * Called when a step lives on a different route than `currentRoute`.
   *
   * Wire it to your router's navigate function. The tour then waits for
   * `currentRoute` to catch up before it starts hunting for the target, and the
   * usual resolve timeout covers the case where navigation fails.
   */
  onNavigate?: (route: string) => void;

  /** Fired whenever the current step changes, including the first one. */
  onStepChange?: (step: TourStep, index: number) => void;

  /** Fired once when the tour ends, with the reason it ended. */
  onFinish?: (reason: TourEndReason) => void;

  /** Overrides for the user-visible strings. Merged over the English defaults. */
  labels?: Partial<TourLabels>;

  /** Extra class on the overlay root — the hook for scoped theming. */
  className?: string;

  /**
   * Portal host. Defaults to `document.body`.
   *
   * Portalling matters: rendered in place, the overlay would inherit any
   * ancestor `transform`, `filter` or `contain`, each of which creates a new
   * containing block and would silently break `position: fixed`.
   */
  container?: HTMLElement | null;

  /** End the tour when the scrim is clicked. Default false. */
  closeOnScrimClick?: boolean;

  /** Show the progress pips under the body copy. Default true. */
  showProgress?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * The tour overlay. Mount exactly one of these; it is driven by the module-level
 * store, so `startTour()` from anywhere in the app opens this instance.
 */
export function SpotlightTour({
  steps,
  autoStart = false,
  autoStartWhen,
  autoStartTimeoutMs = DEFAULT_AUTO_START_TIMEOUT_MS,
  persist = true,
  storageKey = DEFAULT_STORAGE_KEY,
  version = 1,
  resolveTimeoutMs = DEFAULT_RESOLVE_TIMEOUT_MS,
  spotlightPadding = DEFAULT_SPOTLIGHT_PADDING,
  currentRoute,
  onNavigate,
  onStepChange,
  onFinish,
  labels,
  className,
  container,
  closeOnScrimClick = false,
  showProgress = true,
}: SpotlightTourProps): ReactElement | null {
  const state = useSyncExternalStore(subscribeTour, getTourState, getTourServerState);
  const { active, index, direction, runId, endReason } = state;

  const [rect, setRect] = useState<SpotRect | null>(null);
  const [position, setPosition] = useState<CalloutPosition>({
    top: 0,
    left: 0,
    placement: 'center',
  });

  /** The element the current step resolved to, kept so it can be re-measured. */
  const targetRef = useRef<Element | null>(null);
  /** Focus is restored here on exit, per the dialog contract. */
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const calloutRef = useRef<HTMLDivElement | null>(null);

  /**
   * Latest props that effects read but must not re-run for. `steps` in
   * particular: consumers write `steps={[...]}` inline all the time, and making
   * the lifecycle effect depend on that identity would re-fire `onEnter` on
   * every parent render.
   */
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const onStepChangeRef = useRef(onStepChange);
  onStepChangeRef.current = onStepChange;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const step: TourStep | undefined = active ? steps[index] : undefined;
  const seenKey = useMemo(() => makeSeenKey(storageKey, version), [storageKey, version]);
  const text = useMemo<TourLabels>(() => ({ ...DEFAULT_LABELS, ...labels }), [labels]);

  // ---- publish the step count -------------------------------------------
  // The store clamps `next()` against this; without it a tour driven purely
  // through `useTour().next()` would run off the end of the list.
  useEffect(() => {
    setTourStepCount(steps.length);
    return () => setTourStepCount(0);
  }, [steps.length]);

  // ---- lifecycle hooks ---------------------------------------------------
  // Declared before the resolution effect on purpose: React flushes effects in
  // declaration order, so whatever `onEnter` renders exists in the DOM by the
  // time the resolver runs its first attempt in the same tick.
  useEffect(() => {
    if (!active) return;
    const current = stepsRef.current[index];
    if (current === undefined) return;

    const context: TourStepContext = {
      step: current,
      index,
      total: stepsRef.current.length,
      direction,
    };
    current.onEnter?.(context);
    onStepChangeRef.current?.(current, index);

    // The cleanup covers every way of leaving a step — Next, Back, Escape,
    // unmount — which is exactly the contract `onExit` should have.
    return () => {
      current.onExit?.(context);
    };
    // `direction` is intentionally excluded: it changes as part of the same
    // transition that changes `index`, and including it would double-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index, runId]);

  // ---- drop the previous step's ring -------------------------------------
  // Declared *before* the resolver so that within a single effect flush the
  // order is "clear, then resolve". The other way round, the resolver's
  // synchronous first attempt would set the new rect and this effect would
  // immediately null it out again in the same batch.
  useEffect(() => {
    targetRef.current = null;
    setRect(null);
  }, [active, index, runId]);

  // ---- step resolution ---------------------------------------------------
  // Navigate if the step lives elsewhere, then poll for its target until it
  // appears or the grace period expires. Re-runs on `currentRoute` changes
  // because that is how the navigation half of the job completes.
  useEffect(() => {
    if (!active) return;

    const list = stepsRef.current;
    const current = list[index];
    // Walked off either end of the list — treat it as a finished tour rather
    // than rendering an empty overlay.
    if (current === undefined) {
      stopTour(index >= list.length ? 'completed' : 'dismissed');
      return;
    }

    if (
      current.route !== undefined &&
      onNavigateRef.current !== undefined &&
      current.route !== currentRoute
    ) {
      onNavigateRef.current(current.route);
      // Bail out without polling: this effect re-runs when `currentRoute`
      // changes, and that re-run is what actually looks for the target.
      return;
    }

    let cancelled = false;
    let timer = 0;
    const deadline = Date.now() + resolveTimeoutMs;

    const attempt = (): void => {
      if (cancelled) return;

      const element = resolveTarget(current.target);
      if (element !== null) {
        targetRef.current = element;
        scrollTargetIntoView(element);
        // Read the box *now* so the ring appears immediately; the scroll
        // listener keeps it glued to the target for the rest of the animation.
        setRect(readRect(element));
        return;
      }

      if (Date.now() >= deadline) {
        // Gone for good. Keep moving in the reader's direction of travel
        // instead of holding them on an empty spotlight — see the file header.
        const next = index + direction;
        if (next < 0 || next >= list.length) {
          stopTour(direction === 1 ? 'completed' : 'dismissed');
        } else {
          skipToStep(next, direction);
        }
        return;
      }

      timer = window.setTimeout(attempt, POLL_INTERVAL_MS);
    };

    attempt();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, index, direction, runId, currentRoute, resolveTimeoutMs]);

  // ---- keep the spotlight glued to its target ----------------------------
  /**
   * Re-reads the target's box and updates the ring.
   *
   * The equality check is not a micro-optimisation. Every state update here
   * forces the layout effect below to read `offsetWidth`, which is a synchronous
   * reflow; doing that on every one of the dozens of scroll events a single
   * smooth-scroll emits is textbook layout thrashing, and it happens while the
   * browser is already busy rasterising a viewport-sized box-shadow.
   */
  const applyRect = useCallback((next: SpotRect | null): void => {
    setRect((previous) => {
      if (previous === null || next === null) return previous === next ? previous : next;
      return previous.top === next.top &&
        previous.left === next.left &&
        previous.width === next.width &&
        previous.height === next.height
        ? previous
        : next;
    });
  }, []);

  const measure = useCallback((): void => {
    const element = targetRef.current;
    if (element === null) return;
    // A target unmounted under us (a re-render, a data reload) drops the ring
    // rather than leaving it stranded over empty page.
    if (!element.isConnected) {
      targetRef.current = null;
      setRect(null);
      return;
    }
    applyRect(readRect(element));
  }, [applyRect]);

  useEffect(() => {
    if (!active) return;

    // Coalesced to one measurement per frame. Scroll and resize both fire far
    // faster than the screen refreshes, and the ring cannot move more often
    // than it is painted anyway.
    let frame = 0;
    const schedule = (): void => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    window.addEventListener('resize', schedule);
    // Capture phase: page content usually scrolls inside an inner container,
    // and scroll events from those do not bubble up to window.
    window.addEventListener('scroll', schedule, true);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [active, measure]);

  // ---- callout placement -------------------------------------------------
  // A layout effect so the card is positioned before paint. The functional
  // setState returns the previous object when nothing moved, which is what
  // stops "measure → setState → re-measure" from looping forever.
  useLayoutEffect(() => {
    if (!active) return;
    const node = calloutRef.current;
    if (node === null) return;

    const next = placeCallout(
      rect,
      { width: node.offsetWidth, height: node.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      step?.placement ?? 'bottom',
      step?.spotlightPadding ?? spotlightPadding,
    );

    setPosition((previous) =>
      previous.top === next.top &&
      previous.left === next.left &&
      previous.placement === next.placement
        ? previous
        : next,
    );
  }, [active, rect, step?.placement, step?.spotlightPadding, spotlightPadding]);

  // ---- focus -------------------------------------------------------------
  // Capture the pre-tour focus once per run and restore it on exit, so a
  // keyboard user is put back exactly where they were.
  useEffect(() => {
    if (!active) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    return () => {
      restoreFocusRef.current?.focus?.();
      restoreFocusRef.current = null;
    };
  }, [active, runId]);

  // Pull focus to the card on every step, so the keyboard handlers below reach
  // the tour rather than whatever was focused on the page underneath.
  useEffect(() => {
    if (!active) return;
    calloutRef.current?.focus();
  }, [active, index, runId]);

  // ---- keyboard ----------------------------------------------------------
  useEffect(() => {
    if (!active) return;

    const trapTab = (event: KeyboardEvent): void => {
      const root = calloutRef.current;
      if (root === null) return;
      const focusable = focusableWithin(root);
      if (focusable.length === 0) {
        // Nothing to move to; swallowing Tab is what keeps focus from escaping
        // to the dimmed page behind the dialog.
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;

      const activeElement = document.activeElement;
      // The card itself is focusable (tabIndex -1) and is where focus starts,
      // so it counts as "before the first control" in both directions.
      if (event.shiftKey && (activeElement === first || activeElement === root)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || activeElement === root)) {
        event.preventDefault();
        first.focus();
      } else if (!root.contains(activeElement)) {
        // Focus already escaped somehow (a click on the page, a stray
        // programmatic focus). Pull it back rather than letting Tab walk away.
        event.preventDefault();
        first.focus();
      }
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          stopTour('dismissed');
          return;
        case 'ArrowRight':
          event.preventDefault();
          moveTour(1);
          return;
        case 'ArrowLeft':
          event.preventDefault();
          moveTour(-1);
          return;
        case 'Enter': {
          // A focused button is already an Enter target; handling it here too
          // would advance two steps on a single keypress.
          const target = event.target as HTMLElement | null;
          if (target?.tagName === 'BUTTON') return;
          event.preventDefault();
          moveTour(1);
          return;
        }
        case 'Tab':
          trapTab(event);
          return;
        default:
          return;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active]);

  // ---- persistence + onFinish --------------------------------------------
  // Runs on the transition into `active: false`, which is the one moment that
  // means "the tour is over" regardless of how it got there.
  const wasActiveRef = useRef(false);
  useEffect(() => {
    if (active) {
      wasActiveRef.current = true;
      return;
    }
    if (!wasActiveRef.current) return;
    wasActiveRef.current = false;

    // Dismissing counts as seen: someone who pressed Skip does not want it back
    // on the next page load, and replay is always available.
    if (persist) markTourSeen(seenKey);
    onFinishRef.current?.(endReason ?? 'dismissed');
  }, [active, persist, seenKey, endReason]);

  // ---- first-run auto-play -----------------------------------------------
  // Mount-only on purpose: the decision is about how the reader *arrived*.
  // Re-arming it on later prop changes would ambush someone mid-task.
  useEffect(() => {
    if (!autoStart) return;
    if (persist && hasSeenTour(seenKey)) return;

    let cancelled = false;
    let timer = 0;
    const deadline = Date.now() + autoStartTimeoutMs;

    const attempt = (): void => {
      if (cancelled) return;
      if (autoStartWhen === undefined || document.querySelector(autoStartWhen) !== null) {
        startTour();
        return;
      }
      // The gate never opened (an offline API, a crash caught by an error
      // boundary). Staying quiet beats spotlighting an error banner.
      if (Date.now() >= deadline) return;
      timer = window.setTimeout(attempt, POLL_INTERVAL_MS);
    };

    attempt();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // Mount-only by design — see the comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- render ------------------------------------------------------------
  if (!active || step === undefined) return null;
  if (typeof document === 'undefined') return null;

  const total = steps.length;
  const isLast = index === total - 1;
  const titleId = `rst-title-${step.id}`;
  const bodyId = `rst-body-${step.id}`;
  const padding = step.spotlightPadding ?? spotlightPadding;
  const reduceMotion = prefersReducedMotion();

  const spotlightStyle: CSSProperties =
    rect === null
      ? {}
      : {
          top: rect.top - padding,
          left: rect.left - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        };

  const overlay = (
    <div
      className={[
        'rst-overlay',
        rect === null ? '' : 'rst-has-spotlight',
        reduceMotion ? 'rst-reduced-motion' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="spotlight-tour"
      data-reduced-motion={reduceMotion ? 'true' : 'false'}
    >
      {/* Swallows clicks on the page beneath, so a stray click cannot navigate
          out from under the tour. Dim on its own while a step is still
          resolving; transparent once the ring's shadow supplies the wash. */}
      <div
        className="rst-scrim"
        data-testid="spotlight-tour-scrim"
        onClick={closeOnScrimClick ? () => stopTour('dismissed') : undefined}
      />

      {rect !== null && (
        <div className="rst-spotlight" data-testid="spotlight-tour-ring" style={spotlightStyle} />
      )}

      {/* The dialog is the callout, not the whole overlay: the accessible name
          and description must describe the thing holding the controls. */}
      <div
        ref={calloutRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className={`rst-callout rst-place-${position.placement}`}
        style={{ top: position.top, left: position.left }}
        tabIndex={-1}
        data-testid="spotlight-tour-callout"
        data-placement={position.placement}
      >
        <div className="rst-meta">
          <span className="rst-count" data-testid="spotlight-tour-count">
            {formatLabel(text.stepCount, { current: index + 1, total })}
          </span>
          <button
            type="button"
            className="rst-skip"
            onClick={() => stopTour('dismissed')}
            data-testid="spotlight-tour-skip"
          >
            {text.skip}
          </button>
        </div>

        <h2 className="rst-title" id={titleId}>
          {step.title}
        </h2>
        <div className="rst-body" id={bodyId}>
          {step.content}
        </div>

        {showProgress && (
          <div className="rst-pips" aria-hidden="true">
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={[
                  'rst-pip',
                  i === index ? 'rst-pip-current' : '',
                  i < index ? 'rst-pip-done' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
            ))}
          </div>
        )}

        <div className="rst-actions">
          <button
            type="button"
            className="rst-button rst-button-ghost"
            onClick={() => moveTour(-1)}
            disabled={index === 0}
            data-testid="spotlight-tour-back"
          >
            {text.back}
          </button>
          <button
            type="button"
            className="rst-button rst-button-primary"
            onClick={() => (isLast ? stopTour('completed') : moveTour(1))}
            data-testid="spotlight-tour-next"
          >
            {isLast ? text.finish : text.next}
          </button>
        </div>
      </div>

      {/*
        Step changes are announced through a dedicated live region rather than
        by putting aria-live on the dialog. Screen readers already announce a
        dialog's name and description when focus enters it; a live region on
        the same node makes some of them read the whole card twice.
      */}
      <div className="rst-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {formatLabel(text.announcement, {
          current: index + 1,
          total,
          title: step.title,
        })}
      </div>
    </div>
  );

  return createPortal(overlay, container ?? document.body);
}
