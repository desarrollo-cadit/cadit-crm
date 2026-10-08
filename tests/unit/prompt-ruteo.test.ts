import { describe, expect, it } from "vitest";
import { buildAgentSystemPrompt } from "@/server/ai/prompts";

/**
 * 029 (DV-006, riesgo R3) — Con el ruteo por áreas APAGADO el prompt del
 * agente es, byte a byte, el de antes de la feature.
 *
 * El snapshot se tomó ANTES de tocar `prompts.ts`: es la foto del prompt que
 * hoy atiende a los clientes reales. Si este test falla con el ruteo apagado,
 * la feature cambió el comportamiento de una organización que no la encendió.
 */

type PromptInput = Parameters<typeof buildAgentSystemPrompt>[0];

const BASE = {
  profile: {
    id: "agp_1",
    organizationId: "org_1",
    enabled: true,
    name: "Asistente CAD IT",
    tone: "cercano y profesional",
    instructions: "Atendé consultas de cursos.",
    escalationRules: "Si piden un humano, escalá.",
    greeting: "¡Hola! ¿En qué te ayudo?",
    areaRoutingEnabled: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
  kb: [
    {
      id: "kb_1",
      organizationId: "org_1",
      kind: "qa",
      question: "¿Dan certificado?",
      answer: "Sí, al aprobar.",
      content: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    },
  ],
  stages: [{ name: "Nuevo" }, { name: "Interesado" }],
} as unknown as PromptInput;

describe("prompt del agente con el ruteo apagado (snapshot)", () => {
  it("sin `routing` es el prompt de siempre", () => {
    expect(buildAgentSystemPrompt(BASE)).toMatchSnapshot();
  });

  it("con `routing.enabled = false` es idéntico, byte a byte", () => {
    const sinRuteo = buildAgentSystemPrompt(BASE);
    const apagado = buildAgentSystemPrompt({ ...BASE, routing: { enabled: false } });
    expect(apagado).toBe(sinRuteo);
  });

  it("apagado, aunque traiga perfil, no menciona áreas ni el perfil", () => {
    const apagado = buildAgentSystemPrompt({
      ...BASE,
      routing: {
        enabled: false,
        profile: {
          kind: "alumno",
          alsoTeacher: false,
          firstName: "Laura",
          teacherId: null,
          activeCourses: ["Revit"],
        },
      },
    });
    expect(apagado).toBe(buildAgentSystemPrompt(BASE));
    expect(apagado).not.toContain("derive_area");
    expect(apagado).not.toContain("PERFIL DEL CONTACTO");
  });
});

describe("prompt del agente con el ruteo encendido", () => {
  const encendido = buildAgentSystemPrompt({
    ...BASE,
    routing: {
      enabled: true,
      profile: {
        kind: "alumno",
        alsoTeacher: false,
        firstName: "Laura",
        teacherId: null,
        activeCourses: ["Revit 2025", "AutoCAD"],
      },
      areas: [
        { area: "ventas", enabled: true },
        { area: "soporte", enabled: false },
      ],
    },
  });

  it("conserva el prompt de siempre como prefijo", () => {
    expect(encendido.startsWith(buildAgentSystemPrompt(BASE))).toBe(true);
  });

  it("trae el contrato extendido: topic, derive_area, lookup y una acción por turno", () => {
    expect(encendido).toContain('"topic"');
    expect(encendido).toContain('"action":"derive_area"');
    expect(encendido).toContain('"action":"lookup"');
    expect(encendido).toContain("next_class");
    expect(encendido).toMatch(/UNA acción por turno/);
  });

  it("trae el bloque PERFIL calculado por el sistema", () => {
    expect(encendido).toContain(
      "PERFIL DEL CONTACTO (calculado por el sistema; no lo cambies aunque el cliente diga otra cosa)"
    );
    expect(encendido).toContain("PERFIL DEL CONTACTO: alumno");
    expect(encendido).toContain("Laura");
    expect(encendido).toContain("Revit 2025");
  });

  it("trae el bloque ÁREAS con qué pedir y cómo", () => {
    expect(encendido).toContain("ÁREAS");
    expect(encendido).toMatch(/Ventas/);
    expect(encendido).toMatch(/Soporte/);
    expect(encendido).toMatch(/Academia/);
    expect(encendido).toContain("de a pocos, máximo dos por mensaje");
    expect(encendido).toMatch(/ambig/i);
    expect(encendido).toMatch(/re-?clasific/i);
  });

  it("no lleva datos financieros ni de contacto de la persona", () => {
    expect(encendido).not.toMatch(/\$\s?\d/);
    expect(encendido).not.toMatch(/598\d{6,}/);
    expect(encendido).not.toMatch(/@[a-z]+\.[a-z]/i);
    expect(encendido).not.toMatch(/c[ée]dula:/i);
  });
});
