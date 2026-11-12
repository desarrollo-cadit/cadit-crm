/** Cursos offline: la biblioteca, el detalle de un curso y quiénes tienen acceso. */

export const rol = "coordinacion";
export const ruta = "/cursos-offline";

export async function guion(g) {
  const { page } = g;
  const tarjeta = page.getByRole("link", { name: /Revit® Básico 2025/ });

  await g.paso(
    "La biblioteca reúne los cursos offline: guías teóricas y cuestionarios",
    page.getByRole("heading", { name: "Cursos offline" }).locator("xpath=ancestor::header[1]"),
    { sostener: 3.8 }
  );

  await g.paso(
    "Cada tarjeta indica si está publicado o en borrador, y cuántas lecciones, temas y cuestionarios tiene",
    tarjeta,
    { sostener: 4.6 }
  );

  await g.paso("Al abrir un curso se ven sus lecciones, temas y cuestionarios", tarjeta, {
    accion: "clic",
    sostener: 3,
    despues: () => page.getByRole("heading", { name: /Quiénes tienen acceso/ }).waitFor(),
  });

  await g.paso(
    "«Quiénes tienen acceso» muestra a cada persona, de qué grupo o acceso directo viene y hasta cuándo",
    page.getByRole("heading", { name: /Quiénes tienen acceso/ }).locator("xpath=ancestor::section[1]"),
    { sostener: 5 }
  );

  const leccion = page.locator("section[aria-labelledby=lecciones] details").first();
  await g.paso("Cada lección agrupa sus temas; al abrir un tema se ve su contenido y su video", leccion, {
    sostener: 4.4,
    despues: () => leccion.locator("summary").first().click(),
  });

  await g.paso(
    "Cada cuestionario indica el porcentaje para aprobar y cuántos intentos permite",
    page.getByText(/Aprueba con/).first().locator("xpath=ancestor::div[2]"),
    { sostener: 5 }
  );
}
