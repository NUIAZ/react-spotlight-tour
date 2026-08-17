/**
 * Demo site for react-spotlight-tour.
 *
 * The page is deliberately two things at once: a fictional analytics dashboard
 * ("Aurora") that gives the tours something real to point at, and a list of
 * worked examples underneath it. Every "Try it" button drives the *same* mounted
 * overlay with a different step list, which is also the recommended shape for a
 * real app — one `<SpotlightTour>` near the root, many possible tours.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SpotlightTour,
  clearTourSeen,
  makeSeenKey,
  startTour,
  useTour,
} from 'react-spotlight-tour';
import type { TourStep } from 'react-spotlight-tour';
import { EXAMPLES } from './examples';
import type { ExampleId } from './examples';

/** Namespace for the demo's own "has seen the intro" flag. */
const DEMO_STORAGE_KEY = 'react-spotlight-tour-demo';
const DEMO_SEEN_KEY = makeSeenKey(DEMO_STORAGE_KEY, 1);

/**
 * The whole demo: the fictional dashboard, the example list, and the single
 * `<SpotlightTour>` every example drives.
 *
 * Two things here are worth copying into a real app rather than treating as demo
 * scaffolding. One overlay is mounted for all five step lists, swapped by state —
 * mounting one per tour would put several dialogs and several focus traps on the
 * page at once. And starting a tour is split in two: the click handler selects
 * the example and bumps a counter, an effect keyed on that counter calls
 * `startTour()`, so the new steps are committed to the DOM before the overlay
 * looks for the first target.
 *
 * The drawer state lives here because the side-effects example's `onEnter`/
 * `onExit` toggle it — that is the demo showing that a step can create the
 * element it is about to spotlight.
 */
export default function App() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeExample, setActiveExample] = useState<ExampleId>('basic');
  /**
   * Bumped on every "Try it" press. Selecting the example and starting the tour
   * are two separate concerns: the steps have to be committed to the DOM before
   * the overlay reads them, so the start happens in an effect keyed on this
   * counter rather than inline in the click handler. The counter (rather than a
   * boolean) is what makes pressing the *same* button twice work.
   */
  const [runRequest, setRunRequest] = useState(0);

  const tour = useTour();

  // ---- step lists ---------------------------------------------------------
  // Memoised per example. `drawerOpen` is intentionally absent from the deps:
  // the side-effect steps close over the *setter*, which React guarantees is
  // stable, so rebuilding the list whenever the drawer moves would be churn.

  const basicSteps = useMemo<TourStep[]>(
    () => [
      {
        id: 'nav',
        target: '[data-tour="nav"]',
        title: 'Everything lives here',
        content: 'Sections are grouped, and the active one stays expanded.',
        placement: 'right',
      },
      {
        id: 'metrics',
        target: '[data-tour="metrics"]',
        title: 'The numbers that matter first',
        content: 'Each tile links to the filtered list behind its number.',
        placement: 'bottom',
      },
      {
        id: 'chart',
        target: '[data-tour="chart"]',
        title: 'Thirty days of activity',
        content: 'Hover a bar for the exact figure; drag to zoom into a range.',
        placement: 'top',
      },
      {
        id: 'account',
        target: '[data-tour="account"]',
        title: 'Make it yours',
        content: 'Theme, density and notification settings live behind here.',
        placement: 'left',
      },
    ],
    [],
  );

  // The first two steps target the pill pinned to the bottom-left *corner of
  // the viewport*. That is the only way to demonstrate flipping honestly: a
  // target inside the centred page column usually has room on every side, so
  // asking for an "impossible" side there would still be satisfiable on a wide
  // monitor and the example would quietly prove nothing.
  const placementSteps = useMemo<TourStep[]>(
    () => [
      {
        id: 'edge-left',
        target: '[data-tour="edge-pill"]',
        placement: 'left',
        title: 'Asked for left',
        content:
          'The pill is flush against the left edge of the window, so there is no room on that side at all. The callout flipped to the right.',
      },
      {
        id: 'edge-bottom',
        target: '[data-tour="edge-pill"]',
        placement: 'bottom',
        title: 'Asked for bottom',
        content:
          'Same target, same problem on the other axis: it is pinned to the bottom of the window, so the callout flipped to the top.',
      },
      {
        id: 'roomy',
        target: '[data-tour="chart"]',
        placement: 'right',
        title: 'Asked for right',
        content: 'This one had space on the requested side, so the preference was honoured.',
      },
    ],
    [],
  );

  const missingSteps = useMemo<TourStep[]>(
    () => [
      {
        id: 'one',
        target: '[data-tour="metrics"]',
        title: 'Step one of three',
        content: 'Press Next. The second step points at something that is not on this page.',
        placement: 'bottom',
      },
      {
        id: 'two',
        target: '[data-tour="quarterly-forecast"]',
        title: 'Step two of three',
        content: 'You should never see this card.',
      },
      {
        id: 'three',
        target: '[data-tour="chart"]',
        title: 'Step three of three',
        content:
          'You arrived here directly. Press Back and step two is skipped again, backwards this time.',
        placement: 'top',
      },
    ],
    [],
  );

  const sideEffectSteps = useMemo<TourStep[]>(
    () => [
      {
        id: 'metrics',
        target: '[data-tour="metrics"]',
        title: 'Nothing unusual yet',
        content: 'Press Next — the drawer holding the following target is still closed.',
        placement: 'bottom',
      },
      {
        id: 'saved-view',
        target: '[data-tour="saved-view"]',
        title: 'Saved views',
        content: 'Any filter combination can be saved and shared as a link.',
        placement: 'left',
        onEnter: () => setDrawerOpen(true),
        onExit: () => setDrawerOpen(false),
      },
      {
        id: 'chart',
        target: '[data-tour="chart"]',
        title: 'And it tidied up after itself',
        content: 'onExit closed the drawer on the way out, however you left the step.',
        placement: 'top',
      },
    ],
    [],
  );

  const stepsByExample = useMemo<Record<ExampleId, TourStep[]>>(
    () => ({
      basic: basicSteps,
      placement: placementSteps,
      missing: missingSteps,
      sideEffects: sideEffectSteps,
      // Same content as the first example: the point of the theming demo is
      // that nothing but CSS changed.
      theming: basicSteps,
    }),
    [basicSteps, placementSteps, missingSteps, sideEffectSteps],
  );

  const activeSteps = stepsByExample[activeExample];

  // ---- run control --------------------------------------------------------
  const run = useCallback((id: ExampleId) => {
    setActiveExample(id);
    setRunRequest((n) => n + 1);
  }, []);

  useEffect(() => {
    if (runRequest === 0) return;
    startTour();
  }, [runRequest]);

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead-inner">
          <p className="eyebrow">react-spotlight-tour</p>
          <h1>Guided tours that do not get stuck.</h1>
          <p className="lede">
            A dependency-free React overlay: dim the page, ring one element, explain it, move on.
            Accessible by default, router-agnostic, themed with CSS custom properties, and about
            9&nbsp;kB before compression.
          </p>
          <div className="masthead-actions">
            <button type="button" className="cta" onClick={() => run('basic')}>
              Take the tour
            </button>
            <button
              type="button"
              className="cta cta-ghost"
              onClick={() => {
                clearTourSeen(DEMO_SEEN_KEY);
                window.location.reload();
              }}
            >
              Reset &ldquo;seen&rdquo; flag
            </button>
          </div>
          <p className="masthead-status" role="status">
            {tour.isActive
              ? `Tour running — step ${tour.stepIndex + 1} of ${tour.stepCount}`
              : 'No tour running.'}
          </p>
        </div>
      </header>

      {/* ---- the fictional app the tours point at --------------------------- */}
      <section className="demo-app" aria-label="Aurora Analytics, a fictional dashboard">
        <aside className="app-nav" data-tour="nav">
          <div className="app-brand">
            <span className="app-brand-mark" aria-hidden="true" />
            Aurora
          </div>
          <nav aria-label="Demo navigation">
            <a className="nav-item is-current" href="#overview">
              Overview
            </a>
            <a className="nav-item" href="#reports">
              Reports
            </a>
            <a className="nav-item" href="#audiences">
              Audiences
            </a>
            <a className="nav-item" href="#settings">
              Settings
            </a>
          </nav>
        </aside>

        <main className="app-main">
          <div className="app-topbar">
            <h2 className="app-title">Overview</h2>
            <button type="button" className="app-account" data-tour="account">
              <span className="avatar" aria-hidden="true">
                JR
              </span>
              Account
            </button>
          </div>

          <div className="tiles" data-tour="metrics">
            {[
              { label: 'Active sessions', value: '3,481' },
              { label: 'Conversion', value: '4.2%' },
              { label: 'Avg. response', value: '184 ms' },
              { label: 'Open issues', value: '7' },
            ].map((tile) => (
              <div className="tile" key={tile.label}>
                <span className="tile-value">{tile.value}</span>
                <span className="tile-label">{tile.label}</span>
              </div>
            ))}
          </div>

          <div className="chart-card" data-tour="chart">
            <div className="chart-head">
              <h3>Activity, last 30 days</h3>
              <span className="chart-legend">Sessions</span>
            </div>
            <div className="chart" role="img" aria-label="Bar chart of sessions over 30 days">
              {BAR_HEIGHTS.map((height, i) => (
                <span
                  // Index keys are fine here: this is a fixed decorative array
                  // that is never reordered.
                  key={i}
                  className="bar"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </div>

          <div className="status-bar" data-tour="status-bar">
            <span className="dot" aria-hidden="true" /> All systems nominal · last sync 2 min ago
          </div>
        </main>

        {/* Only in the DOM while open — which is exactly what makes it a
            worthwhile target for the onEnter example. */}
        {drawerOpen && (
          <aside className="app-drawer" aria-label="Saved views">
            <h3>Saved views</h3>
            <ul>
              <li className="saved-view" data-tour="saved-view">
                Weekly exec summary
              </li>
              <li className="saved-view">Onboarding funnel</li>
              <li className="saved-view">Errors by region</li>
            </ul>
          </aside>
        )}
      </section>

      {/* ---- worked examples ------------------------------------------------ */}
      <section className="examples" aria-label="Worked examples">
        <h2 className="section-title">Worked examples</h2>
        <p className="section-sub">
          Each one drives the dashboard above. The code is the real configuration, not a
          paraphrase.
        </p>

        {EXAMPLES.map((example) => (
          <article className="example" key={example.id} id={example.id}>
            <div className="example-head">
              <h3>{example.title}</h3>
              <button
                type="button"
                className="cta cta-small"
                onClick={() => run(example.id)}
                data-example={example.id}
              >
                Try it
              </button>
            </div>
            <p className="example-blurb">{example.blurb}</p>
            {example.note !== undefined && <p className="example-note">{example.note}</p>}
            <CodeBlock code={example.code} label={example.title} />
          </article>
        ))}
      </section>

      {/* Pinned to the viewport corner so the placement example has a target
          with genuinely no room on two of its four sides. */}
      <div className="edge-pill" data-tour="edge-pill">
        v0.1.0 · demo build
      </div>

      <footer className="footer">
        <p>
          MIT licensed. Aurora Analytics is a fictional product invented so the tours have
          somewhere to point.
        </p>
      </footer>

      {/*
        One overlay for the whole page. `autoStart` gives a first-time visitor
        the basic tour once, gated on the dashboard actually being in the DOM so
        the first spotlight never lands on an empty page.
      */}
      <SpotlightTour
        steps={activeSteps}
        autoStart
        autoStartWhen='[data-tour="metrics"]'
        storageKey={DEMO_STORAGE_KEY}
        version={1}
        className={activeExample === 'theming' ? 'midnight-tour' : undefined}
        resolveTimeoutMs={600}
      />
    </div>
  );
}

/** Decorative bar heights, as percentages. Fixed so the page never reflows. */
const BAR_HEIGHTS = [
  38, 44, 41, 52, 60, 48, 55, 63, 58, 71, 66, 74, 69, 80, 76, 68, 72, 61, 66, 78, 84, 79, 88, 82,
  91, 86, 94, 89, 96, 92,
];

/**
 * A code block with a copy button.
 *
 * `navigator.clipboard` is not available on insecure origins, so the failure
 * path is handled rather than swallowed — a copy button that silently does
 * nothing is worse than one that admits it.
 */
function CodeBlock({ code, label }: { code: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = useCallback(() => {
    navigator.clipboard
      ?.writeText(code)
      .then(() => setState('copied'))
      .catch(() => setState('failed'));
  }, [code]);

  useEffect(() => {
    if (state === 'idle') return;
    const timer = window.setTimeout(() => setState('idle'), 1800);
    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <div className="code-wrap">
      <button
        type="button"
        className="copy-button"
        onClick={copy}
        aria-label={`Copy the code for ${label}`}
      >
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}
      </button>
      <pre className="code">
        <code>{code}</code>
      </pre>
    </div>
  );
}
