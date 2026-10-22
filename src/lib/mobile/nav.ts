"use client";

import { Capacitor } from "@capacitor/core";

/**
 * Open a URL outside the app.
 *
 * Inside the native shell a plain `window.open` would try to load the link in
 * the same WebView, replacing the app. Capacitor intercepts the `_system`
 * target and hands the URL to the OS instead, which is what we want in both
 * cases: on the web a new tab, on native the system browser.
 */
export function openExternal(url: string) {
  if (typeof window === "undefined") return;

  if (Capacitor.isNativePlatform()) {
    window.open(url, "_system");
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}
