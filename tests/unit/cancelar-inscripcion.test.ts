import { describe, expect, it } from "vitest";
import {
  decidirCancelacion,
  HISTORIAL_VACIO,
  type InscripcionACancelar,
} from "@/lib/enrollment-cancel";

/**
 * Cancelar (borrar) una inscripción hecha por error.
 *
 * `enrollment` arrastra en CASCADE cuotas, pagos, asistencia, notas,
 * entregas, correcciones y certificados. Un DELETE sobre una inscripción con
 * historia se lleva la prueba de lo que pasó. La decisión es PURA y el
 * servidor la vuelve a tomar dentro de la transacción, con las filas
 * bloqueadas.
 */

function base(over: Partial<InscripcionACancelar> = {}): InscripcionACancelar {
  return {
    contacto: "Ana Pérez",
    grupo: "Revit 2026-1",
    tieneGrupo: true,
    esHija: false,
    esTaller: false,
    modulos: 0,
    cuotas: 0,
    licencias: [],
    historial: { ...HISTORIAL_VACIO },
    ...over,
  };
}

describe("decidirCancelacion — sin historial se borra", () => {
  it("una inscripción sin nada: se puede borrar y lo dice con nombre y grupo", () => {
    const d = decidirCancelacion(base());
    expect(d.deletable).toBe(true);
    expect(d.motivo).toContain("Ana Pérez");
    expect(d.motivo).toContain("Revit 2026-1");
    expect(d.motivo).toContain("No se puede deshacer");
  });

  it("dice cuántas cuotas y qué licencias se van con ella", () => {
    const d = decidirCancelacion(base({ cuotas: 3, licencias: ["Revit"] }));
    expect(d.deletable).toBe(true);
    expect(d.motivo).toContain("sus 3 cuotas");
    expect(d.motivo).toContain("la licencia de Revit");
  });

  it("singular y plural bien dichos", () => {
    expect(decidirCancelacion(base({ cuotas: 1 })).motivo).toContain("su cuota");
    const d = decidirCancelacion(base({ licencias: ["Revit", "AutoCAD", "Navisworks"] }));
    expect(d.motivo).toContain("las licencias de Revit, AutoCAD y Navisworks");
  });

  it("una especialización sin historia se lleva sus módulos y lo avisa", () => {
    const d = decidirCancelacion(base({ modulos: 3 }));
    expect(d.deletable).toBe(true);
    expect(d.motivo).toContain("3 módulos");
    expect(d.detalle.modulos).toBe(3);
  });
});

describe("decidirCancelacion — con historial NO se borra", () => {
  it("un pago registrado alcanza para bloquear, con número", () => {
    const d = decidirCancelacion(base({ historial: { ...HISTORIAL_VACIO, pagos: 2 } }));
    expect(d.deletable).toBe(false);
    if (d.deletable) return;
    expect(d.code).toBe("inscripcion_con_historial");
    expect(d.motivo).toContain("2 pagos registrados");
  });

  it("junta todo lo que encontró en una frase con números", () => {
    const d = decidirCancelacion(
      base({ historial: { ...HISTORIAL_VACIO, pagos: 2, asistencias: 3 } })
    );
    expect(d.motivo).toContain("Tiene 2 pagos registrados y asistencia en 3 clases.");
  });

  it.each([
    ["pagos", "1 pago registrado"],
    ["certificados", "1 certificado emitido"],
    ["asistencias", "asistencia en 1 clase"],
    ["resultados", "1 nota cargada"],
    ["correcciones", "1 corrección"],
    ["entregas", "1 entrega"],
    ["intentosOffline", "1 intento de cuestionario"],
  ] as const)("%s bloquea por sí solo", (clave, texto) => {
    const d = decidirCancelacion(base({ historial: { ...HISTORIAL_VACIO, [clave]: 1 } }));
    expect(d.deletable).toBe(false);
    expect(d.motivo).toContain(texto);
  });

  it("un certificado ANULADO también bloquea: se cuenta igual", () => {
    // El conteo lo hace el servidor sin filtrar `revoked_at`; acá basta con
    // que cualquier certificado contado bloquee.
    const d = decidirCancelacion(base({ historial: { ...HISTORIAL_VACIO, certificados: 1 } }));
    expect(d.deletable).toBe(false);
  });

  it("la historia de un MÓDULO hijo bloquea a la madre y lo dice", () => {
    const d = decidirCancelacion(
      base({ modulos: 2, historial: { ...HISTORIAL_VACIO, asistencias: 4 } })
    );
    expect(d.deletable).toBe(false);
    expect(d.motivo).toContain("contando sus módulos");
    expect(d.motivo).toContain("Recorrido");
  });

  it("una inscripción común no ofrece mudar (no existe para ella)", () => {
    const d = decidirCancelacion(base({ historial: { ...HISTORIAL_VACIO, pagos: 1 } }));
    expect(d.motivo).not.toContain("Mud");
    expect(d.motivo).not.toContain("mud");
  });

  it("el detalle trae los números para la pantalla", () => {
    const d = decidirCancelacion(
      base({ cuotas: 4, historial: { ...HISTORIAL_VACIO, pagos: 2 } })
    );
    expect(d.detalle.pagos).toBe(2);
    expect(d.detalle.cuotas).toBe(4);
  });
});

describe("decidirCancelacion — lo que no es una inscripción a un grupo", () => {
  it("el lead general (sin grupo) no se cancela por acá", () => {
    const d = decidirCancelacion(base({ tieneGrupo: false }));
    expect(d.deletable).toBe(false);
    if (d.deletable) return;
    expect(d.code).toBe("no_es_de_un_grupo");
  });

  it("la cursada de un módulo se saca desde el módulo, no se cancela suelta", () => {
    const d = decidirCancelacion(base({ esHija: true }));
    expect(d.deletable).toBe(false);
    if (d.deletable) return;
    expect(d.code).toBe("es_un_modulo");
  });

  it("un taller se gestiona desde Talleres", () => {
    const d = decidirCancelacion(base({ esTaller: true }));
    expect(d.deletable).toBe(false);
    if (d.deletable) return;
    expect(d.code).toBe("es_un_taller");
  });
});
