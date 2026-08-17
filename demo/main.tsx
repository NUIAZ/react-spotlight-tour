/**
 * Demo entry point.
 *
 * StrictMode is on deliberately: it double-invokes effects in development,
 * which is exactly the pressure a tour overlay full of subscriptions, timers
 * and focus management needs to be under. If the demo behaves here, the library
 * behaves in a real app.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import 'react-spotlight-tour/styles.css';
import './demo.css';

const container = document.getElementById('root');
if (container === null) throw new Error('Demo mount point #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
