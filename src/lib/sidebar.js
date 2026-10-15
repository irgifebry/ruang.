/**
 * Desktop sidebar collapse state, and the DOM writes that apply it.
 *
 * Deliberately has no `'use client'` and no React, for the same reason
 * `theme-presets.js` has none: `layout.jsx` imports
 * `PRE_HYDRATION_SIDEBAR_SCRIPT` to build the inline pre-paint script, and a
 * client component cannot be rendered from a server component's inline script.
 *
 * The state is one attribute on `<html>` rather than a `useState` somewhere in
 * the tree. Everything the collapse touches — the rail's width, the page gutter
 * in `AppShell`, the labels, the chevron — is CSS reading `data-sidebar`, so
 * there is nothing to thread down and nothing to keep in sync. It also means the
 * server render and the first client render still agree: the attribute is
 * already set by the time React looks at the document, so hydration has nothing
 * to reconcile and no flash of a full-width rail on a collapsed session.
 *
 * Like the theme, this is a per-browser preference cached in `localStorage`.
 */

/** Where the preference is cached. `1` means collapsed; anything else is open. */
export const SIDEBAR_KEY = 'ruang-sidebar';

/**
 * The two rail widths, in px. Documentation only — CSS owns the real numbers
 * (`--sidebar-w` in `globals.css`), and this module never writes a width.
 */
export const SIDEBAR_EXPANDED = 238;
export const SIDEBAR_COLLAPSED = 68;

/** Whether the given element is currently collapsed. */
export function isCollapsed(element) {
  return element?.dataset?.sidebar === 'collapsed';
}

/** Writes the state to the document element. */
export function applySidebar(element, collapsed) {
  element.dataset.sidebar = collapsed ? 'collapsed' : 'expanded';
}

/**
 * Reads the cached preference.
 *
 * Private browsing makes `getItem` throw outright rather than returning null,
 * so every read is guarded.
 */
export function readStoredSidebar() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

/** Caches the preference. Failure here only costs persistence, not the toggle. */
export function storeSidebar(collapsed) {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  } catch {
    // Ignored: the rail still collapses for this page view.
  }
}

/**
 * Whether a click inside the rail should toggle it.
 *
 * Two conditions, and the first is the reason this is not simply "click the
 * rail": only a *collapsed* rail is the hit area. An open rail is collapsed by
 * the toggle button alone, because clicking the empty space beside a full-size
 * sidebar is a gesture aimed at nothing in particular, and answering it by
 * shrinking the navigation out from under the user is a worse guess than
 * ignoring it. A collapsed rail is the opposite case — it is a strip of icons
 * with no room to read, so the background is the obvious "put my sidebar back"
 * target, and the cursor says so before the click.
 *
 * The second condition is that the click landed on the rail's own surface. The
 * nav links and the brand have their own destinations, the toggle button is
 * already this action, and the account popover extends past the rail over the
 * page, where a stray click on its padding would otherwise close the sidebar
 * instead of doing nothing.
 *
 * `closest` covers descendants, and an SVG child of a link reports its link as
 * an ancestor, which a naive `target.tagName` check would miss.
 *
 * Takes the event target rather than the event so the rule can be read on its
 * own; anything that is not an element — a text node in some engines — is
 * treated as the rail itself.
 */
export function isRailToggleClick(target) {
  // The state is read off the document rather than passed in, because the same
  // document attribute is what the cursor and the width are reading. One source,
  // so the affordance and the click cannot disagree.
  if (!isCollapsed(document.documentElement)) return false;
  if (!target || typeof target.closest !== 'function') return true;
  return !target.closest('a, button, .account-menu');
}

/**
 * Flips the rail and returns the state it landed on.
 *
 * Takes no arguments on purpose: React passes the click event to an `onClick`
 * handler, and an element parameter would silently receive it.
 */
export function toggleSidebar() {
  const collapsed = !isCollapsed(document.documentElement);
  applySidebar(document.documentElement, collapsed);
  storeSidebar(collapsed);
  return collapsed;
}

/**
 * The pre-paint collapse script.
 *
 * The choice lives in localStorage, so neither the server render nor the first
 * client render knows it — the page would paint a full-width rail and then jump
 * to the narrow one once React took over. `layout.jsx` inlines this in `<head>`
 * so it runs before anything is painted, setting the one attribute the whole
 * collapse is derived from.
 *
 * `applySidebar` is a module function and cannot be serialised into an inline
 * script, so its line is reproduced here deliberately: this is the pre-paint
 * approximation, and `applySidebar` is what runs for real on every later toggle.
 */
export const PRE_HYDRATION_SIDEBAR_SCRIPT = `(function(){try{
document.documentElement.dataset.sidebar=localStorage.getItem(${JSON.stringify(SIDEBAR_KEY)})==='1'?'collapsed':'expanded';
}catch(e){}})();`;