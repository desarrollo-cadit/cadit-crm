import { describe, expect, it } from "vitest";
import { confirmacionDeTallerEncendida } from "@/lib/workshops";

/**
 * 033 (FR-019) — Decisión del dueño (2026-10-15): por ahora los talleres NO
 * mandan WhatsApp. La confirmación al anotarse queda apagada salvo que se
 * encienda a propósito, igual que el recordatorio.
 */
describe("confirmación de taller por WhatsApp", () => {
  it("apagada por defecto: sin la variable no se manda nada", () => {
    expect(confirmacionDeTallerEncendida(undefined)).toBe(false);
    expect(confirmacionDeTallerEncendida("")).toBe(false);
  });

  it("solo 'true' la enciende; cualquier otro valor la deja apagada", () => {
    expect(confirmacionDeTallerEncendida("true")).toBe(true);
    expect(confirmacionDeTallerEncendida("false")).toBe(false);
    expect(confirmacionDeTallerEncendida("1")).toBe(false);
    expect(confirmacionDeTallerEncendida("TRUE ")).toBe(false);
  });
});
