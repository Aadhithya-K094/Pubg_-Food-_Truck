import React from "react";

/**
 * Professional line icons (inline SVG, inherit currentColor).
 * Replaces emoji across the app for a cleaner, consistent look.
 */
const base = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function IconHome(p) {
  return (
    <svg {...base} {...p}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
  );
}

export function IconScooter(p) {
  return (
    <svg {...base} {...p}>
      <circle cx="5" cy="18" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M7.5 18h8" />
      <path d="M18 15.5V9h-3l-2 4H8.5L6 9" />
      <path d="M14 6h2.5L18 9" />
    </svg>
  );
}

export function IconDining(p) {
  return (
    <svg {...base} {...p}>
      <path d="M6 3v7a2 2 0 0 0 2 2v9" />
      <path d="M6 3v5M9 3v5" />
      <path d="M17 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4v9" />
    </svg>
  );
}

export function IconBag(p) {
  return (
    <svg {...base} {...p}>
      <path d="M6 8h12l-1 12H7z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
    </svg>
  );
}

export function IconUser(p) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function IconReceipt(p) {
  return (
    <svg {...base} {...p}>
      <path d="M6 3h12v18l-2-1.2L14 21l-2-1.2L10 21l-2-1.2L6 21z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

export function IconPhone(p) {
  return (
    <svg {...base} {...p}>
      <path d="M6 3h3l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z" />
    </svg>
  );
}

export function IconChat(p) {
  return (
    <svg {...base} {...p}>
      <path d="M4 5h16v11H8l-4 3z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}

export function IconGear(p) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </svg>
  );
}

export function IconPin(p) {
  return (
    <svg {...base} {...p}>
      <path d="M12 22s7-6.4 7-12A7 7 0 0 0 5 10c0 5.6 7 12 7 12z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function IconChair(p) {
  return (
    <svg {...base} {...p}>
      <path d="M6 4v7h12V4" />
      <path d="M5 11h14l-1 5H6z" />
      <path d="M7 16v4M17 16v4" />
    </svg>
  );
}

export function IconFork(p) {
  return (
    <svg {...base} {...p}>
      <path d="M8 3v7a2 2 0 0 0 2 2v9" />
      <path d="M8 3v5M11 3v5" />
      <path d="M15 3c-1.2 0-2 1.8-2 4.5S14 12 15 12v9" />
    </svg>
  );
}
