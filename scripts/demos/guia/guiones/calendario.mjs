/** Calendario semanal: clases reales y proyectadas, filtro por profesor y carga semanal. */

export const rol = "coordinacion";
export const ruta = "/calendar";

export async function guion(g) {
  const { page } = g;
  const filtro = page.getByText("Todos los profesores").first();
  const carga = page.getByRole("heading", { name: "Carga de la semana" }).locator("xpath=ancestor::div[1]");

  await g.paso("El calendario muestra las clases de la semana de todos los grupos", page.getByText(/nov.? 2026/i).first().locator("xpath=ancestor::div[2]"), { sostener: 3.6 });

  await g.paso("Las flechas cambian de semana y «Hoy» vuelve a la actual", page.getByRole("button", { name: "Hoy" }), {
    accion: "clic", sostener: 3.4,
  });

  await g.paso("Las clases con borde punteado son proyecciones: se vuelven reales al generar el cronograma", page.locator("[title*=royec]").first(), { sostener: 4.6 });

  await g.paso("La clase de borde sólido ya existe en el cronograma del grupo", page.getByText('MVOT').first(), { sostener: 3.8 });

  await g.paso("«Carga de la semana» suma clases y horas por profesor, sin importes", carga, { sostener: 4.6 });

  await g.paso("La columna Avisos señala clases del mismo profesor que se superponen", page.getByText(/superpuestas/).first().locator("xpath=ancestor::tr[1]"), { sostener: 4 });

  await g.paso("El filtro «Todos los profesores» limita el calendario a uno o varios docentes", filtro, {
    accion: "clic", sostener: 4,
    despues: async () => {
      await page.getByText("Florencia Pintos").first().click().catch(() => {}); await g.pausa(1);
    },
  });
}
