# react-spotlight-tour

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![React 18 | 19](https://img.shields.io/badge/React-18%20%7C%2019-61dafb.svg)](https://react.dev)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)

A small, dependency-free guided tour for React: dim the page, ring the element
you are talking about, show a callout, step through.

**[Live demo →](https://nuiaz.github.io/react-spotlight-tour/)**

- **Zero runtime dependencies.** React is a peer dependency; nothing else ships.
- **Router-agnostic.** No router import. A step declares a `route`, you supply an
  `onNavigate` callback. Works fine with no router at all.
- **Accessible by default.** `role="dialog"`, `aria-modal`, an accessible name
  and description taken from the step, a real focus trap, focus restored on
  exit, Escape / Arrow / Enter keys, a polite live region for step changes, and
  `prefers-reduced-motion` honoured.
- **Does not get stuck.** A step whose target never appears is skipped in the
  direction the reader was travelling, instead of stalling on a blank spotlight.
- **Themeable with CSS custom properties.** One small stylesheet, no CSS-in-JS.

---

## Install

Not on npm yet; install straight from GitHub (npm resolves the repo and runs the
build via the `prepare` script), or just copy the source: the whole library is
`src/` plus one stylesheet, with zero runtime dependencies.

```bash
npm install github:NUIAZ/react-spotlight-tour
```

## Quick start

```tsx
import { SpotlightTour, startTour } from 'react-spotlight-tour';
import 'react-spotlight-tour/styles.css';

const steps = [
  { id: 'nav', target: '[data-tour="nav"]', title: 'Navigation', content: 'Everything lives here.', placement: 'right' },
  { id: 'stats', target: '[data-tour="stats"]', title: 'Your numbers', content: 'Each tile is a link.' },
  { id: 'account', target: '[data-tour="account"]', title: 'Settings', content: 'Theme and notifications.', placement: 'left' },
];

export default function App() {
  return (
    <>
      <button onClick={() => startTour()}>Show me around</button>
      <SpotlightTour steps={steps} />
      {/* …your app, with matching data-tour attributes… */}
    </>
  );
}
```

That is the whole integration. Mount `<SpotlightTour>` once near the root and
call `startTour()` from anywhere; it is a plain function, not a context value,
so a replay button in a lazily-loaded help page needs no plumbing.

> **Tip:** prefer `data-tour="…"` attributes over class-name selectors. Classes
> exist to be restyled, and a tour that breaks the first time somebody renames a
> layout class is a tour nobody trusts.

---

## The API

There is one component and three ways to drive it. Pick whichever fits; they all
operate on the same state.

| Export | Kind | Use it for |
| --- | --- | --- |
| `<SpotlightTour steps={…} />` | component | Mount once. Renders nothing until a tour runs. |
| `startTour(opts?)` / `stopTour(reason?)` | functions | Firing a tour from anywhere, including outside React. |
| `useTour()` | hook | Reacting to tour state (progress readouts, disabling UI). |

### `<SpotlightTour>` props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `steps` | `TourStep[]` | - | **Required.** The steps, in order. Treated as stable; define at module scope or memoise it. |
| `autoStart` | `boolean` | `false` | Play the tour once for readers who have not seen this version. Off by default; a library that ambushes people gets removed. |
| `autoStartWhen` | `string` | - | CSS selector that must exist before auto-start fires. Use it to wait for real content rather than a loading skeleton. |
| `autoStartTimeoutMs` | `number` | `8000` | Ceiling on that wait. If the gate never opens, the tour stays quiet. |
| `persist` | `boolean` | `true` | Whether the library reads/writes the "has seen" flag. `false` opts out entirely; see [Persistence](#persistence). |
| `storageKey` | `string` | `'react-spotlight-tour'` | Namespace for the flag. |
| `version` | `number` | `1` | Version of the walkthrough. Bumping re-plays it for everyone; see [Persistence](#persistence). |
| `resolveTimeoutMs` | `number` | `2500` | Grace period for a step's target to appear before the step is skipped. |
| `spotlightPadding` | `number` | `8` | Breathing room between the target's box and the ring, in px. |
| `currentRoute` | `string` | - | The route your app is on. Compared against `step.route`. |
| `onNavigate` | `(route: string) => void` | - | Called when a step lives on another route. See [Router recipes](#router-recipes). |
| `onStepChange` | `(step: TourStep, index: number) => void` | - | Fires on every step, including the first. Handy for analytics. |
| `onFinish` | `(reason: 'completed' \| 'dismissed') => void` | - | Fires once when the tour ends. |
| `labels` | `Partial<TourLabels>` | English | Overrides for every user-visible string. |
| `className` | `string` | - | Extra class on the overlay root, the hook for scoped theming. |
| `container` | `HTMLElement \| null` | `document.body` | Portal host. |
| `closeOnScrimClick` | `boolean` | `false` | End the tour when the dimmed background is clicked. |
| `showProgress` | `boolean` | `true` | Show the progress pips. |

### `TourStep`

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | **Required.** Stable identifier. Used as the React key and to seed the dialog's `aria-labelledby` / `aria-describedby`. |
| `target` | `string \| (() => Element \| null)` | **Required.** A CSS selector, or a function returning the element. The function form is re-invoked on every resolve attempt, so returning `null` just means "not ready yet". |
| `title` | `string` | **Required.** Callout heading, and the accessible name of the dialog. |
| `content` | `string \| ReactNode` | **Required.** Callout body. |
| `placement` | `'top' \| 'bottom' \| 'left' \| 'right'` | Preferred side. Defaults to `'bottom'`. Flips automatically when it would overflow. |
| `route` | `string` | Route this step lives on. Handed to `onNavigate`; never interpreted by this library. |
| `onEnter` | `(ctx: TourStepContext) => void` | Runs when the step becomes current, **before** its target is looked up, so it can open the drawer that contains it. |
| `onExit` | `(ctx: TourStepContext) => void` | Runs when the step stops being current, however it is left. |
| `spotlightPadding` | `number` | Per-step override of the ring padding. |

`TourStepContext` is `{ step, index, total, direction }`, where `direction` is
`1` forwards or `-1` backwards.

### `useTour()`

```tsx
import { useTour } from 'react-spotlight-tour';

function Progress() {
  const { isActive, stepIndex, stepCount, start, stop, next, back, goTo } = useTour();
  if (!isActive) return <button onClick={() => start()}>Replay the tour</button>;
  return <span>Step {stepIndex + 1} of {stepCount}</span>;
}
```

The action functions are module-level singletons, so they are referentially
stable forever: safe in dependency arrays and safe to pass to memoised
children without wrapping.

### Keyboard

| Key | Action |
| --- | --- |
| `→` / `Enter` | Next step (`Enter` is ignored while a button has focus, so it does not double-advance) |
| `←` | Previous step |
| `Tab` / `Shift+Tab` | Cycle the controls inside the callout; focus cannot escape to the page beneath |
| `Esc` | Leave the tour |

---

## Theming

Everything is a CSS custom property. Override them wherever you win the
cascade: `:root` for a global look, or a class passed via `className` for a
scoped variant.

```css
.midnight-tour {
  --rst-accent: #a78bfa;          /* ring, primary button, current pip */
  --rst-accent-fg: #17102b;       /* text on the primary button */
  --rst-scrim: rgb(9 6 20 / 82%); /* the page wash */
  --rst-callout-bg: #1b1630;
  --rst-callout-fg: #f4f1ff;
  --rst-callout-muted: #b6acd8;   /* body copy, step count, Skip */
  --rst-callout-border: rgb(167 139 250 / 35%);
  --rst-callout-shadow: 0 20px 50px rgb(5 2 15 / 65%);
  --rst-callout-radius: 16px;
  --rst-callout-width: 380px;
  --rst-radius: 12px;             /* the spotlight ring's corner radius */
  --rst-ring-thickness: 2px;
  --rst-scrim-spread: 200vmax;    /* how far the wash extends; see below */
  --rst-z-index: 1500;
  --rst-transition: 0.25s ease;
  --rst-font: inherit;
}
```

```tsx
<SpotlightTour steps={steps} className="midnight-tour" />
```

If your app already has design tokens, point the properties at them
(`--rst-accent: var(--brand-500)`) and the tour re-skins with the rest of the
UI for free.

**How the hole is made:** the spotlight is a single absolutely-positioned box
carrying an enormous `box-shadow` spread; everything outside the box gets the
wash, the box itself stays untouched. One element, so it animates cleanly
between targets, and it degrades to "everything dimmed" rather than to
"nothing dimmed" if the geometry is ever wrong.

The spread is `200vmax`, not the `9999px` this trick is usually written with.
That is a performance decision, not a stylistic one: a fixed 9999px asks the
compositor to rasterise a ~20000×20000px shadow every time the ring animates to
a new target, which is gigabytes of raster work on a large or high-DPI display.
`200vmax` scales with the viewport, still covers the whole screen twice over,
and costs roughly a twentieth of the area. Override `--rst-scrim-spread` only if
you have a reason to.

---

## Router recipes

The library never imports a router. A step declares a `route`; if it differs
from the `currentRoute` prop, the tour calls `onNavigate(route)` and waits for
`currentRoute` to change before it starts hunting for the target.

**Routing is entirely optional.** Omit `route`, `currentRoute` and `onNavigate`
and every step simply runs wherever the reader already is, which is the right
setup for a single-page dashboard or a settings dialog.

### react-router

```tsx
import { useLocation, useNavigate } from 'react-router-dom';
import { SpotlightTour } from 'react-spotlight-tour';

function AppTour({ steps }) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <SpotlightTour
      steps={steps}
      currentRoute={location.pathname}
      onNavigate={(route) => navigate(route)}
    />
  );
}
```

### Next.js (App Router)

```tsx
'use client';
import { usePathname, useRouter } from 'next/navigation';
import { SpotlightTour } from 'react-spotlight-tour';

export function AppTour({ steps }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <SpotlightTour
      steps={steps}
      currentRoute={pathname}
      onNavigate={(route) => router.push(route)}
    />
  );
}
```

Mount it inside your root layout. The component is client-only and renders
`null` on the server, so it is safe below a server component boundary.

### Next.js (Pages Router)

```tsx
import { useRouter } from 'next/router';

const router = useRouter();
<SpotlightTour steps={steps} currentRoute={router.pathname} onNavigate={router.push} />;
```

### Anything else

Any router works: the contract is only "tell me where I am, and I will tell you
where I want to go". Raise `resolveTimeoutMs` if your route transitions are slow
enough that a target might not exist within the default 2.5 seconds.

---

## Persistence

By default the tour records a versioned flag in `localStorage` once it ends,
whether the reader finished or dismissed it:

```
react-spotlight-tour:seen:v1
```

Storage access is wrapped in try/catch throughout, because private windows,
embedded webviews and cross-origin iframes can throw on `localStorage`. "We
could not read the flag" degrades to "show the tour", never to a crash.

**Dismissing counts as seen.** Someone who pressed Skip does not want the tour
back on the next page load, and replay is always one button away.

### When to bump `version`

Bumping changes the key, which makes the tour auto-play once more for
*everyone*, including people who deliberately dismissed it. That is a real
interruption, so spend it only when the tour genuinely teaches something new:

- a page or major feature was added, removed or moved;
- navigation was restructured, so the old walkthrough describes a UI that no
  longer exists;
- the steps were rewritten rather than edited.

Do **not** bump for a typo fix, a reworded sentence or a placement tweak. A tour
that reappears after every deploy is a tour users train themselves to dismiss
without reading, which is worse than no tour at all.

### Opting out

Set `persist={false}` and the library neither reads nor writes storage. Use this
when the flag belongs on the user's server-side profile rather than in one
browser:

```tsx
<SpotlightTour
  steps={steps}
  persist={false}
  autoStart={!user.hasSeenOnboarding}
  onFinish={() => api.markOnboardingSeen()}
/>
```

Helpers are exported for building your own controls:

```tsx
import { makeSeenKey, hasSeenTour, markTourSeen, clearTourSeen } from 'react-spotlight-tour';

const key = makeSeenKey('react-spotlight-tour', 1);
clearTourSeen(key); // "reset onboarding" button
```

---

## Accessibility notes

Accessibility is the headline feature, not a checklist item at the end.

- **The callout is the dialog**, not the whole overlay: `role="dialog"`,
  `aria-modal="true"`, `aria-labelledby` pointing at the step title and
  `aria-describedby` at its body. The accessible name is therefore always the
  thing the reader is being told about.
- **Focus moves into the callout** on every step and is **trapped** there:
  Tab and Shift+Tab cycle the controls, and focus that has escaped (a stray
  click on the page beneath) is pulled back on the next Tab.
- **Focus is restored** to whatever was focused before the tour started, so a
  keyboard user is put back exactly where they were.
- **Step changes are announced** through a dedicated visually-hidden
  `role="status"` / `aria-live="polite"` region ("Step 2 of 5: …"). It is a
  separate node from the dialog on purpose: putting `aria-live` on the dialog
  itself makes some screen readers read the whole card twice.
- **`prefers-reduced-motion` is honoured** in both directions: the CSS drops the
  spotlight and callout transitions, and the scroll-into-view call switches from
  `smooth` to `auto`. A ring gliding across the whole viewport is precisely the
  motion that setting exists to stop.
- **Forced-colors mode** gets explicit `Canvas` / `CanvasText` / `Highlight`
  styling, so the card does not become floating text over the page.
- **There is always a way out.** Escape, the Skip control, and optionally a
  scrim click all end the tour, and the callout renders even when no target
  resolves. Trapping someone inside an onboarding overlay is the one
  unforgivable bug in this category of component.
- **The progress pips are `aria-hidden`**: the step count text beside them
  already carries the same information in words.

### Text and copy

All user-visible strings are overridable via `labels`, with `{current}`,
`{total}` and `{title}` placeholders:

```tsx
<SpotlightTour
  steps={steps}
  labels={{
    next: 'Suivant',
    back: 'Retour',
    finish: 'Terminer',
    skip: 'Passer',
    stepCount: 'Étape {current} sur {total}',
    announcement: 'Étape {current} sur {total} : {title}',
  }}
/>
```

---

## Robustness

The behaviours that stop a tour becoming a support ticket:

- **Missing target → skip, never stall.** Each step gets `resolveTimeoutMs` to
  appear; if it does not, the tour continues in the reader's direction of
  travel. Walking off the end finishes; walking off the start is ignored.
- **Reposition on resize and scroll**, with the scroll listener in the capture
  phase: page content usually scrolls inside an inner container, and those
  events never bubble to `window`.
- **Targets that vanish mid-step** (a re-render, a data reload) drop the ring
  rather than leaving it stranded over empty page.
- **The callout flips** to the opposite side, then the other axis, to stay in
  the viewport; if nothing fits it is pulled fully into view rather than left
  hanging off an edge. Below 576px it docks to the bottom of the screen.
- **Invalid selectors and throwing target functions** are treated as "not
  found", so one bad step cannot brick the whole tour.
- **The overlay is portalled to `document.body`**, so an ancestor `transform`,
  `filter` or `contain` cannot silently break its `position: fixed`.

---

## Development

```bash
npm install
npm run dev          # demo site with hot reload against src/
npm test             # vitest
npm run typecheck    # tsc --noEmit, strict
npm run build        # library → dist/ (ESM + CJS + .d.ts + CSS)
npm run build:demo   # demo site → dist-demo/
```

The demo is published to GitHub Pages by `.github/workflows/deploy-pages.yml` on
every push to `main`, gated behind the typecheck and test suite.

## License

MIT © 2026 Ryan Gross
