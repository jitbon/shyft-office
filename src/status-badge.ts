import type { PlayerStatus } from '../shared/protocol';
import { statusIcon, statusLabel, timeLeftText } from '../shared/status';
import { statusColor } from './types';

/** The status icon in a colored ring, with the label, note and time left as its tooltip. Used wherever a person is named. */
export function statusBadge(status: PlayerStatus): HTMLElement {
  const el = document.createElement('i');
  el.className = 'status-badge';
  const icon = statusIcon(status);
  el.style.setProperty('--status', statusColor(status));
  el.textContent = icon;
  if (!icon) el.classList.add('plain');
  el.title = [statusLabel(status), status.text, timeLeftText(status, Date.now())].filter(Boolean).join(' · ');
  return el;
}
