/** Portal del profesor: horas dictadas. */

export const rol = "profesor";
export const ruta = "/portal/horas";

export async function guion(g) {
  const { page } = g;
  await page.getByText("clases dictadas", { exact: true }).waitFor({ state: "visible", timeout: 60000 });

  await g.paso("Horas dictadas resume las clases que el profesor dictó y sus horas", page.locator("div.grid").first(), { sostener: 4.5 });

  const programadas = page.getByText(/que todavía no se dictaron/).first();
  if (await programadas.isVisible().catch(() => false)) {
    await g.paso("Las clases programadas que aún no se dictaron se informan aparte y no se suman", programadas, { sostener: 4.5 });
  }

  await g.paso("El detalle muestra, por grupo, las clases dictadas y las horas", page.locator("ul.divide-y").first(), { sostener: 5 });

  await g.paso("Solo se cuentan las clases terminadas; las suspendidas no cuentan", page.getByText(/Solo se cuentan las clases que ya terminaron/), { sostener: 4.5 });

  await g.paso("El listado es informativo, para controlar la liquidación; no muestra tarifas", null, { sostener: 4 });
}
