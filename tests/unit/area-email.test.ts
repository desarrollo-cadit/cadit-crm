import { describe, expect, it } from "vitest";
import {
  buildHandoffEmail,
  buildHandoffSubject,
  htmlRows,
  type HandoffEmailInput,
} from "@/server/areas/email";

/**
 * 029 — El correo de derivación (`contracts/correo-derivacion.md`).
 *
 * El texto de los clientes es entrada HOSTIL: todo lo que escribe termina en
 * un correo que sale con la firma de la academia hacia el equipo comercial.
 */

const base = (over: Partial<HandoffEmailInput> = {}): HandoffEmailInput => ({
  kind: "apertura",
  area: "ventas",
  caseRef: "AH-7K3Q2M",
  subject: "[Ventas] 5 licencias de AutoCAD — Laura Gómez (Constructora Sur)",
  summary: "5 licencias de AutoCAD",
  collected: { name: "Laura Gómez", company: "Constructora Sur", product: "AutoCAD", quantity: "5" },
  collectedDelta: {},
  missing: [],
  replyTo: "laura@sur.test",
  contact: {
    firstName: "Laura",
    lastName: null,
    phone: "59899111222",
    waIdentity: "59899111222",
  },
  organizationName: "CAD IT",
  timeZone: "America/Montevideo",
  createdAt: new Date("2026-10-08T15:00:00Z"),
  transcript: [
    { direction: "in", origin: "operator", type: "text", text: "necesito 5 licencias", at: new Date("2026-10-08T14:58:00Z") },
    { direction: "out", origin: "ai", type: "text", text: "¿Me pasás tu correo?", at: new Date("2026-10-08T14:59:00Z") },
  ],
  ...over,
});

describe("buildHandoffSubject", () => {
  it("apertura con empresa: [Área] resumen — nombre (empresa)", () => {
    expect(
      buildHandoffSubject({
        area: "ventas",
        summary: "5 licencias de AutoCAD",
        collected: { name: "Laura Gómez", company: "Constructora Sur" },
        contactName: "Laura",
      })
    ).toBe("[Ventas] 5 licencias de AutoCAD — Laura Gómez (Constructora Sur)");
  });

  it("sin empresa no deja paréntesis", () => {
    expect(
      buildHandoffSubject({
        area: "soporte",
        summary: "No activa la licencia",
        collected: { name: "Pedro" },
        contactName: "Pedro",
      })
    ).toBe("[Soporte] No activa la licencia — Pedro");
  });

  it("sin nombre declarado usa el del contacto, y si no hay, «Contacto de WhatsApp»", () => {
    expect(
      buildHandoffSubject({ area: "ventas", summary: "x y z", collected: {}, contactName: "Ana Paz" })
    ).toBe("[Ventas] x y z — Ana Paz");
    expect(
      buildHandoffSubject({ area: "ventas", summary: "x y z", collected: {}, contactName: "  " })
    ).toBe("[Ventas] x y z — Contacto de WhatsApp");
  });

  it("recorta el resumen a 80 caracteres con …", () => {
    const s = buildHandoffSubject({
      area: "ventas",
      summary: "a".repeat(120),
      collected: { name: "L" },
      contactName: "L",
    });
    expect(s).toContain(`${"a".repeat(79)}…`);
    expect(s).not.toContain("a".repeat(81));
  });

  it("quita saltos de línea y caracteres de control (anti header-injection)", () => {
    const s = buildHandoffSubject({
      area: "ventas",
      summary: "hola\r\nBcc: todos@x.test\u0007",
      collected: { name: "L\nX" },
      contactName: "L",
    });
    expect(s).not.toMatch(/[\r\n\u0000-\u001f]/);
  });
});

describe("buildHandoffEmail — sobre", () => {
  it("seguimiento: asunto `RE: <asunto de apertura>` y «Qué hay de nuevo»", () => {
    const mail = buildHandoffEmail(
      base({ kind: "seguimiento", collectedDelta: { quantity: "7" } })
    );
    expect(mail.subject).toBe(
      "RE: [Ventas] 5 licencias de AutoCAD — Laura Gómez (Constructora Sur)"
    );
    expect(mail.html).toContain("Qué hay de nuevo");
    expect(mail.html).toContain("Cantidad");
    expect(mail.html).toContain("7");
  });

  it("apertura: no trae «Qué hay de nuevo»", () => {
    expect(buildHandoffEmail(base()).html).not.toContain("Qué hay de nuevo");
  });

  it("caso, resumen, datos con rótulos humanos y faltantes", () => {
    const html = buildHandoffEmail(base({ missing: ["since", "email"] })).html;
    expect(html).toContain("Caso AH-7K3Q2M");
    expect(html).toContain("Nueva consulta");
    expect(html).toContain("Empresa");
    expect(html).toContain("Constructora Sur");
    expect(html).toContain("Desde cuándo");
    expect(html).toContain("declarado por el cliente, no verificado");
  });

  it("sin faltantes dice «Ninguno»", () => {
    expect(buildHandoffEmail(base({ missing: [] })).html).toContain("Ninguno");
  });

  it("contacto BSUID sin teléfono: no inventa un número", () => {
    const html = buildHandoffEmail(
      base({ contact: { firstName: "Ana", lastName: null, phone: null, waIdentity: "bsuid:abc" } })
    ).html;
    expect(html).toContain("Contacto sin número visible");
    expect(html).toContain("bsuid:abc");
  });

  it("con teléfono lo muestra", () => {
    expect(buildHandoffEmail(base()).html).toContain("59899111222");
  });
});

describe("buildHandoffEmail — escapado de entrada hostil", () => {
  it("<script>, <a href> y comillas de la transcripción quedan como texto", () => {
    const html = buildHandoffEmail(
      base({
        transcript: [
          {
            direction: "in",
            origin: "operator",
            type: "text",
            text: '<script>alert(1)</script> <a href="http://malo.test">clic</a> "comillas"',
            at: new Date("2026-10-08T14:58:00Z"),
          },
        ],
      })
    ).html;
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain('<a href="http://malo.test">');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;comillas&quot;");
  });

  it("los datos declarados también se escapan", () => {
    const html = buildHandoffEmail(
      base({ collected: { name: "<b>Laura</b>", company: "A & B" } })
    ).html;
    expect(html).not.toContain("<b>Laura</b>");
    expect(html).toContain("A &amp; B");
  });

  it("un `{{marcador}}` escrito por el cliente no se reemplaza", () => {
    const html = buildHandoffEmail(
      base({
        transcript: [
          { direction: "in", origin: "operator", type: "text", text: "hola {{casoRef}}", at: new Date() },
        ],
      })
    ).html;
    expect(html).toContain("hola {{casoRef}}");
  });
});

describe("buildHandoffEmail — transcripción", () => {
  it("autores Cliente / Asistente / Operador, en orden", () => {
    const html = buildHandoffEmail(
      base({
        transcript: [
          { direction: "in", origin: "operator", type: "text", text: "uno", at: new Date("2026-10-08T14:00:00Z") },
          { direction: "out", origin: "ai", type: "text", text: "dos", at: new Date("2026-10-08T14:01:00Z") },
          { direction: "out", origin: "operator", type: "text", text: "tres", at: new Date("2026-10-08T14:02:00Z") },
        ],
      })
    ).html;
    const i = (s: string) => html.indexOf(s);
    expect(i("Cliente")).toBeGreaterThan(-1);
    expect(i("Asistente")).toBeGreaterThan(-1);
    expect(i("Operador")).toBeGreaterThan(-1);
    expect(i(">uno<")).toBeLessThan(i(">dos<"));
    expect(i(">dos<")).toBeLessThan(i(">tres<"));
  });

  it("adjuntos como [adjunto: imagen], sin reenviarlos", () => {
    const html = buildHandoffEmail(
      base({
        transcript: [
          { direction: "in", origin: "operator", type: "image", text: null, at: new Date() },
        ],
      })
    ).html;
    expect(html).toContain("[adjunto: imagen]");
  });

  it("tope de 100 mensajes con la nota de omitidos", () => {
    const transcript = Array.from({ length: 130 }, (_, n) => ({
      direction: "in" as const,
      origin: "operator" as const,
      type: "text",
      text: `mensaje-${n}`,
      at: new Date(Date.UTC(2026, 9, 8, 10, 0, n)),
    }));
    const html = buildHandoffEmail(base({ transcript })).html;
    expect(html).toContain("(se omiten 30 mensajes anteriores)");
    expect(html).not.toContain(">mensaje-29<");
    expect(html).toContain(">mensaje-30<");
    expect(html).toContain(">mensaje-129<");
  });
});

describe("htmlRows", () => {
  it("escapa cada celda", () => {
    const html = String(htmlRows([["<k>", "<v>"]]));
    expect(html).toContain("&lt;k&gt;");
    expect(html).toContain("&lt;v&gt;");
  });
});
