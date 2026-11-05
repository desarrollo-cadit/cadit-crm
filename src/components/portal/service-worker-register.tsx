"use client";

import { useEffect } from "react";

/**
 * Registers `/sw.js` for the portal only (phase 1 of the PWA plan).
 * Production only: a service worker in `next dev` fights hot reload.
 * Failures are swallowed on purpose — the portal works the same without it.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);

  return null;
}
