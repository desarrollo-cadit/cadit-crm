import { describe, expect, it } from "vitest";
import type { FilaHistorica } from "@/lib/historial-import/planilla";
import {
  ORIGEN_IMPORTACION,
  dedupKey,
  planDeImportacion,
  sugerirCurso,
  sugerirVendedor,
  validarMapeo,
  type ContactoParaPlan,
  type EstadoParaPlan,
  type Mapeo,
} from "@/lib/historial-import/plan";

/**
 * 046 US6 (T049; FR-015…FR-019) — El plan de importación: el MISMO para la
 * vista previa y para cada tanda. Datos inventados.
 */

const CATALOGO = [
  { id: "crs_arq", name: "Revit Arquitectura" },
  { id: "crs_mep", name: "Revit MEP" },
  { id: "crs_din", name: "Dinámica" },
];
const SELLERS = [
  { id: "sel_cp", name: "Cristina Pérez" },
  { id: "sel_gc", name: "Gonzalo Castro" },
  { id: "sel_sf", name: "Sofía Fernández" },
  { id: "sel_sg", name: "Santiago Gómez" },
];

describe("sugerencias de asociación (FR-015)", () => {
  it("curso: igual sin tildes, mayúsculas ni espacios de más", () => {
    expect(sugerirCurso("revit  arquitectura", CATALOGO)).toBe("crs_arq");
    expect(sugerirCurso("Dinamica", CATALOGO)).toBe("crs_din");
    expect(sugerirCurso("Revit", CATALOGO)).toBeNull();
  });

  it("vendedor: nombre igual, primer nombre único o iniciales únicas", () => {
    expect(sugerirVendedor("Cristina Pérez", SELLERS)).toBe("sel_cp");
    expect(sugerirVendedor("Sofía", SELLERS)).toBe("sel_sf");
    expect(sugerirVendedor("CP", SELLERS)).toBe("sel_cp");
    expect(sugerirVendedor("gc", SELLERS)).toBe("sel_gc");
    // "S" no alcanza y "XX" no es de nadie.
    expect(sugerirVendedor("S", SELLERS)).toBeNull();
    expect(sugerirVendedor("XX", SELLERS)).toBeNull();
    expect(sugerirVendedor("", SELLERS)).toBeNull();
  });

  it("iniciales repetidas no se adivinan", () => {
    const dos = [...SELLERS, { id: "sel_cp2", name: "Carlos Pintos" }];
    expect(sugerirVendedor("CP", dos)).toBeNull();
  });
});

let n = 0;
function fila(p: Partial<FilaHistorica> = {}): FilaHistorica {
  n++;
  return {
    fila: n,
    nombre: "Lucía",
    apellido: "Inventada",
    correo: "lucia@ejemplo.test",
    telefono: null,
    empresa: null,
    curso: "Revit Arquitectura",
    cursoOriginal: null,
    estudiante: false,
    edicion: null,
    fecha: "2021-03-15",
    vendedor: "",
    nota: null,
    ...p,
  };
}

const MAPEO: Mapeo = {
  cursos: { "Revit Arquitectura": "crs_arq", "Revit MEP": "crs_mep", "Dynamo Básico": null },
  vendedores: { CP: "sel_cp", Sofía: null },
};

function contacto(p: Partial<ContactoParaPlan> & { id: string }): ContactoParaPlan {
  return {
    firstName: "X",
    lastName: null,
    email: null,
    phone: null,
    waIdentity: `sinwa:${p.id}`,
    companyId: null,
    ...p,
  };
}

const vacio: EstadoParaPlan = { contactos: [], empresas: [], cursadasExistentes: new Set() };

describe("validarMapeo", () => {
  const ids = { cursos: new Set(CATALOGO.map((c) => c.id)), sellers: new Set(SELLERS.map((s) => s.id)) };

  it("exige un destino para cada curso y cada vendedor distinto", () => {
    expect(validarMapeo([fila(), fila({ curso: "Revit MEP", vendedor: "CP" })], MAPEO, ids)).toBeNull();
    expect(validarMapeo([fila({ curso: "Otro" })], MAPEO, ids)).toMatch(/Otro/);
    expect(validarMapeo([fila({ vendedor: "ZZ" })], MAPEO, ids)).toMatch(/ZZ/);
  });

  it("rechaza ids que no son de la organización", () => {
    expect(validarMapeo([fila()], { cursos: { "Revit Arquitectura": "crs_ajeno" }, vendedores: {} }, ids)).not.toBeNull();
    expect(
      validarMapeo([fila({ vendedor: "CP" })], { cursos: MAPEO.cursos, vendedores: { CP: "sel_ajeno" } }, ids)
    ).not.toBeNull();
  });
});

describe("planDeImportacion — contactos (FR-017)", () => {
  it("crea a una persona nueva UNA vez aunque aparezca en varias filas, con origen de importación", () => {
    const p = planDeImportacion(
      [fila(), fila({ curso: "Revit MEP", telefono: "59899000001", apellido: null })],
      MAPEO,
      vacio
    );
    expect(p.contactosNuevos).toEqual([
      {
        clave: "nuevo:1",
        firstName: "Lucía",
        lastName: "Inventada",
        email: "lucia@ejemplo.test",
        phone: "59899000001",
        companyRef: null,
        source: ORIGEN_IMPORTACION,
      },
    ]);
    expect(p.conteo.contactos).toEqual({ crear: 1, completar: 0, sinCambios: 0 });
    expect(p.cursadas.map((c) => c.contactRef)).toEqual(["nuevo:1", "nuevo:1"]);
  });

  it("reconoce por correo y, si no, por teléfono; nunca pisa, solo completa vacíos", () => {
    const estado: EstadoParaPlan = {
      ...vacio,
      contactos: [
        contacto({ id: "ct_a", email: "lucia@ejemplo.test", lastName: "Original" }),
        contacto({ id: "ct_b", phone: "59899000002", waIdentity: "59899000002", lastName: null }),
      ],
    };
    const p = planDeImportacion(
      [
        fila({ apellido: "Otro", telefono: "59899000009" }),
        fila({ correo: "martin@ejemplo.test", telefono: "59899000002", nombre: "Martín", apellido: "Ejemplo" }),
      ],
      MAPEO,
      estado
    );
    expect(p.contactosNuevos).toEqual([]);
    expect(p.completar).toEqual([
      // ct_a: el apellido ya estaba (no se pisa); el teléfono estaba vacío y su identidad era provisional.
      { contactId: "ct_a", cambios: { phone: "59899000009", waIdentity: "59899000009" } },
      { contactId: "ct_b", cambios: { lastName: "Ejemplo", email: "martin@ejemplo.test" } },
    ]);
    expect(p.conteo.contactos).toEqual({ crear: 0, completar: 2, sinCambios: 0 });
  });

  it("no completa un teléfono que ya es de otro contacto", () => {
    const estado: EstadoParaPlan = {
      ...vacio,
      contactos: [
        contacto({ id: "ct_a", email: "lucia@ejemplo.test", lastName: "Inventada" }),
        contacto({ id: "ct_b", phone: "59899000002", waIdentity: "59899000002" }),
      ],
    };
    const p = planDeImportacion([fila({ telefono: "59899000002" })], MAPEO, estado);
    expect(p.completar).toEqual([]);
    expect(p.conteo.contactos).toEqual({ crear: 0, completar: 0, sinCambios: 1 });
  });
});

describe("planDeImportacion — empresas (FR-018)", () => {
  it("vincula por nombre exacto normalizado o crea una sola vez", () => {
    const estado: EstadoParaPlan = {
      ...vacio,
      empresas: [{ id: "emp_1", legalName: "Constructora Ficticia SA", tradeName: null }],
    };
    const p = planDeImportacion(
      [
        fila({ empresa: "constructora  ficticia sa" }),
        fila({ correo: "otro@ejemplo.test", empresa: "Estudio Nuevo" }),
        fila({ correo: "tercero@ejemplo.test", empresa: "ESTUDIO NUEVO" }),
      ],
      MAPEO,
      estado
    );
    expect(p.empresasNuevas).toEqual([{ clave: "empresa:1", nombre: "Estudio Nuevo" }]);
    expect(p.contactosNuevos.map((c) => c.companyRef)).toEqual(["emp_1", "empresa:1", "empresa:1"]);
    expect(p.cursadas.map((c) => c.companyRef)).toEqual(["emp_1", "empresa:1", "empresa:1"]);
  });

  it("completa la empresa de un contacto que no tenía, nunca la cambia", () => {
    const estado: EstadoParaPlan = {
      ...vacio,
      contactos: [
        contacto({ id: "ct_a", email: "lucia@ejemplo.test", lastName: "Inventada" }),
        contacto({ id: "ct_b", email: "b@ejemplo.test", lastName: "B", companyId: "emp_9" }),
      ],
      empresas: [{ id: "emp_1", legalName: "Ficticia", tradeName: null }],
    };
    const p = planDeImportacion(
      [fila({ empresa: "Ficticia" }), fila({ correo: "b@ejemplo.test", empresa: "Ficticia" })],
      MAPEO,
      estado
    );
    expect(p.completar).toEqual([{ contactId: "ct_a", cambios: { companyRef: "emp_1" } }]);
  });
});

describe("planDeImportacion — cursadas (FR-019)", () => {
  it("asocia curso, vendedor, estudiante, edición y nota; sin curso de catálogo queda como texto", () => {
    const p = planDeImportacion(
      [
        fila({ vendedor: "CP", estudiante: true, edicion: "9", nota: "ok", cursoOriginal: "REVIT ARQ" }),
        fila({ curso: "Dynamo Básico", vendedor: "Sofía" }),
      ],
      MAPEO,
      vacio
    );
    expect(p.cursadas[0]).toMatchObject({
      courseId: "crs_arq",
      courseLabel: "Revit Arquitectura",
      originalLabel: "REVIT ARQ",
      sellerId: "sel_cp",
      isStudent: true,
      edition: "9",
      note: "ok",
      fecha: "2021-03-15",
    });
    expect(p.cursadas[1]).toMatchObject({ courseId: null, courseLabel: "Dynamo Básico", sellerId: null });
  });

  it("la que ya está en la base no se vuelve a crear; la repetida en el archivo, tampoco", () => {
    const estado: EstadoParaPlan = {
      ...vacio,
      contactos: [contacto({ id: "ct_a", email: "lucia@ejemplo.test", lastName: "Inventada" })],
      cursadasExistentes: new Set([dedupKey("ct_a", "crs_arq", "Revit Arquitectura", "2021-03-15")]),
    };
    const p = planDeImportacion([fila(), fila(), fila({ curso: "Revit MEP" }), fila({ curso: "Revit MEP" })], MAPEO, estado);
    expect(p.cursadas.map((c) => c.courseId)).toEqual(["crs_mep"]);
    expect(p.conteo.cursadas).toEqual({ nuevas: 1, yaPresentes: 3 });
  });

  it("dedupKey: curso del catálogo o texto normalizado, más el día", () => {
    expect(dedupKey("ct_a", "crs_arq", "x", "2021-03-15")).toBe("ct_a|curso:crs_arq|2021-03-15");
    expect(dedupKey("ct_a", null, "Dynamo  BÁSICO", "2021-03-15")).toBe("ct_a|texto:dynamo basico|2021-03-15");
  });
});
