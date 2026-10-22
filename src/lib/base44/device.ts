/**
 * Guest-mode device identity.
 *
 * There are no accounts: on first visit the browser generates a random device
 * id, keeps it in localStorage and sends it with every backend call as the
 * X-Device-Id header. The server scopes all conversations to this id, so a
 * device's chats stay private to it (clearing site data starts fresh).
 */

const KEY = "am_device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = window.localStorage.getItem(KEY);
    // Same shape the backend validates: 8-64 chars of [A-Za-z0-9_-].
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `d${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Private mode / storage blocked: fall back to a per-session id.
    return `sess${Math.random().toString(36).slice(2, 12)}`;
  }
}
