import { describe, expect, it } from "vitest";
import { normalizePhoneInput, normalizePhoneOrRaw } from "@/lib/phone";

/**
 * 007 — El teléfono escrito a mano (formulario público, alta manual,
 * importación de planillas) tiene que terminar en la MISMA forma con la que
 * llega un mensaje de WhatsApp. Si no, el mismo alumno queda como dos
 * contactos: uno con "098574165" y otro con "59898574165".
 */
describe("normalizePhoneInput", () => {
  it("Uruguay con 0 inicial: agrega el país y saca el 0", () => {
    expect(normalizePhoneInput("098 574 165")).toBe("59898574165");
    expect(normalizePhoneInput("092 983757")).toBe("59892983757");
  });

  it("Uruguay de 8 dígitos sueltos: agrega el país", () => {
    expect(normalizePhoneInput("99725527")).toBe("59899725527");
    expect(normalizePhoneInput("91 234234")).toBe("59891234234");
  });

  it("deja intacto lo que ya viene con código de país", () => {
    expect(normalizePhoneInput("598 98 523 661")).toBe("59898523661");
    expect(normalizePhoneInput("595 981 271 428")).toBe("595981271428");
  });

  it("respeta números internacionales con + o 00", () => {
    expect(normalizePhoneInput("+34 617 71 38 75")).toBe("34617713875");
    expect(normalizePhoneInput("001 829 345 9487")).toBe("18293459487");
    expect(normalizePhoneInput("1 (809) 965-9114")).toBe("18099659114");
  });

  /**
   * CadIT no es solo de esta academia: el colapso 521->52 de México venía
   * de antes (003) y tiene que seguir funcionando.
   */
  it("mantiene el colapso 521->52 de México", () => {
    expect(normalizePhoneInput("5215512345678")).toBe("525512345678");
    expect(normalizePhoneInput("525512345678")).toBe("525512345678");
  });

  it("devuelve null cuando no hay nada reconocible", () => {
    expect(normalizePhoneInput("")).toBeNull();
    expect(normalizePhoneInput("sin teléfono")).toBeNull();
    expect(normalizePhoneInput("1234")).toBeNull();
  });

  /**
   * El formulario público ya valida 7-15 dígitos antes de llegar acá: perder
   * el dato sería peor que guardarlo sin normalizar.
   */
  it("normalizePhoneOrRaw nunca pierde el número", () => {
    expect(normalizePhoneOrRaw("098 574 165")).toBe("59898574165");
    expect(normalizePhoneOrRaw("1234567")).toBe("1234567");
  });
});
