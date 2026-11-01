// Small line icons for the mic, camera and screen-share buttons. Fixed strings (never built from user text), drawn in the button's color; the
// slash shows only on a button with the `off` class.
const ATTRS = 'viewBox="0 0 24 24" aria-hidden="true" focusable="false"';

const ICONS = {
  mic: `<svg ${ATTRS}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/><line class="slash" x1="4" y1="4" x2="20" y2="20"/></svg>`,
  cam: `<svg ${ATTRS}><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/><line class="slash" x1="4" y1="4" x2="20" y2="20"/></svg>`,
  screen: `<svg ${ATTRS}><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>`,
  screenOff: `<svg ${ATTRS}><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><line class="slash" x1="4" y1="4" x2="20" y2="20"/></svg>`,
  speaker: `<svg ${ATTRS}><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>`,
  speakerOff: `<svg ${ATTRS}><path d="M4 9v6h4l5 4V5L8 9z"/><line class="slash" x1="4" y1="4" x2="20" y2="20"/></svg>`,
  pen: `<svg ${ATTRS}><path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/></svg>`,
  pin: `<svg ${ATTRS}><path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/></svg>`,
  clear: `<svg ${ATTRS}><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>`,
  build: `<svg ${ATTRS}><path d="M14 6l4 4M4 20l9-9M13 4l7 7-3 3-7-7z"/></svg>`,
} as const;

export type IconName = keyof typeof ICONS;

/** The icon's markup, to be set as a button's `innerHTML`. */
export const icon = (name: IconName): string => ICONS[name];
