// Single import point for every icon in the UI.
//
// Library: Solar Icons (by Appwrite) — MIT, https://solariconset.com
// Only the Bold style is used on purpose. The interface is typographic,
// high-contrast and mostly built from 8–11px micro labels, and solid shapes
// stay legible at that size where 1.5px outline strokes turn to mush.
//
// Subpath imports keep the bundle small: only the referenced icon is bundled.
// Add new icons here rather than importing from `@solar-icons/react` inside a
// page, so the style stays consistent across the app.
//
// Note: the exported name is derived from the file name, so
// `bold/filter` exports `FilterIcon`, not `FunnelIcon`. Keep the two in sync.

export { LoaderIcon } from '@solar-icons/react/bold/loader';
export { DangerCircleIcon } from '@solar-icons/react/bold/danger-circle';
export { ArrowRightUpIcon } from '@solar-icons/react/bold/arrow-right-up';
export { ArrowDownIcon } from '@solar-icons/react/bold/arrow-down';
export { ArrowRightIcon } from '@solar-icons/react/bold/arrow-right';
export { ArrowLeftIcon } from '@solar-icons/react/bold/arrow-left';
export { CircleDotIcon } from '@solar-icons/react/bold/circle-dot';
export { CloseIcon } from '@solar-icons/react/bold/close';
export { FilterIcon } from '@solar-icons/react/bold/filter';
export { MagnifierIcon } from '@solar-icons/react/bold/magnifier';
export { HistoryIcon } from '@solar-icons/react/bold/history';
export { HomeIcon } from '@solar-icons/react/bold/home';
export { ListIcon } from '@solar-icons/react/bold/list';
export { LogoutIcon } from '@solar-icons/react/bold/logout';
export { SettingsIcon } from '@solar-icons/react/bold/settings';
export { EyeIcon } from '@solar-icons/react/bold/eye';
export { EyeClosedIcon } from '@solar-icons/react/bold/eye-closed';
export { CheckIcon } from '@solar-icons/react/bold/check';
export { CloseCircleIcon } from '@solar-icons/react/bold/close-circle';
export { TrashBin2Icon } from '@solar-icons/react/bold/trash-bin-2';
export { UserIcon } from '@solar-icons/react/bold/user';
export { PaletteIcon } from '@solar-icons/react/bold/palette';
export { ChatRoundMoneyIcon } from '@solar-icons/react/bold/chat-round-money';
export { KeyIcon } from '@solar-icons/react/bold/key';
export { WidgetIcon } from '@solar-icons/react/bold/widget';

// Inline SVG replacements for icons not available in the package.
// These follow the same 24x24 viewBox and stroke-based style.

// Google's brand mark, kept as an exception to the "solid Bold" rule above: a
// monochrome "G" next to the words "Lanjutkan dengan Google" reads as a broken
// button, and recolouring the four brand quadrants is what makes it read as
// Google at all.
export function GoogleIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

export function TrashBinIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function ImageIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

export function ChatCircleIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export function UserIdIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  );
}

export function SparklingIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z" />
    </svg>
  );
}
