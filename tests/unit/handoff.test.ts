import { describe, expect, it } from "vitest";
import { matchesHandoffIntent, shouldBackupHandoff } from "@/server/ai/handoff";

describe("patrón de respaldo de handoff (FR-022 / SC-006)", () => {
  it.each([
    "quiero hablar con un humano",
    "¿puedo hablar con un asesor?",
    "necesito comunicarme con alguien",
    "quiero contactar a una persona real",
    "quiero hablar con alguien por favor",
    "me pasas a un asesor",
    "prefiero atención humana",
    "atencion humana por favor",
  ])("dispara: %s", (text) => {
    expect(matchesHandoffIntent(text)).toBe(true);
  });

  it.each([
    "somos 4 personas", // el caso canónico que NO debe disparar
    "somos cuatro personas y queremos reservar",
    "¿tienen taladros?",
    "la persona que me atendió ayer fue amable",
    "mi humano favorito es mi hijo",
    "el asesor fiscal ya me cobró", // sin verbo de contacto ni "un asesor"
  ])("NO dispara: %s", (text) => {
    expect(matchesHandoffIntent(text)).toBe(false);
  });
});

/**
 * 029 (DV-006) — Con el ruteo por áreas encendido, pedir a alguien de VENTAS
 * o SOPORTE no silencia la IA hacia la academia: llega al modelo, que deriva
 * por correo. Con el ruteo apagado, el respaldo dispara como siempre.
 */
describe("respaldo consciente de áreas (029)", () => {
  it.each([
    "quiero hablar con alguien de ventas",
    "necesito comunicarme con alguien del área comercial",
    "quiero hablar con alguien de soporte",
    "puedo hablar con una persona por la licencia?",
  ])("ruteo encendido: NO dispara — %s", (text) => {
    expect(shouldBackupHandoff(text, { routingEnabled: true })).toBe(false);
  });

  it.each([
    "quiero hablar con alguien de ventas",
    "quiero hablar con alguien de soporte",
  ])("ruteo apagado: dispara como hoy — %s", (text) => {
    expect(shouldBackupHandoff(text, { routingEnabled: false })).toBe(true);
  });

  it.each([true, false])(
    "\"quiero hablar con alguien de la academia\" dispara con ruteo=%s",
    (routingEnabled) => {
      expect(
        shouldBackupHandoff("quiero hablar con alguien de la academia", { routingEnabled })
      ).toBe(true);
    }
  );

  it("sin intención de contacto no dispara, con o sin ruteo", () => {
    expect(shouldBackupHandoff("necesito 5 licencias", { routingEnabled: true })).toBe(false);
    expect(shouldBackupHandoff("necesito 5 licencias", { routingEnabled: false })).toBe(false);
  });
});
