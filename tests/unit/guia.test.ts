import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAPABILITIES, SYSTEM_ROLES, type Capability } from "@/lib/capabilities";
import { DESTINOS_MENU, ITEMS_ALUMNO, ITEMS_PROFESOR, NAV_GROUPS } from "@/lib/nav";
import {
  agruparCapacidades,
  GRUPOS_CAPACIDADES,
  GUIA_CAPACIDADES,
  rutaDeDonde,
} from "@/lib/guia";
import { GUIA_PORTAL_ALUMNO, GUIA_PORTAL_PROFESOR } from "@/lib/guia-portal";

/**
 * 027 (US3) — La guía no se puede desactualizar en silencio.
 *
 * El reparto de trabajo de la fase, dicho una vez para que no haya que
 * deducirlo leyendo los casos:
 *
 * - Que ESTÉN las 17 capacidades lo garantiza el TIPO. `GUIA_CAPACIDADES` es
 *   un `Record` sobre la unión cerrada `Capability`: agregar una capacidad 18
 *   sin describirla no compila. Eso no se testea acá porque no se puede —
 *   ningún test corre sobre código que no compiló.
 * - Lo que el tipo NO puede ver es todo lo demás, y es exactamente lo que
 *   vive en este archivo: que el `donde` apunte a una ruta que existe de
 *   verdad, que nadie haya callado al compilador con comillas vacías, y que
 *   el menú y la guía no se separen.
 *
 * Entre el compilador y este archivo no queda margen. Ese es el punto.
 */

const APP_DIR = path.join(process.cwd(), "src", "app");

/**
 * Las rutas que existen DE VERDAD: un `page.tsx` bajo `src/app/`, sin los
 * grupos de ruta —`(app)`, `(portal)`— que Next no pone en la URL.
 *
 * Se descubren recorriendo el disco y no con una lista escrita a mano: una
 * lista a mano es otra copia que se desfasa, que es la enfermedad que esta
 * fase vino a curar.
 */
function rutasReales(): Set<string> {
  const out = new Set<string>();
  const recorrer = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        recorrer(full);
      } else if (entry === "page.tsx") {
        const segmentos = path
          .relative(APP_DIR, path.dirname(full))
          .split(path.sep)
          .filter((s) => s.length > 0 && !/^\(.*\)$/.test(s));
        out.add(`/${segmentos.join("/")}`.replace(/\/$/, "") || "/");
      }
    }
  };
  recorrer(APP_DIR);
  return out;
}

const RUTAS = rutasReales();

describe("FR-016/SC-003 — todo `donde` termina en una ruta que existe", () => {
  /**
   * Hay dos formas de `donde`, y la diferencia es deliberada (DV-003):
   *
   * - una RUTA (`/inbox`), cuando el destino está en el menú;
   * - una PROSA con flechas ("Académico → la cohorte → Evaluación"), cuando el
   *   destino existe pero no está en el menú porque se llega desde otra
   *   pantalla. Justamente eso es lo que nadie encuentra; si la guía sólo
   *   repitiera el menú no agregaría nada.
   *
   * En los dos casos hay una ruta real detrás: en la prosa, el PRIMER tramo es
   * un rótulo del menú, y de ahí sale la ruta. `rutaDeDonde` es la única que
   * sabe resolver las dos formas, y es la que usa la pantalla.
   */
  for (const cap of CAPABILITIES) {
    it(`«${cap}» lleva a una ruta real`, () => {
      const { donde } = GUIA_CAPACIDADES[cap];
      const ruta = rutaDeDonde(donde);
      expect(
        ruta,
        `el «donde» de ${cap} («${donde}») no arranca ni con una ruta ni con un rótulo del menú`
      ).not.toBeNull();
      expect(
        RUTAS.has(ruta!),
        `el «donde» de ${cap} apunta a «${ruta}», que no existe bajo src/app/`
      ).toBe(true);
    });
  }

  /**
   * La prosa se detecta por la flecha, y no por descarte: si mañana alguien
   * escribe un `donde` que no es ni una ruta ni una prosa con flecha, el caso
   * de arriba falla en vez de dejarlo pasar como "debe ser prosa".
   */
  it("la prosa se reconoce por la flecha, no por descarte", () => {
    for (const cap of CAPABILITIES) {
      const { donde } = GUIA_CAPACIDADES[cap];
      expect(
        donde.startsWith("/") || donde.includes("→"),
        `el «donde» de ${cap} («${donde}») no es una ruta ni una prosa con flechas`
      ).toBe(true);
    }
  });

  it("una ruta inventada no se resuelve, y el test lo diría", () => {
    expect(rutaDeDonde("/pantalla-que-no-existe")).toBe("/pantalla-que-no-existe");
    expect(RUTAS.has("/pantalla-que-no-existe")).toBe(false);
    expect(rutaDeDonde("Rótulo Inventado → algo")).toBeNull();
  });
});

describe("FR-017 — el agujero de las comillas vacías", () => {
  /**
   * **El único modo de callar al compilador sin que se note.** Un `Record`
   * exhaustivo se satisface con `{ que: "", donde: "" }`: TypeScript queda
   * conforme y la persona que abre la guía ve una fila en blanco.
   *
   * Por eso el largo mínimo no es 1: una descripción de tres letras es la
   * misma renuncia, escrita más despacio.
   */
  for (const cap of CAPABILITIES) {
    it(`«${cap}» está descrita, no declarada`, () => {
      const entrada = GUIA_CAPACIDADES[cap];
      expect(entrada.que.trim(), `${cap} no dice QUÉ se puede hacer`).not.toBe("");
      expect(entrada.donde.trim(), `${cap} no dice DÓNDE está`).not.toBe("");
      expect(
        entrada.que.trim().length,
        `el «qué» de ${cap} es demasiado corto para explicar nada: «${entrada.que}»`
      ).toBeGreaterThan(12);
    });
  }

  /**
   * FR-002 — El `que` está en el idioma de quien lee, no en el del código.
   * `certificados.emitir` se lee "emitir el certificado de un alumno que
   * aprobó"; repetir la llave técnica es no haber escrito nada.
   */
  it("ningún «qué» repite el nombre técnico de la capacidad", () => {
    const infractores = CAPABILITIES.filter((c) =>
      GUIA_CAPACIDADES[c].que.toLowerCase().includes(c.toLowerCase())
    );
    expect(
      infractores,
      `estas descripciones repiten la llave técnica en vez de explicar: ${infractores.join(", ")}`
    ).toEqual([]);
  });
});

describe("FR-006 — los grupos de la guía son los de `CAPABILITIES`", () => {
  it("cada capacidad cae en un grupo, y en uno solo", () => {
    for (const cap of CAPABILITIES) {
      const grupos = GRUPOS_CAPACIDADES.filter((g) => g.incluye(cap)).map((g) => g.titulo);
      expect(grupos, `«${cap}» quedó en ${grupos.length} grupos`).toHaveLength(1);
    }
  });

  /**
   * Un grupo sin capacidades no se dibuja: un encabezado con nada debajo
   * parece un error de carga, igual que en el menú.
   */
  it("agrupar no inventa grupos vacíos ni pierde capacidades", () => {
    const solasFinancieras: Capability[] = ["cobranza.ver", "cobranza.editar"];
    const grupos = agruparCapacidades(solasFinancieras);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.titulo).toBe("Comercial y financiero");
    expect(grupos[0]!.capacidades).toEqual(solasFinancieras);

    const todas = agruparCapacidades(CAPABILITIES);
    expect(todas.flatMap((g) => g.capacidades)).toHaveLength(CAPABILITIES.length);
    expect(agruparCapacidades([])).toEqual([]);
  });
});

describe("FR-004/FR-018 — el menú y la guía no se separan", () => {
  /**
   * **Lo que no se admite es una segunda copia.** `NAV_GROUPS` vive en
   * `src/lib/nav.ts` —fuera del componente `"use client"`— justamente para que
   * la guía lo LEA en vez de repetirlo. Este caso es el que se enteraría si
   * alguien volviera a escribir la lista a mano en otro lado.
   */
  it("`app-nav.tsx` no declara su propia lista de navegación", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/components/app-nav.tsx"),
      "utf8"
    );
    expect(
      /const\s+NAV_GROUPS\s*=/.test(src),
      "volvió a haber dos listas de navegación: la que diverge es siempre la que nadie mira"
    ).toBe(false);
    expect(src).toContain('from "@/lib/nav"');
  });

  it("`portal-nav.tsx` tampoco", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/components/portal/portal-nav.tsx"),
      "utf8"
    );
    expect(/const\s+ITEMS_(ALUMNO|PROFESOR)\s*=/.test(src)).toBe(false);
    expect(src).toContain('from "@/lib/nav"');
  });

  /**
   * FR-018 — Toda capacidad que el menú declara tiene que estar en la guía, y
   * su `donde` tiene que llevar al MISMO lugar al que lleva el menú. Sin esta
   * segunda mitad, la guía podría describir `inbox.ver` mandando a Académico y
   * el test seguiría verde.
   */
  const conCapacidad = NAV_GROUPS.flatMap((g) =>
    g.items.filter((i): i is typeof i & { capability: Capability } => i.capability !== null)
  );

  it("el menú declara capacidades (si no, este bloque no probaría nada)", () => {
    expect(conCapacidad.length).toBeGreaterThan(0);
  });

  for (const item of conCapacidad) {
    it(`«${item.capability}» (${item.label}) está en la guía y apunta a su destino`, () => {
      const entrada = GUIA_CAPACIDADES[item.capability];
      expect(entrada, `el menú declara ${item.capability} y la guía no la describe`).toBeTruthy();
      const destinos = DESTINOS_MENU.filter(
        (d) => d.capability === item.capability
      ).map((d) => d.href);
      expect(
        destinos,
        `la guía manda «${item.capability}» a «${entrada.donde}», y el menú la lleva a ${destinos.join(" o ")}`
      ).toContain(rutaDeDonde(entrada.donde));
    });
  }

  /**
   * La prosa se apoya en los rótulos del menú ("Académico → la cohorte →
   * Evaluación"). Si alguien renombra un ítem del menú, esos `donde` se
   * quedan hablando de una pantalla que ya no se llama así, y nadie lo
   * notaría hasta que un usuario preguntara — que es el problema de origen.
   */
  it("todo primer tramo en prosa es un rótulo del menú que existe hoy", () => {
    const rotulos = new Set(DESTINOS_MENU.map((d) => d.label));
    for (const cap of CAPABILITIES) {
      const { donde } = GUIA_CAPACIDADES[cap];
      if (donde.startsWith("/")) continue;
      const primero = donde.split("→")[0]!.trim();
      expect(
        rotulos.has(primero),
        `«${primero}» (en el «donde» de ${cap}) no es un rótulo del menú: ${[...rotulos].join(", ")}`
      ).toBe(true);
    }
  });
});

describe("FR-010/FR-018 — la guía del portal cubre todo el menú del portal", () => {
  it("cada ítem del alumno está descrito", () => {
    for (const item of ITEMS_ALUMNO) {
      const texto = GUIA_PORTAL_ALUMNO[item.href];
      expect(texto, `«${item.label}» (${item.href}) no está en la guía del alumno`).toBeTruthy();
      expect(texto.trim().length, `«${item.label}» está en blanco`).toBeGreaterThan(12);
    }
  });

  it("cada ítem del profesor está descrito", () => {
    for (const item of ITEMS_PROFESOR) {
      const texto = GUIA_PORTAL_PROFESOR[item.href];
      expect(texto, `«${item.label}» (${item.href}) no está en la guía del profesor`).toBeTruthy();
      expect(texto.trim().length, `«${item.label}» está en blanco`).toBeGreaterThan(12);
    }
  });

  it("y no describe pantallas que el portal no tiene", () => {
    expect(Object.keys(GUIA_PORTAL_ALUMNO).sort()).toEqual(
      ITEMS_ALUMNO.map((i) => i.href as string).sort()
    );
    expect(Object.keys(GUIA_PORTAL_PROFESOR).sort()).toEqual(
      ITEMS_PROFESOR.map((i) => i.href as string).sort()
    );
  });

  it("las rutas del portal existen", () => {
    for (const item of [...ITEMS_ALUMNO, ...ITEMS_PROFESOR]) {
      expect(RUTAS.has(item.href), `${item.href} no existe bajo src/app/`).toBe(true);
    }
  });
});

describe("FR-011/SC-004 — el portal no habla el idioma del staff", () => {
  /**
   * **La asimetría que hace que reusar la guía del staff sea directamente
   * malo.** El staff tiene un problema de escalamiento interno —a quién le
   * pido—; el alumno no: su camino es escribirle a la academia. Listarle
   * capacidades o roles sería exponerle el organigrama a una audiencia
   * externa, sin ningún beneficio.
   *
   * Y `cobranza.ver` no significa nada para alguien que no tiene ninguna
   * capacidad. Este caso mira el TEXTO que se le muestra, no la intención.
   */
  const TEXTO_PORTAL = [
    ...Object.values(GUIA_PORTAL_ALUMNO),
    ...Object.values(GUIA_PORTAL_PROFESOR),
    readFileSync(
      path.join(process.cwd(), "src/app/(portal)/portal/guia/page.tsx"),
      "utf8"
    ),
    readFileSync(path.join(process.cwd(), "src/lib/guia-portal.ts"), "utf8"),
  ].join("\n");

  it("no nombra ninguna capacidad", () => {
    const filtradas = CAPABILITIES.filter((c) => TEXTO_PORTAL.includes(c));
    expect(
      filtradas,
      `la guía del portal nombra capacidades del staff: ${filtradas.join(", ")}`
    ).toEqual([]);
  });

  it("no nombra ningún rol del staff, ni por su llave ni por su nombre", () => {
    const nombrados = SYSTEM_ROLES.flatMap((r) => [r.key, r.name]).filter((n) =>
      TEXTO_PORTAL.toLowerCase().includes(n.toLowerCase())
    );
    expect(
      nombrados,
      `la guía del portal nombra roles del staff: ${nombrados.join(", ")}`
    ).toEqual([]);
  });

  it("no manda a ninguna pantalla del panel", () => {
    const delPanel = DESTINOS_MENU.map((d) => d.href).filter(
      (href) => href !== "/" && TEXTO_PORTAL.includes(`"${href}"`)
    );
    expect(
      delPanel,
      `la guía del portal enlaza pantallas del panel: ${delPanel.join(", ")}`
    ).toEqual([]);
  });

  /**
   * FR-009 — Su propia superficie: la guía del portal no importa la del
   * staff. Compartir el módulo sería compartir el vocabulario, y el `if` que
   * separa las dos audiencias terminaría adentro de un archivo que las dos
   * leen (Principio 3 del roadmap; misma decisión que `PortalNav` con
   * `AppNav`).
   */
  it("no reusa el registro del staff", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/app/(portal)/portal/guia/page.tsx"),
      "utf8"
    );
    expect(src.includes('from "@/lib/guia"')).toBe(false);
    expect(src.includes("GUIA_CAPACIDADES")).toBe(false);
  });
});

describe("FR-008/FR-012 — el enlace a la guía existe y no pide permiso", () => {
  /**
   * **Un manual que hay que tener permiso para leer no es un manual.** El
   * ítem se declara con `capability: null`, como el Dashboard.
   */
  it("el ítem del staff no exige capacidad", () => {
    const guia = DESTINOS_MENU.find((d) => d.href === "/guia");
    expect(guia, "la guía no está declarada en la navegación del staff").toBeTruthy();
    expect(guia!.capability).toBeNull();
  });

  it("la guía del staff vive en la zona inferior, junto a Ajustes", () => {
    const guia = DESTINOS_MENU.find((d) => d.href === "/guia");
    const ajustes = DESTINOS_MENU.find((d) => d.href === "/settings");
    expect(guia!.grupo, "la guía es una utilidad, no un módulo de trabajo").toBeNull();
    expect(ajustes!.grupo).toBeNull();
  });

  it("la guía del portal está fuera de los grupos de alumno y de profesor", () => {
    const hrefs = [...ITEMS_ALUMNO, ...ITEMS_PROFESOR].map((i) => i.href as string);
    expect(hrefs).not.toContain("/portal/guia");
    const src = readFileSync(
      path.join(process.cwd(), "src/components/portal/portal-nav.tsx"),
      "utf8"
    );
    expect(src).toContain("ITEM_GUIA_PORTAL");
  });

  it("las dos guías existen como página", () => {
    expect(RUTAS.has("/guia")).toBe(true);
    expect(RUTAS.has("/portal/guia")).toBe(true);
  });
});

describe("FR-005/FR-014 — la guía del staff filtra en el servidor y no toca datos", () => {
  const PAGINA = readFileSync(
    path.join(process.cwd(), "src/app/(app)/guia/page.tsx"),
    "utf8"
  );

  /**
   * FR-005 — El filtro tiene que vivir donde vive la decisión. Mandar el mapa
   * entero al navegador y filtrarlo ahí deja las 17 capacidades en el HTML de
   * alguien que tiene 14: no es una fuga grave, pero es exactamente la clase
   * de descuido que después se copia a una pantalla donde sí importa.
   */
  it("se arma con `sessionCapabilities`, en el servidor", () => {
    expect(PAGINA).toContain("sessionCapabilities");
    expect(
      PAGINA.includes('"use client"'),
      "la guía del staff se volvió un componente de cliente"
    ).toBe(false);
  });

  /**
   * FR-014 — La única lectura es `listRoles`, que ya está acotada por
   * organización. Una guía que consultara alumnos o cuotas para explicar cómo
   * funciona el sistema estaría leyendo datos de gente para nada.
   */
  it("la única lectura es `listRoles`", () => {
    const prohibidos = [
      "@/server/billing",
      "@/server/student-record",
      "@/server/classes",
      "@/server/attendance",
      "@/lib/db",
    ];
    for (const modulo of prohibidos) {
      expect(
        PAGINA.includes(modulo),
        `la guía consulta datos de dominio (${modulo}): FR-014 dice que no`
      ).toBe(false);
    }
    expect(PAGINA).toContain("listRoles");
  });

  /**
   * DV-001 — Lo primero que la persona tiene que ver es lo que SÍ puede
   * hacer. La sección "esto lo hace otro rol" se despliega cuando hace falta,
   * y se resuelve con `<details>`: sin JS y sin una dependencia nueva
   * (FR-013).
   */
  it("«esto lo hace otro rol» viene colapsada, sin JavaScript", () => {
    expect(PAGINA).toContain("<details");
    expect(PAGINA).toContain("<summary");
    expect(
      /<details[^>]*\bopen\b/.test(PAGINA),
      "la sección secundaria viene abierta y tapa lo que la persona sí puede hacer"
    ).toBe(false);
  });

  /**
   * FR-007 — Sin enlace y sin nombres de personas. Un enlace ofrece una
   * puerta que va a devolver 403; un nombre convierte la guía en un
   * directorio, y un directorio se desactualiza con cada alta y cada baja.
   */
  it("la sección de otros roles no ofrece enlaces ni nombra gente", () => {
    const seccion = PAGINA.slice(PAGINA.indexOf("<details"));
    expect(
      seccion.includes("<Link") || seccion.includes("<a "),
      "la sección «esto lo hace otro rol» ofrece una puerta que devuelve 403"
    ).toBe(false);
    expect(
      seccion.includes("memberCount") || seccion.includes("user.name"),
      "la guía se convirtió en un directorio de personas"
    ).toBe(false);
  });
});
