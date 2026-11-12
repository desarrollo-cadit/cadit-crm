import { id } from "../ids.mjs";
/** Estado de cuenta del alumno dentro de su legajo. */
export const rol = "administracion";
export const ruta = `/contacts/${id("estadoDeCuenta")}/legajo`;

export async function guion(g) {
  const { page } = g;
  await page.getByRole("heading", { name: "Estado de cuenta" }).waitFor();
  const seccion = page.getByRole("heading", { name: "Estado de cuenta" }).locator("xpath=..");

  await g.paso("El legajo de un alumno incluye su estado de cuenta", page.getByRole("heading", { level: 1 }).locator("xpath=ancestor::header[1]"), { sostener: 3.2 });
  await g.paso("Solo se dibuja con el permiso de cobranza: sin él, los montos nunca llegan a la pantalla", seccion, { sostener: 4.6 });
  await g.paso("Por cada moneda se informa el total del plan, lo pagado y el saldo pendiente", seccion.locator("li").first(), { sostener: 4.4 });
  await g.paso("Si hay cuotas vencidas, se avisa con una etiqueta junto al saldo", seccion, { sostener: 3.6 });
  await g.paso("Cada cursada del alumno se detalla arriba, con su grupo y fechas", page.locator("article").first(), { sostener: 3.8 });
  await g.paso("Registrar pagos y corregir el plan se hace desde Facturación o Finanzas", null, { sostener: 3.6 });
}
