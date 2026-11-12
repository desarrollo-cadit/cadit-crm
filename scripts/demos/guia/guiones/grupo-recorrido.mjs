/** Una especialización: pestaña Recorrido, módulos en orden y sus alumnos. Solo lectura. */
import { apiComo } from "../datos.mjs";

export const rol = "coordinacion";

// Se busca la especialización con módulos y alumnos (no se deja un id fijo).

const { api } = await apiComo("coordinacion");
const lista = (await api("/api/cohorts")).json?.cohorts ?? [];
const madres = lista.filter((c) => c.isSpecialization);
let madre = null;
for (const c of madres) {
  const modulos = lista.filter((m) => m.parentCohortId === c.id);
  if (modulos.length >= 3) {
    madre = c;
    break;
  }
}
if (!madre) throw new Error("no hay una especialización con módulos en la base");
export const ruta = `/cohorts/${madre.id}?tab=recorrido`;

const tarjeta = (loc) => loc.locator("xpath=ancestor::*[contains(@class,'rounded')][1]");

export async function guion(g) {
  const { page } = g;

  await g.paso(
    "En una especialización, la pestaña Recorrido aparece primero",
    page.getByRole("tab", { name: "Recorrido" }).or(page.getByRole("button", { name: "Recorrido", exact: true })),
    { sostener: 3.2 }
  );

  await g.paso(
    "Los módulos se muestran en el orden en que se cursan",
    page.getByRole("region", { name: "Módulos del programa, en orden" }),
    { sostener: 3.4 }
  );

  await g.paso(
    "Cada módulo indica profesor, fechas y clases dictadas",
    page.getByRole("region", { name: "Módulos del programa, en orden" }).locator("article").first(),
    { sostener: 3.4 }
  );

  await g.paso(
    "Las flechas cambian el orden de los módulos",
    page.getByRole("button", { name: /^Bajar Módulo 1/ }),
    { sostener: 3 }
  );

  await g.paso(
    "La grilla muestra el estado de cada alumno en cada módulo y su certificado",
    page.locator("table").first(),
    { sostener: 4 }
  );

  await g.paso(
    "Para inscribir a los alumnos en sus módulos, revise primero la vista previa",
    page.getByRole("button", { name: "Revisar inscripciones a módulos" }),
    {
      accion: "clic",
      sostener: 4,
      despues: async () => {
        await page.getByRole("region", { name: "Inscripciones a módulos" }).waitFor({ timeout: 15000 });
      },
    }
  );

  await g.paso(
    "Nada se crea hasta confirmar; las inscripciones a módulos no llevan cuotas",
    page.getByRole("region", { name: "Inscripciones a módulos" }),
    { sostener: 3.8 }
  );

  await g.paso(
    "Cada módulo tiene su propia pestaña Alumnos, a la que se llega desde su nombre",
    page.getByRole("region", { name: "Módulos del programa, en orden" }).locator("article a").first(),
    {
      accion: "clic",
      sostener: 4,
      despues: async () => {
        await page.waitForURL(/\/cohorts\//, { timeout: 15000 });
        await page.getByText("Alumnos").first().waitFor({ timeout: 15000 });
      },
    }
  );
}
