// Small line icons for the mic and camera buttons. Fixed strings (never built from user text), drawn in the button's color; the
// slash shows only on a button with the `off` class.
const ATTRS = 'viewBox="0 0 24 24" aria-hidden="true" focusable="false"';

const ICONS = {
  mic: `<svg ${ATTRS}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/><line class="slash" x1="4" y1="4" x2="20" y2="20"/></svg>`,
  cam: `<svg ${ATTRS}><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/><line class="slash" x1="4" y1="4" x2="20" y2="20"/></svg>`,
  build: `<svg ${ATTRS}><path d="M14 6l4 4M4 20l9-9M13 4l7 7-3 3-7-7z"/></svg>`,
} as const;

export type IconName = keyof typeof ICONS;

/** The icon's markup, to be set as a button's `innerHTML`. */
export const icon = (name: IconName): string => ICONS[name];
