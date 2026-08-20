/**
 * The source code shown in each example's copy-able block.
 *
 * These strings are kept beside (not generated from) the live step objects in
 * `App.tsx`. Generating them would produce `[Function]` for the interesting
 * parts (`onEnter`, function targets) and would drop the comments, which are
 * the bit a reader actually wants. The trade-off is that the two must be edited
 * together; the snippets are short enough for that to be honest.
 */

export type ExampleId = 'basic' | 'placement' | 'missing' | 'sideEffects' | 'theming';

/**
 * One entry in the worked-examples list under the demo dashboard.
 *
 * `id` is the join key: the same value names a memoised step list in `App.tsx`,
 * so an entry here with no matching list renders a "Try it" button that starts
 * nothing. `code` is the display copy of that step list, hand-maintained rather
 * than derived (see the file header for why) and is what the copy button hands
 * over verbatim, so it has to stand alone as pasteable source.
 */
export interface Example {
  id: ExampleId;
  title: string;
  /** One paragraph explaining what this example is demonstrating and why. */
  blurb: string;
  /** Anything worth pointing out after the reader has run it. */
  note?: string;
  code: string;
}

/**
 * The five examples, in the order they appear on the page and in the order a
 * reader should meet them: the ordinary shape first, then the three behaviours
 * that are hard to believe without seeing (placement flipping away from the side
 * you asked for, a missing target being skipped rather than stalling, `onEnter`
 * creating its own target), then theming.
 *
 * Array order is presentation order, and `ExampleId` is exhaustive over it: the
 * union, this array and `App.tsx`'s step lists all have to be edited together.
 */
export const EXAMPLES: Example[] = [
  {
    id: 'basic',
    title: 'A basic four-step tour',
    blurb:
      'The whole library in its ordinary shape: an array of steps, one mounted overlay, and a button that calls startTour(). Targets are CSS selectors resolved against the live DOM when the step is shown.',
    note: 'Arrow keys move between steps, Escape leaves, and Tab cycles inside the card.',
    code: `import { SpotlightTour, startTour } from 'react-spotlight-tour';
import 'react-spotlight-tour/styles.css';

const steps = [
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
];

export function App() {
  return (
    <>
      <button onClick={() => startTour()}>Show me around</button>
      <SpotlightTour steps={steps} />
    </>
  );
}`,
  },

  {
    id: 'placement',
    title: 'Placement, and what happens when it does not fit',
    blurb:
      'The first two steps ask for a side that cannot possibly work: they target the little version pill welded to the bottom-left corner of the window, then request "left" and "bottom". Placement is a preference, not an instruction: the overlay flips to the opposite side, then tries the other axis, and only overlaps the target if literally nothing fits. The third step asks for a side that does have room, and gets it.',
    note: 'The callout reports where it actually landed in its data-placement attribute, so you can verify the flip rather than take our word for it.',
    code: `const steps = [
  {
    id: 'edge-left',
    // Pinned to the bottom-left corner of the VIEWPORT, so two of its four
    // sides genuinely have nowhere to put a card.
    target: '[data-tour="edge-pill"]',
    placement: 'left',
    title: 'Asked for left',
    content: 'Flipped to the right, because left would have clipped.',
  },
  {
    id: 'edge-bottom',
    target: '[data-tour="edge-pill"]',
    placement: 'bottom',
    title: 'Asked for bottom',
    content: 'Flipped to the top, for the same reason on the other axis.',
  },
  {
    id: 'roomy',
    target: '[data-tour="chart"]',
    placement: 'right',
    title: 'Asked for right',
    content: 'This one had room, so the preference was honoured.',
  },
];`,
  },

  {
    id: 'missing',
    title: 'A step whose target is not there',
    blurb:
      'The middle step points at an element this page never renders: the everyday case of a panel that only exists when data does, or chrome a narrow viewport hides. The step gets a short grace period to appear and is then skipped in whichever direction the reader was travelling. A tour frozen on a blank spotlight is the failure mode that makes the whole feature look broken.',
    note: 'Run it, then press Next: you land on step 3 directly. Press Back from there and step 2 is skipped again, this time backwards.',
    code: `const steps = [
  { id: 'one', target: '[data-tour="metrics"]', title: 'Step one', content: 'This one exists.' },
  {
    id: 'two',
    // Nothing on the page matches this. It is not an error; it is Tuesday.
    target: '[data-tour="quarterly-forecast"]',
    title: 'Step two',
    content: 'You will never read this.',
  },
  { id: 'three', target: '[data-tour="chart"]', title: 'Step three', content: 'Straight here.' },
];

// The grace period is per-tour. Lower it when targets are already rendered,
// raise it when a step waits on a slow route transition.
<SpotlightTour steps={steps} resolveTimeoutMs={600} />`,
  },

  {
    id: 'sideEffects',
    title: 'onEnter that creates its own target',
    blurb:
      'The second step points inside a drawer that is closed when the tour starts. Its onEnter opens the drawer and its onExit closes it again. This works because onEnter runs before the target is looked up; the ordering is the entire point of the hook, since the most common job for it is opening the thing about to be spotlighted.',
    note: 'Watch the drawer slide open on step 2, and close again when you move on or leave.',
    code: `const steps = [
  { id: 'metrics', target: '[data-tour="metrics"]', title: 'Start here', content: 'Nothing unusual.' },
  {
    id: 'saved-view',
    target: '[data-tour="saved-view"]',   // lives inside the drawer
    title: 'Saved views',
    content: 'Any filter combination can be saved and shared as a link.',
    placement: 'left',
    // Runs BEFORE the target is resolved, so the element exists in time.
    onEnter: () => setDrawerOpen(true),
    // Runs on the way out, however the reader leaves: Next, Back or Escape.
    onExit: () => setDrawerOpen(false),
  },
  { id: 'chart', target: '[data-tour="chart"]', title: 'Back to the page', content: 'Drawer closed itself.' },
];`,
  },

  {
    id: 'theming',
    title: 'Theming with CSS custom properties',
    blurb:
      'No CSS-in-JS and no theme prop: the stylesheet is driven entirely by --rst-* custom properties, so a scoped class passed through className restyles the whole overlay. This example swaps the accent, the card colours and the scrim for a dark, high-contrast variant.',
    note: 'Only CSS changed; the step list is the basic one from the first example.',
    code: `/* styles.css */
.midnight-tour {
  --rst-accent: #a78bfa;
  --rst-accent-fg: #17102b;
  --rst-scrim: rgb(9 6 20 / 82%);
  --rst-callout-bg: #1b1630;
  --rst-callout-fg: #f4f1ff;
  --rst-callout-muted: #b6acd8;
  --rst-callout-border: rgb(167 139 250 / 35%);
  --rst-callout-shadow: 0 20px 50px rgb(5 2 15 / 65%);
  --rst-callout-radius: 16px;
  --rst-radius: 12px;
}

/* Anywhere in the tree: the class lands on the overlay root. */
<SpotlightTour steps={steps} className="midnight-tour" />`,
  },
];
