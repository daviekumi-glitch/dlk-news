import { createClient } from "@base44/sdk";

/**
 * Single Base44 SDK client for the whole browser app.
 *
 * - Auth is token based (JWT persisted in localStorage by the SDK).
 * - `requiresAuth: false` because this app renders its own login/register UI.
 * - Configure via NEXT_PUBLIC_BASE44_APP_ID (+ optional server URL overrides).
 */
// The app id and functions origin are public identifiers (they ship in every
// client bundle; access is enforced server-side by auth + row-level security),
// so they are committed as defaults. That keeps CI and Android builds working
// with zero configuration. Override via env to point at another deployment.
export const APP_ID = process.env.NEXT_PUBLIC_BASE44_APP_ID || "6a8ae8bb9c3ebd41087bb2e2";
export const SERVER_URL = process.env.NEXT_PUBLIC_BASE44_SERVER_URL || "https://base44.app";
/** Origin that serves backend functions, e.g. https://my-app.base44.app */
export const FUNCTIONS_ORIGIN = (
  process.env.NEXT_PUBLIC_BASE44_APP_URL || "https://solene-087bb2e2.base44.app"
).replace(/\/$/, "");

export const isConfigured = Boolean(APP_ID);

export const base44 = createClient({
  appId: APP_ID || "unconfigured",
  serverUrl: SERVER_URL,
  requiresAuth: false,
});
