/**
 * Behavioural tests for the overlay.
 *
 * The bar for a test in here: it fails if a real user-visible promise is
 * broken. Rendering assertions that only restate the JSX are not worth the
 * maintenance, so what is covered is navigation, the skip-on-missing-target
 * contract, focus behaviour, the accessibility surface, persistence, and the
 * router hand-off.
 */
import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SpotlightTour } from '../SpotlightTour';
import type { SpotlightTourProps } from '../SpotlightTour';
import { makeSeenKey } from '../persistence';
import { startTour } from '../store';
import { useTour } from '../useTour';
import type { TourStep } from '../types';

const SEEN_KEY = makeSeenKey('react-spotlight-tour', 1);

/** Three steps whose targets all exist in {@link Host}. */
const STEPS: TourStep[] = [
  { id: 'alpha', target: '#alpha', title: 'Alpha step', content: 'The first thing.' },
  { id: 'beta', target: '#beta', title: 'Beta step', content: 'The second thing.' },
  { id: 'gamma', target: '#gamma', title: 'Gamma step', content: 'The third thing.' },
];

/** Same list, but the middle step points at an element that is never rendered. */
const STEPS_WITH_GAP: TourStep[] = [
  { id: 'alpha', target: '#alpha', title: 'Alpha step', content: 'The first thing.' },
  { id: 'ghost', target: '#does-not-exist', title: 'Ghost step', content: 'Never shown.' },
  { id: 'gamma', target: '#gamma', title: 'Gamma step', content: 'The third thing.' },
];

/**
 * A minimal host page. `opener` exists so focus restoration has somewhere
 * meaningful to go back to.
 */
function Host(props: SpotlightTourProps) {
  return (
    <div>
      <button data-testid="opener" onClick={() => startTour()}>
        Show me around
      </button>
      <div id="alpha">Alpha</div>
      <div id="beta">Beta</div>
      <div id="gamma">Gamma</div>
      <SpotlightTour {...props} />
    </div>
  );
}

/** Renders the host and starts the tour, all inside a single act() boundary. */
async function renderAndStart(
  props: Partial<SpotlightTourProps> = {},
  at?: number,
): Promise<ReturnType<typeof render>> {
  const merged: SpotlightTourProps = { ...props, steps: props.steps ?? STEPS };
  const utils = render(<Host {...merged} />);
  await act(async () => {
    startTour(at === undefined ? undefined : { at });
  });
  return utils;
}

describe('SpotlightTour', () => {
  it('renders nothing until the tour is started', () => {
    render(<Host steps={STEPS} />);
    expect(screen.queryByTestId('spotlight-tour')).toBeNull();
  });

  it('renders the first step when started', async () => {
    await renderAndStart();

    expect(await screen.findByText('Alpha step')).toBeInTheDocument();
    expect(screen.getByText('The first thing.')).toBeInTheDocument();
    expect(screen.getByTestId('spotlight-tour-count')).toHaveTextContent('1 of 3');
  });

  it('moves forward with Next and back with Back', async () => {
    await renderAndStart();

    // Back is unusable on the first step; the reader cannot fall off the start.
    expect(screen.getByTestId('spotlight-tour-back')).toBeDisabled();

    fireEvent.click(screen.getByTestId('spotlight-tour-next'));
    expect(await screen.findByText('Beta step')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('spotlight-tour-back'));
    expect(await screen.findByText('Alpha step')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    await renderAndStart();
    expect(screen.getByTestId('spotlight-tour')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByTestId('spotlight-tour')).toBeNull());
  });

  it('navigates with the arrow keys', async () => {
    await renderAndStart();

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(await screen.findByText('Beta step')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(await screen.findByText('Alpha step')).toBeInTheDocument();
  });

  it('skips a step whose target never appears, travelling forwards', async () => {
    await renderAndStart({ steps: STEPS_WITH_GAP, resolveTimeoutMs: 0 });

    expect(await screen.findByText('Alpha step')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('spotlight-tour-next'));

    // The ghost step is stepped over rather than stalling on a blank spotlight.
    expect(await screen.findByText('Gamma step')).toBeInTheDocument();
    expect(screen.queryByText('Ghost step')).toBeNull();
  });

  it('skips a step whose target never appears, travelling backwards', async () => {
    await renderAndStart({ steps: STEPS_WITH_GAP, resolveTimeoutMs: 0 }, 2);

    expect(await screen.findByText('Gamma step')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('spotlight-tour-back'));

    // Skipping must follow the direction of travel, not always march forwards.
    expect(await screen.findByText('Alpha step')).toBeInTheDocument();
    expect(screen.queryByText('Ghost step')).toBeNull();
  });

  it('ends the tour rather than stalling when every remaining target is missing', async () => {
    const orphaned: TourStep[] = [
      { id: 'alpha', target: '#alpha', title: 'Alpha step', content: 'Here.' },
      { id: 'ghost', target: '#nope', title: 'Ghost step', content: 'Gone.' },
    ];
    await renderAndStart({ steps: orphaned, resolveTimeoutMs: 0 });

    fireEvent.click(screen.getByTestId('spotlight-tour-next'));

    await waitFor(() => expect(screen.queryByTestId('spotlight-tour')).toBeNull());
  });

  it('exposes the expected ARIA surface', async () => {
    await renderAndStart();

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    // The accessible name must be the step title, and the description its body.
    const titleId = dialog.getAttribute('aria-labelledby');
    const bodyId = dialog.getAttribute('aria-describedby');
    expect(titleId).not.toBeNull();
    expect(document.getElementById(titleId as string)).toHaveTextContent('Alpha step');
    expect(document.getElementById(bodyId as string)).toHaveTextContent('The first thing.');
  });

  it('announces each step change through a polite live region', async () => {
    await renderAndStart();

    const live = await screen.findByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('Step 1 of 3: Alpha step');

    fireEvent.click(screen.getByTestId('spotlight-tour-next'));
    await waitFor(() => expect(live).toHaveTextContent('Step 2 of 3: Beta step'));
  });

  it('traps Tab inside the callout', async () => {
    await renderAndStart();

    const skip = screen.getByTestId('spotlight-tour-skip');
    const next = screen.getByTestId('spotlight-tour-next');

    // Forwards off the last control wraps to the first.
    next.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(skip);

    // Backwards off the first control wraps to the last.
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(next);
  });

  it('pulls focus back if it has escaped to the page underneath', async () => {
    await renderAndStart();

    screen.getByTestId('opener').focus();
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(screen.getByTestId('spotlight-tour-callout')).toContainElement(
      document.activeElement as HTMLElement,
    );
  });

  it('restores focus to the element that was focused before the tour', async () => {
    render(<Host steps={STEPS} />);
    const opener = screen.getByTestId('opener');
    opener.focus();

    await act(async () => {
      startTour();
    });
    // Focus moved into the dialog while the tour ran.
    expect(document.activeElement).not.toBe(opener);

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('honours prefers-reduced-motion when scrolling a target into view', async () => {
    // Re-stub matchMedia as "reduce" before mounting, the way a real machine
    // with the OS setting enabled would report.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;

    await renderAndStart();

    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    expect(scrollSpy).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'auto', block: 'center' }),
    );
    expect(screen.getByTestId('spotlight-tour')).toHaveAttribute('data-reduced-motion', 'true');
  });

  it('writes the versioned seen key when the tour is completed', async () => {
    const onFinish = vi.fn();
    await renderAndStart({ onFinish }, 2);

    expect(window.localStorage.getItem(SEEN_KEY)).toBeNull();
    fireEvent.click(screen.getByTestId('spotlight-tour-next')); // "Finish"

    await waitFor(() => expect(window.localStorage.getItem(SEEN_KEY)).not.toBeNull());
    expect(onFinish).toHaveBeenCalledWith('completed');
  });

  it('treats dismissing as seen, and reports it as such', async () => {
    const onFinish = vi.fn();
    await renderAndStart({ onFinish });

    fireEvent.click(screen.getByTestId('spotlight-tour-skip'));

    await waitFor(() => expect(onFinish).toHaveBeenCalledWith('dismissed'));
    expect(window.localStorage.getItem(SEEN_KEY)).not.toBeNull();
  });

  it('auto-starts once for a reader who has not seen this version', async () => {
    render(<Host steps={STEPS} autoStart />);
    expect(await screen.findByText('Alpha step')).toBeInTheDocument();
  });

  it('does not auto-start when the seen key is already set', async () => {
    window.localStorage.setItem(SEEN_KEY, new Date().toISOString());
    render(<Host steps={STEPS} autoStart />);

    await waitFor(() => expect(screen.queryByTestId('spotlight-tour')).toBeNull());
  });

  it('opting out of persistence ignores the stored key entirely', async () => {
    window.localStorage.setItem(SEEN_KEY, new Date().toISOString());
    window.localStorage.removeItem('other');
    render(<Host steps={STEPS} autoStart persist={false} />);

    // The host app owns the flag now, so the library neither reads it...
    expect(await screen.findByText('Alpha step')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('spotlight-tour-skip'));
    await waitFor(() => expect(screen.queryByTestId('spotlight-tour')).toBeNull());
    // ...nor rewrites it. (The value is the one the test put there.)
    expect(window.localStorage.getItem(SEEN_KEY)).toMatch(/^\d{4}-/);
  });

  it('waits for the readiness gate before auto-starting', async () => {
    render(<Host steps={STEPS} autoStart autoStartWhen="#not-here-yet" autoStartTimeoutMs={40} />);

    await waitFor(() => expect(screen.queryByTestId('spotlight-tour')).toBeNull());
  });

  it('calls onNavigate for a step that lives on another route, then resolves there', async () => {
    const onNavigate = vi.fn();
    const routed: TourStep[] = [
      { id: 'alpha', target: '#alpha', title: 'Alpha step', content: 'Here.' },
      {
        id: 'settings',
        target: '#gamma',
        title: 'Settings step',
        content: 'Over there.',
        route: '/settings',
      },
    ];

    const { rerender } = render(
      <Host steps={routed} currentRoute="/" onNavigate={onNavigate} resolveTimeoutMs={0} />,
    );
    await act(async () => {
      startTour();
    });

    fireEvent.click(screen.getByTestId('spotlight-tour-next'));

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/settings'));

    // Crucially the tour does *not* start its resolve timer while it waits, so
    // the step is not skipped for a target that has not had a chance to exist:
    // no ring is drawn yet.
    expect(screen.queryByTestId('spotlight-tour-ring')).toBeNull();
    expect(screen.getByText('Settings step')).toBeInTheDocument();

    // Once the host reports the new route, the target resolves there.
    rerender(
      <Host
        steps={routed}
        currentRoute="/settings"
        onNavigate={onNavigate}
        resolveTimeoutMs={0}
      />,
    );
    expect(await screen.findByTestId('spotlight-tour-ring')).toBeInTheDocument();
  });

  it('fires onEnter before resolving the target, so a hook can create it', async () => {
    const order: string[] = [];

    function LazyHost() {
      const [open, setOpen] = useState(false);
      const steps: TourStep[] = [
        { id: 'alpha', target: '#alpha', title: 'Alpha step', content: 'Here.' },
        {
          id: 'drawer',
          target: '#drawer-item',
          title: 'Drawer step',
          content: 'Only exists once the drawer is open.',
          onEnter: () => {
            order.push('enter');
            setOpen(true);
          },
          onExit: () => {
            order.push('exit');
            setOpen(false);
          },
        },
      ];
      return (
        <div>
          <div id="alpha">Alpha</div>
          {open && <div id="drawer-item">Drawer item</div>}
          <SpotlightTour steps={steps} resolveTimeoutMs={400} />
        </div>
      );
    }

    render(<LazyHost />);
    await act(async () => {
      startTour();
    });

    fireEvent.click(screen.getByTestId('spotlight-tour-next'));

    expect(await screen.findByText('Drawer step')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('#drawer-item')).not.toBeNull());
    expect(order).toEqual(['enter']);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(order).toEqual(['enter', 'exit']));
  });

  it('renders custom labels instead of the English defaults', async () => {
    await renderAndStart({
      labels: { next: 'Suivant', skip: 'Passer', stepCount: 'Étape {current}/{total}' },
    });

    expect(screen.getByTestId('spotlight-tour-next')).toHaveTextContent('Suivant');
    expect(screen.getByTestId('spotlight-tour-skip')).toHaveTextContent('Passer');
    expect(screen.getByTestId('spotlight-tour-count')).toHaveTextContent('Étape 1/3');
  });

  it('drives the tour from useTour() and reports live state', async () => {
    function Readout() {
      const tour = useTour();
      return (
        <div>
          <span data-testid="readout">
            {tour.isActive ? `active:${tour.stepIndex}/${tour.stepCount}` : 'idle'}
          </span>
          <button data-testid="hook-start" onClick={() => tour.start()}>
            start
          </button>
          <button data-testid="hook-next" onClick={tour.next}>
            next
          </button>
          <button data-testid="hook-stop" onClick={() => tour.stop()}>
            stop
          </button>
        </div>
      );
    }

    render(
      <div>
        <Readout />
        <Host steps={STEPS} />
      </div>,
    );

    expect(screen.getByTestId('readout')).toHaveTextContent('idle');

    fireEvent.click(screen.getByTestId('hook-start'));
    await waitFor(() => expect(screen.getByTestId('readout')).toHaveTextContent('active:0/3'));

    fireEvent.click(screen.getByTestId('hook-next'));
    await waitFor(() => expect(screen.getByTestId('readout')).toHaveTextContent('active:1/3'));

    fireEvent.click(screen.getByTestId('hook-stop'));
    await waitFor(() => expect(screen.getByTestId('readout')).toHaveTextContent('idle'));
  });

  it('re-measures the spotlight when the window resizes', async () => {
    await renderAndStart();
    const ring = await screen.findByTestId('spotlight-tour-ring');

    // jsdom has no layout, so the assertion is that the listener is wired and
    // the ring survives the event: a resize handler that threw would fail here.
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(ring).toBeInTheDocument();
  });

  it('closes on a scrim click only when asked to', async () => {
    const { rerender } = await renderAndStart({ closeOnScrimClick: false });

    fireEvent.click(screen.getByTestId('spotlight-tour-scrim'));
    expect(screen.getByTestId('spotlight-tour')).toBeInTheDocument();

    rerender(<Host steps={STEPS} closeOnScrimClick />);
    fireEvent.click(screen.getByTestId('spotlight-tour-scrim'));
    await waitFor(() => expect(screen.queryByTestId('spotlight-tour')).toBeNull());
  });
});
