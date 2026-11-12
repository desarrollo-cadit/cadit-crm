/** Portal del alumno: estado de cuenta y cambio de contraseña. */
import { armarGrupo, calentar, dia, ok, para } from "./prof-ingreso.mjs";

export const rol = "alumno";

const d = await para("alu-cuenta", async () => {
  const g = await armarGrupo({ etiqueta: "Cuenta del alumno", conSantiago: true, companeros: 0, inicio: -20, fin: 40, monto: 1800000 });
  const plan = ok("cuotas", await g.staff(`/api/enrollments/${g.santiagoEnr}/installments`)).installments;
  ok("pago", await g.staff(`/api/enrollments/${g.santiagoEnr}/payments`, {
    method: "POST",
    body: { installmentId: plan[0]?.id ?? null, amount: 600000, paidAt: dia(-5), method: "transferencia", bank: "Banco de demostración" },
  }));
  await calentar("alumno", ["/portal/cuenta", "/api/portal/me/cuenta", "/cambiar-contrasena"]);
  return g;
});
export const ruta = "/portal/cuenta";

export async function guion(g) {
  const { page } = g;
  await page.getByText("Pagos registrados").first().waitFor({ state: "visible", timeout: 60000 });
  
  await g.paso("Estado de cuenta reúne las cuotas, los pagos y el saldo de cada inscripción", page.getByRole("heading", { name: "Estado de cuenta" }).locator("xpath=.."), { sostener: 4 });

  await g.paso("Las tarjetas resumen el saldo pendiente, lo pagado y el próximo vencimiento", page.getByText("Saldo", { exact: true }).first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]"), { sostener: 5 });

  await g.paso("La tabla de cuotas indica el vencimiento, el importe y el estado de cada una", page.locator("table").first(), { sostener: 5 });

  await g.paso("Una cuota puede figurar Pagada, con Pago parcial, Vencida o Pendiente", page.locator("table").first().locator("tbody tr").first(), { sostener: 4.5 });

  await g.paso("Los pagos registrados muestran la fecha, el medio y el importe", page.getByText("Pagos registrados").first().locator("xpath=.."), { sostener: 5 });

  await g.paso("La llave, al pie del menú, abre el cambio de contraseña propia", page.getByRole("link", { name: "Cambiar contraseña" }).first(), {
    accion: "clic",
    sostener: 4,
    despues: async () => {
      await page.getByRole("heading", { name: "Cambiar contraseña" }).waitFor({ state: "visible", timeout: 30000 });
    },
  });

  await g.paso("Se escribe la contraseña actual y la nueva dos veces, con al menos 8 caracteres", page.locator("form").first(), { sostener: 5 });
}
