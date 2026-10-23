import { describe, expect, it } from "vitest";
import {
  AudienceFiltersSchema,
  MARKETING_RECIPIENT_CAP,
  particionarAudiencia,
  rangoDeAlta,
  type CandidatoAudiencia,
} from "@/lib/marketing/audience";

/**
 * 045 (T021; FR-001, FR-003, FR-004, FR-018, FR-027) — La parte pura de una
 * audiencia: el esquema de los filtros, las exclusiones (una sola por persona,
 * en orden), la deduplicación por correo normalizado y el tope de 500.
 */

const base = (over: Partial<CandidatoAudiencia> & { contactId: string }): CandidatoAudiencia => ({
  firstName: "Ana",
  lastName: "Pérez",
  email: `${over.contactId}@example.com`,
  createdAt: new Date("2026-01-01T12:00:00Z"),
  prueba: false,
  baja: false,
  archivado: false,
  ...over,
});

describe("AudienceFiltersSchema", () => {
  it("sin filtros es válido (toda la base)", () => {
    expect(AudienceFiltersSchema.safeParse({ v: 1 }).success).toBe(true);
  });

  it("exige `v: 1`", () => {
    expect(AudienceFiltersSchema.safeParse({}).success).toBe(false);
    expect(AudienceFiltersSchema.safeParse({ v: 2 }).success).toBe(false);
  });

  it("es estricto: un filtro desconocido falla", () => {
    expect(AudienceFiltersSchema.safeParse({ v: 1, ciudad: ["Montevideo"] }).success).toBe(false);
  });

  it("acepta todos los filtros conocidos", () => {
    const r = AudienceFiltersSchema.safeParse({
      v: 1,
      sources: ["formulario:Revit", "whatsapp"],
      stageIds: ["stg_1"],
      cohortIds: ["coh_1"],
      courseIds: ["crs_1"],
      interestCourseIds: ["crs_2"],
      companyIds: ["cia_1"],
      createdFrom: "2026-01-01",
      createdTo: "2026-03-31",
    });
    expect(r.success).toBe(true);
  });

  it("cada lista tiene entre 1 y 200 elementos", () => {
    expect(AudienceFiltersSchema.safeParse({ v: 1, stageIds: [] }).success).toBe(false);
    const muchos = Array.from({ length: 201 }, (_, i) => `stg_${i}`);
    expect(AudienceFiltersSchema.safeParse({ v: 1, stageIds: muchos }).success).toBe(false);
    expect(AudienceFiltersSchema.safeParse({ v: 1, stageIds: muchos.slice(0, 200) }).success).toBe(true);
  });

  it("rango invertido → error; fecha mal formada → error", () => {
    expect(
      AudienceFiltersSchema.safeParse({ v: 1, createdFrom: "2026-03-01", createdTo: "2026-02-01" })
        .success
    ).toBe(false);
    expect(AudienceFiltersSchema.safeParse({ v: 1, createdFrom: "01/03/2026" }).success).toBe(false);
    expect(AudienceFiltersSchema.safeParse({ v: 1, createdFrom: "2026-02-30" }).success).toBe(false);
    expect(
      AudienceFiltersSchema.safeParse({ v: 1, createdFrom: "2026-03-01", createdTo: "2026-03-01" })
        .success
    ).toBe(true);
  });
});

describe("particionarAudiencia — una sola exclusión por persona, en orden", () => {
  it("prueba > baja > archivado > sin_correo", () => {
    const r = particionarAudiencia([
      base({ contactId: "c1", prueba: true, baja: true, archivado: true, email: null }),
      base({ contactId: "c2", baja: true, archivado: true, email: null }),
      base({ contactId: "c3", archivado: true, email: null }),
      base({ contactId: "c4", email: null }),
      base({ contactId: "c5" }),
    ]);
    expect(r.excluded).toEqual({ prueba: 1, baja: 1, archivado: 1, sin_correo: 1, duplicado: 0 });
    expect(r.count).toBe(1);
    expect(r.recipients.map((x) => x.contactId)).toEqual(["c5"]);
  });

  it("un correo que no es correo cuenta como `sin_correo`", () => {
    const r = particionarAudiencia([
      base({ contactId: "c1", email: "no-es-correo" }),
      base({ contactId: "c2", email: "   " }),
    ]);
    expect(r.excluded.sin_correo).toBe(2);
    expect(r.count).toBe(0);
  });

  it("deduplica por correo normalizado y gana el contacto más antiguo", () => {
    const r = particionarAudiencia([
      base({ contactId: "nuevo", email: " Ana@Example.com ", createdAt: new Date("2026-05-01") }),
      base({ contactId: "viejo", email: "ana@example.com", createdAt: new Date("2025-01-01") }),
    ]);
    expect(r.excluded.duplicado).toBe(1);
    expect(r.recipients).toHaveLength(1);
    expect(r.recipients[0]).toMatchObject({ contactId: "viejo", email: "ana@example.com" });
  });

  it("el correo del destinatario viaja normalizado", () => {
    const r = particionarAudiencia([base({ contactId: "c1", email: "  JUAN@Mail.COM " })]);
    expect(r.recipients[0]!.email).toBe("juan@mail.com");
  });

  it("los destinatarios salen ordenados por nombre", () => {
    const r = particionarAudiencia([
      base({ contactId: "c1", firstName: "Zoe", lastName: null }),
      base({ contactId: "c2", firstName: "Ángela", lastName: "Ruiz" }),
      base({ contactId: "c3", firstName: "Bruno", lastName: "Díaz" }),
    ]);
    expect(r.recipients.map((x) => x.name)).toEqual(["Ángela Ruiz", "Bruno Díaz", "Zoe"]);
  });

  it("sin candidatos → todo en cero", () => {
    expect(particionarAudiencia([])).toEqual({
      recipients: [],
      excluded: { prueba: 0, baja: 0, archivado: 0, sin_correo: 0, duplicado: 0 },
      count: 0,
      overCap: false,
    });
  });
});

describe("tope de 500 (FR-018)", () => {
  it("el tope es 500", () => {
    expect(MARKETING_RECIPIENT_CAP).toBe(500);
  });

  it("`overCap` es count > 500", () => {
    const mk = (n: number) =>
      particionarAudiencia(Array.from({ length: n }, (_, i) => base({ contactId: `c${i}` })));
    expect(mk(500).overCap).toBe(false);
    expect(mk(501).overCap).toBe(true);
  });
});

describe("rangoDeAlta — días de la organización", () => {
  it("Montevideo (UTC−3): desde el inicio del primer día hasta el inicio del día siguiente al último", () => {
    const r = rangoDeAlta("2026-03-01", "2026-03-31", "America/Montevideo");
    expect(r.desde?.toISOString()).toBe("2026-03-01T03:00:00.000Z");
    expect(r.hastaExclusivo?.toISOString()).toBe("2026-04-01T03:00:00.000Z");
  });

  it("solo uno de los dos extremos", () => {
    expect(rangoDeAlta("2026-03-01", undefined, "UTC")).toEqual({
      desde: new Date("2026-03-01T00:00:00Z"),
      hastaExclusivo: null,
    });
    expect(rangoDeAlta(undefined, "2026-12-31", "UTC")).toEqual({
      desde: null,
      hastaExclusivo: new Date("2027-01-01T00:00:00Z"),
    });
  });

  it("sin extremos → sin rango", () => {
    expect(rangoDeAlta(undefined, undefined, "UTC")).toEqual({ desde: null, hastaExclusivo: null });
  });
});
