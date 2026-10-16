import { describe, expect, it } from "vitest";
import {
  armarBienvenida,
  cantidadDeClases,
  copiaDeBienvenida,
  equipoDeBienvenida,
  nombreEnFrase,
  renderBienvenida,
  type HechosDeBienvenida,
} from "@/server/email/welcome-email";

/**
 * 036 — El correo de bienvenida rehecho (diseño aprobado por el dueño).
 *
 * Todo lo que DECIDE el correo vive en funciones puras: qué filas aparecen,
 * cómo se nombran las licencias, en qué orden van los módulos y a quién se
 * copia. La regla madre: un dato que falta OMITE su fila. Nada de "a
 * confirmar", nada de "aula".
 */

const persona = (name: string, email: string | null) => ({ name, email });

function hechosCurso(over: Partial<HechosDeBienvenida> = {}): HechosDeBienvenida {
  return {
    nombre: "Lucía",
    correoDelAlumno: "lucia@example.com",
    curso: "REVIT Arquitectura",
    camada: "REVIT 32",
    esEspecializacion: false,
    inicio: new Date("2026-10-20T00:00:00.000Z"),
    fin: new Date("2026-12-03T00:00:00.000Z"),
    horario: "martes y jueves de 10:00 a 12:00",
    clases: 14,
    modalidad: "Online en vivo",
    docente: persona("Sandra Moros", "sandra@example.com"),
    soporte: [persona("Julio Saettone", "julio@example.com"), persona("Alessandro Pimentel", "ale@example.com")],
    coordinacion: [persona("Natalie Frider", "natalie@example.com")],
    softwareDeLaCohorte: ["Revit"],
    licenciasAsignadas: [],
    modulos: [],
    grupoWhatsapp: "https://chat.whatsapp.com/abc",
    ...over,
  };
}

function hechosEspecializacion(over: Partial<HechosDeBienvenida> = {}): HechosDeBienvenida {
  return hechosCurso({
    nombre: "Martín",
    correoDelAlumno: "martin@example.com",
    curso: "Especialización en Proyectos BIM",
    camada: "EBIM 14",
    esEspecializacion: true,
    inicio: new Date("2026-03-02T00:00:00.000Z"),
    fin: new Date("2026-12-18T00:00:00.000Z"),
    horario: null,
    clases: null,
    modalidad: null,
    docente: null,
    softwareDeLaCohorte: ["Revit", "Navisworks", "AutoCAD"],
    modulos: [
      { id: "cv_c", position: 3, startDate: new Date("2026-08-03T00:00:00.000Z"), nombre: "Coordinación" },
      { id: "cv_a", position: 1, startDate: new Date("2026-03-02T00:00:00.000Z"), nombre: "Modelado" },
      { id: "cv_d", position: 4, startDate: new Date("2026-10-05T00:00:00.000Z"), nombre: "Gestión" },
      { id: "cv_b", position: 2, startDate: new Date("2026-05-04T00:00:00.000Z"), nombre: "Documentación" },
    ],
    ...over,
  });
}

const marca = { academia: "CAD IT", acento: "#001b5e", logoUrl: "https://crm.example.com/logo-cadit.png" };
// Lo que lee la persona: los comentarios de la plantilla son para quien la edita.
const visible = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "");

describe("armarBienvenida — curso común", () => {
  it("arma la agenda en el orden del diseño, con día de la semana", () => {
    const v = armarBienvenida(hechosCurso());
    expect(v.tipo).toBe("curso");
    expect(v.ficha.map((f) => f.etiqueta)).toEqual([
      "Inicio",
      "Días y horario",
      "Clases",
      "Finalización",
      "Modalidad",
    ]);
    expect(v.ficha[0]!.valor).toBe("martes 20 de octubre");
    expect(v.ficha[2]!.valor).toBe("14");
    expect(v.ficha[3]!.valor).toBe("jueves 3 de diciembre");
  });

  it("un dato que falta omite su fila, no dice 'a confirmar'", () => {
    const v = armarBienvenida(
      hechosCurso({ fin: null, horario: null, clases: null, modalidad: null })
    );
    expect(v.ficha.map((f) => f.etiqueta)).toEqual(["Inicio"]);
  });

  it("equipo: docente, soporte y coordinación; sin correo no aparece", () => {
    const v = armarBienvenida(
      hechosCurso({
        soporte: [persona("Julio Saettone", "julio@example.com"), persona("Sin Correo", null)],
      })
    );
    expect(v.equipo.map((r) => r.rol)).toEqual(["Docente", "Soporte técnico", "Coordinación"]);
    expect(v.equipo[1]!.personas.map((p) => p.name)).toEqual(["Julio Saettone"]);
  });

  it("sin docente (o sin su correo) la fila Docente no está", () => {
    expect(armarBienvenida(hechosCurso({ docente: null })).equipo.map((r) => r.rol)).toEqual([
      "Soporte técnico",
      "Coordinación",
    ]);
    expect(
      armarBienvenida(hechosCurso({ docente: persona("Sandra", null) })).equipo.map((r) => r.rol)
    ).not.toContain("Docente");
  });

  it("licencias: unión del software de la cohorte y las ya asignadas, sin repetir", () => {
    const v = armarBienvenida(
      hechosCurso({ softwareDeLaCohorte: ["Revit"], licenciasAsignadas: ["AutoCAD", "Revit"] })
    );
    expect(v.licencias).toEqual(["Revit", "AutoCAD"]);
  });
});

describe("armarBienvenida — especialización", () => {
  it("el programa: inicio, fin y cantidad de módulos; sin horario ni modalidad", () => {
    const v = armarBienvenida(hechosEspecializacion());
    expect(v.tipo).toBe("especializacion");
    expect(v.titulo).toBe("Especialización en Proyectos BIM");
    expect(v.camada).toBe("EBIM 14");
    expect(v.ficha.map((f) => f.etiqueta)).toEqual(["Inicio", "Finalización", "Módulos"]);
    expect(v.ficha[2]!.valor).toBe("4");
  });

  it("los módulos van en el orden del programa, con su rótulo y su inicio", () => {
    const v = armarBienvenida(hechosEspecializacion());
    expect(v.modulos).toEqual([
      { rotulo: "Módulo 1 — Modelado", desde: "desde el 2 de marzo" },
      { rotulo: "Módulo 2 — Documentación", desde: "desde el 4 de mayo" },
      { rotulo: "Módulo 3 — Coordinación", desde: "desde el 3 de agosto" },
      { rotulo: "Módulo 4 — Gestión", desde: "desde el 5 de octubre" },
    ]);
  });

  it("el equipo es solo soporte y coordinación, aunque haya docente", () => {
    const v = armarBienvenida(
      hechosEspecializacion({ docente: persona("Sandra Moros", "sandra@example.com") })
    );
    expect(v.equipo.map((r) => r.rol)).toEqual(["Soporte técnico", "Coordinación"]);
  });

  it("sin módulos armados no hay fila ni lista de módulos", () => {
    const v = armarBienvenida(hechosEspecializacion({ modulos: [] }));
    expect(v.ficha.map((f) => f.etiqueta)).toEqual(["Inicio", "Finalización"]);
    expect(v.modulos).toEqual([]);
  });
});

describe("cantidadDeClases", () => {
  it("cuenta las clases reales sin las canceladas", () => {
    expect(cantidadDeClases([{ canceled: false }, { canceled: true }, { canceled: false }], 20)).toBe(2);
  });
  it("sin cronograma generado, usa lo planificado", () => {
    expect(cantidadDeClases([], 14)).toBe(14);
  });
  it("sin nada que contar, null (la fila se omite)", () => {
    expect(cantidadDeClases([], null)).toBeNull();
    expect(cantidadDeClases([], 0)).toBeNull();
    expect(cantidadDeClases([{ canceled: true }], 10)).toBeNull();
  });
});

describe("copiaDeBienvenida (CC)", () => {
  it("curso: docente y soporte, sin coordinación", () => {
    expect(copiaDeBienvenida(hechosCurso())).toEqual([
      "sandra@example.com",
      "julio@example.com",
      "ale@example.com",
    ]);
  });

  it("especialización: solo soporte", () => {
    expect(
      copiaDeBienvenida(hechosEspecializacion({ docente: persona("Sandra", "sandra@example.com") }))
    ).toEqual(["julio@example.com", "ale@example.com"]);
  });

  it("sin repetir, sin vacíos y nunca al alumno", () => {
    const cc = copiaDeBienvenida(
      hechosCurso({
        correoDelAlumno: "Julio@Example.com",
        docente: persona("Sandra", "ale@example.com"),
        soporte: [
          persona("Julio", "julio@example.com"),
          persona("Ale", " ALE@example.com "),
          persona("Nadie", null),
          persona("Vacío", "  "),
        ],
      })
    );
    expect(cc).toEqual(["ale@example.com"]);
  });
});

describe("equipoDeBienvenida", () => {
  it("resuelve los ids guardados contra el equipo actual, en el orden elegido", () => {
    const miembros = [
      { userId: "u1", name: "Julio", email: "julio@example.com" },
      { userId: "u2", name: "Natalie", email: "natalie@example.com" },
      { userId: "u3", name: "Ale", email: "ale@example.com" },
    ];
    const r = equipoDeBienvenida({ soporte: ["u3", "u1", "u_fuera"], coordinacion: ["u2"] }, miembros);
    expect(r.soporte.map((p) => p.name)).toEqual(["Ale", "Julio"]);
    expect(r.coordinacion.map((p) => p.name)).toEqual(["Natalie"]);
  });
});

describe("renderBienvenida — curso común", () => {
  const html = visible(renderBienvenida(armarBienvenida(hechosCurso()), marca));

  it("tiene las secciones del diseño, en orden", () => {
    const orden = [
      "Agenda",
      "Equipo CAD IT",
      "Tu Campus",
      "Comunidad del curso",
      "Licencias de software",
      "Estamos para acompañarte",
    ].map((t) => html.indexOf(t));
    expect(orden.every((i) => i >= 0)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
  });

  it("nombra a la persona y el curso, y escribe a cada uno por mailto", () => {
    expect(html).toContain("Hola Lucía, ya está confirmada tu inscripción.");
    expect(html).toContain("REVIT Arquitectura");
    expect(html).toContain('href="mailto:sandra@example.com"');
    expect(html).toContain("Escribirle");
    expect(html).toContain("Docente");
  });

  it("licencia en singular con la frase del diseño", () => {
    expect(html).toContain("Durante el curso te asignamos una licencia de <b");
    expect(html).toContain("registrando tu correo personal, si no contás con una propia.");
    expect(html).toContain("Para la instalación o cualquier consulta, escribile directamente al equipo de soporte.");
  });

  it("Campus sin botón; WhatsApp con botón y enlace en texto", () => {
    expect(html).toContain("El acceso te llega en un correo aparte.");
    expect(html).toContain('href="https://chat.whatsapp.com/abc"');
    expect(html).toContain("Unirme al grupo de WhatsApp");
    expect(html).toContain("¿El botón no abre? Copiá este enlace:");
    // El único botón es el del grupo.
    expect(html.match(/bgcolor=/g)).toHaveLength(1);
  });

  it("no dice 'a confirmar', no habla de aula, no tiene Zoom ni Google", () => {
    expect(html).not.toMatch(/a confirmar/i);
    expect(html).not.toMatch(/\baula\b/i);
    expect(html).not.toMatch(/zoom/i);
    expect(html).not.toMatch(/google/i);
    expect(html).not.toMatch(/\{\{/);
  });

  it("varias licencias: 'A, B y C', en plural", () => {
    const h = visible(
      renderBienvenida(
        armarBienvenida(hechosCurso({ softwareDeLaCohorte: ["Revit", "AutoCAD", "Navisworks"] })),
        marca
      )
    );
    expect(h).toMatch(/licencias de <b[^>]*>Revit<\/b>, <b[^>]*>AutoCAD<\/b> y <b[^>]*>Navisworks<\/b>/);
    expect(h).toContain("si no contás con licencias propias.");
  });

  it("sin licencias, el bloque no aparece; sin equipo, tampoco", () => {
    const h = visible(
      renderBienvenida(
        armarBienvenida(
          hechosCurso({ softwareDeLaCohorte: [], docente: null, soporte: [], coordinacion: [] })
        ),
        marca
      )
    );
    expect(h).not.toContain("Licencias de software");
    expect(h).not.toContain("Equipo CAD IT");
  });

  /**
   * El reemplazo corre también dentro de los comentarios de la plantilla: si
   * un comentario nombrara un bloque con sus llaves, el bloque se copiaría
   * entero ahí adentro, invisible pero viajando en cada correo.
   */
  it("cada bloque aparece una sola vez en el HTML crudo", () => {
    const crudo = renderBienvenida(armarBienvenida(hechosCurso()), marca);
    expect(crudo.split("Hola Lucía").length - 1).toBe(1);
    expect(crudo.split("Licencias de software").length - 1).toBe(1);
  });

  it("escapa lo que viene de la base", () => {
    const h = renderBienvenida(
      armarBienvenida(
        hechosCurso({ nombre: "<img src=x>", softwareDeLaCohorte: ["A&B"], horario: "<b>x</b>" })
      ),
      marca
    );
    expect(h).not.toContain("<img src=x>");
    expect(h).toContain("A&amp;B");
    expect(h).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("renderBienvenida — especialización", () => {
  const html = visible(renderBienvenida(armarBienvenida(hechosEspecializacion()), marca));

  it("saluda nombrando la camada y muestra el programa y los módulos", () => {
    expect(html).toContain("ya está confirmada tu inscripción a la especialización <b");
    expect(html).toContain("EBIM 14");
    expect(html).toContain("Estos son los datos del programa.");
    expect(html).toContain("El programa");
    expect(html).toContain("Módulo 1 — Modelado");
    expect(html).toContain("desde el 2 de marzo");
    expect(html).toContain("Cada módulo tiene su propio cronograma, docente y modalidad.");
    expect(html).toContain("Comunidad de la especialización");
  });

  it("no tiene Docente, Modalidad ni horario", () => {
    expect(html).not.toContain("Docente");
    expect(html).not.toContain("Modalidad");
    expect(html).not.toContain("Días y horario");
    expect(html).not.toMatch(/a confirmar/i);
    expect(html).not.toMatch(/zoom|google|\baula\b/i);
  });

  it("licencias del paquete, con el aviso de los módulos", () => {
    expect(html).toContain("Para la especialización te asignamos licencias de <b");
    expect(html).toContain("Algunos módulos pueden sumar licencias propias; te avisamos al empezar cada uno.");
  });
});

/**
 * 036 (ajustes del dueño, 2026-10-16) — Lo que viaja en el correo es lo que
 * lee el alumno: las notas de la plantilla no salen, y el pie y el asunto no
 * suponen el género ni se comen el artículo.
 */
describe("lo que viaja en el correo", () => {
  it("el HTML enviado no lleva comentarios de la plantilla", () => {
    for (const h of [hechosCurso(), hechosEspecializacion()]) {
      const crudo = renderBienvenida(armarBienvenida(h), marca);
      expect(crudo).not.toContain("<!--");
      expect(crudo).not.toContain("MUESTRA");
    }
  });

  it("el pie no supone el género y lleva el artículo de la especialización", () => {
    const curso = renderBienvenida(armarBienvenida(hechosCurso()), marca);
    const esp = renderBienvenida(armarBienvenida(hechosEspecializacion()), marca);
    expect(curso).not.toContain("inscripto");
    expect(curso).toMatch(/Recibís este correo por tu inscripción en REVIT Arquitectura\./);
    expect(esp).toMatch(/Recibís este correo por tu inscripción en la Especialización en Proyectos BIM\./);
  });

  it("nombreEnFrase: la especialización lleva artículo; un curso no", () => {
    expect(nombreEnFrase(armarBienvenida(hechosCurso()))).toBe("REVIT Arquitectura");
    expect(nombreEnFrase(armarBienvenida(hechosEspecializacion()))).toBe(
      "la Especialización en Proyectos BIM"
    );
  });
});
