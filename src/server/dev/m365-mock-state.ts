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

type M365MockState = { outbox: M365OutboxEntry[]; failing: boolean };

const globalForMock = globalThis as unknown as { __m365MockState?: M365MockState };

function state(): M365MockState {
  if (!globalForMock.__m365MockState) {
    globalForMock.__m365MockState = { outbox: [], failing: false };
  }
  return globalForMock.__m365MockState;
}

export function pushMail(entry: Omit<M365OutboxEntry, "receivedAt">): void {
  state().outbox.push({ ...entry, receivedAt: new Date().toISOString() });
}

export function readOutbox(): M365OutboxEntry[] {
  return state().outbox;
}

/** Limpia el outbox y apaga el modo falla: cada corrida arranca del camino feliz. */
export function clearOutbox(): void {
  globalForMock.__m365MockState = { outbox: [], failing: false };
}

export function setFail(fail: boolean): void {
  state().failing = fail;
}

export function isFailing(): boolean {
  return state().failing;
}
