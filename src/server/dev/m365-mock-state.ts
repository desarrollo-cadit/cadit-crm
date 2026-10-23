/**
 * 029 (DV-010) — Estado en memoria del m365-mock (solo dev/test). Mismo patrón
 * que `wa-mock-state.ts`: vive en `globalThis` porque Next recarga módulos en
 * dev, y una instancia es un proceso, así que alcanza para las aserciones del
 * self-test.
 */

export type M365OutboxEntry = {
  /** El buzón emisor (`{sender}` de la ruta de Graph). */
  from: string;
  /** El `message` tal cual lo mandó el adaptador. */
  message: unknown;
  saveToSentItems: boolean | null;
  receivedAt: string;
};

type M365MockState = {
  outbox: M365OutboxEntry[];
  failing: boolean;
  /** 045 — Cuántos `sendMail` más responden 429 con `Retry-After: 1`. */
  throttle: number;
  /** 045 — Mientras esté encendido, `sendMail` responde 403 `ErrorAccessDenied`. */
  deny: boolean;
};

const VACIO = (): M365MockState => ({ outbox: [], failing: false, throttle: 0, deny: false });

const globalForMock = globalThis as unknown as { __m365MockState?: M365MockState };

function state(): M365MockState {
  if (!globalForMock.__m365MockState) {
    globalForMock.__m365MockState = VACIO();
  }
  return globalForMock.__m365MockState;
}

export function pushMail(entry: Omit<M365OutboxEntry, "receivedAt">): void {
  state().outbox.push({ ...entry, receivedAt: new Date().toISOString() });
}

export function readOutbox(): M365OutboxEntry[] {
  return state().outbox;
}

/** Limpia el outbox y apaga los modos falla, límite y sin permiso: cada corrida arranca del camino feliz. */
export function clearOutbox(): void {
  globalForMock.__m365MockState = VACIO();
}

export function setFail(fail: boolean): void {
  state().failing = fail;
}

export function isFailing(): boolean {
  return state().failing;
}

/** 045 — Los próximos `n` envíos responden 429. */
export function setThrottle(n: number): void {
  state().throttle = Math.max(0, Math.floor(n));
}

/** Consume un 429 si quedan: `true` = este envío se limita. */
export function takeThrottle(): boolean {
  const st = state();
  if (st.throttle <= 0) return false;
  st.throttle -= 1;
  return true;
}

/** 045 — 403 `ErrorAccessDenied` hasta apagarlo (buzón fuera de la ApplicationAccessPolicy). */
export function setDeny(deny: boolean): void {
  state().deny = deny;
}

export function isDenying(): boolean {
  return state().deny;
}
