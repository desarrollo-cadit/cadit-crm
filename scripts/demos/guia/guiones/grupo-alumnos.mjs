/** La pestaña Alumnos de un grupo: lista, detalle, exportación y estado de cuenta. Solo lectura. */
import { apiComo } from "../datos.mjs";

export const rol = "coordinacion";



// Un grupo con varias páginas de alumnos y cobranza cargada (no se deja un id fijo).
const { api } = await apiComo(rol);
const lista = (await api("/api/cohorts")).json?.cohorts ?? [];
const elegido = lista
  .filter((c) => !c.isSpecialization && !c.parentCohortId && (c.enrolledCount ?? 0) >= 12)
  .sort((a, b) => (b.enrolledCount ?? 0) - (a.enrolledCount ?? 0))[0];
if (!elegido) throw new Error("no hay un grupo con alumnos suficientes");
export const ruta = `/cohorts/${elegido.id}?tab=alumnos`;

export async function guion(g) {
  const { page } = g;
  const tabla = page.locator("table").first();

  await g.paso("La pestaña Alumnos lista a todas las personas inscriptas en el grupo", page.getByRole("heading").first().locator("xpath=ancestor::header[1]"), { sostener: 3.2 });

  await g.paso("Cada fila trae contacto, monto, vendedor, licencia y avance de onboarding", tabla, { sostener: 4 });

  await g.paso(
    "El nombre del alumno abre su legajo",
    tabla.locator("tbody tr").first().locator("a").first(),
    { sostener: 3 }
  );

  await g.paso(
    "La flecha de cada fila despliega el detalle del alumno",
    tabla.getByRole("button", { name: "Ver detalle" }).first(),
    {
      accion: "clic",
      sostener: 3.4,
      despues: async () => {
        await page.getByText("Tenía licencia propia").first().waitFor({ timeout: 15000 });
      },
    }
  );

  await g.paso(
    "Allí se ven las licencias, su correo, el checklist y el acceso al portal",
    page.getByText("Tenía licencia propia").first().locator("xpath=ancestor::td[1]"),
    { sostener: 4.2 }
  );

  await g.paso(
    "Con permiso de cobranza, abajo se ven los datos comerciales y las cuotas y pagos",
    page.getByText(/Cédula:/).first().locator("xpath=ancestor::td[1]"),
    { sostener: 4.2 }
  );

  await g.paso(
    "Exportar descarga la lista del grupo, común o para licenciamiento",
    page.getByRole("button", { name: /Exportar/ }),
    {
      accion: "clic",
      sostener: 3.8,
      despues: async () => {
        await page.getByText("Exportar para licenciamiento").waitFor({ timeout: 10000 });
      },
    }
  );
}
