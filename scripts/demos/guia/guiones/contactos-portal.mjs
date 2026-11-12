/** Dar acceso al portal a una persona (acceso directo a un curso offline, sin inscripción). */
import { apiComo, exigir, sufijo } from "../datos.mjs";

export const rol = "direccion";
export const ruta = "/contacts";

export async function guion(g) {
  const { page } = g;
  const suf = sufijo();
  const { api } = await apiComo("direccion");
  const c = exigir("alta", await api("/api/contacts", { method: "POST", body: JSON.stringify({ firstName: "Ivana", lastName: `Portal ${suf}`, email: `ivana.${suf}@demo.test` }) })).contact;
  const hasta = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  exigir("acceso directo", await api("/api/offline-courses/ocrs_pa0b9lgbfpogloy2cr8g/grants", { method: "POST", body: JSON.stringify({ contactId: c.id, accessUntil: hasta }) }));
  await g.ir(`/contacts/${c.id}/legajo?tab=legajo`);
  await page.getByRole("heading", { name: "Acceso al portal" }).waitFor();
  g.comenzar();

  const boton = page.getByRole("button", { name: "Dar acceso al portal" });
  await g.paso("Quien solo tiene un curso offline directo también puede entrar al portal", page.getByRole("heading", { name: "Acceso al portal" }).locator("xpath=.."), { sostener: 4 });
  await g.paso("Hace falta el permiso de gestión de accesos y que la persona tenga correo", boton, { sostener: 3.6 });
  await g.paso("Al hacer clic se crea la cuenta y se intenta enviar el correo de bienvenida", boton, {
    accion: "clic",
    sostener: 3.4,
    despues: () => page.getByText("Contraseña temporal").waitFor({ timeout: 60000 }),
  });
  await g.paso(
    "La contraseña temporal se muestra una sola vez; si el correo falla, se informa y el acceso se entrega igual",
    page.getByText(/Contraseña temporal/),
    { sostener: 6 }
  );
  await g.paso("Desde ese momento la persona figura con acceso al portal", page.getByText(/Tiene acceso al portal/), { sostener: 3.6 });
  await g.paso("Para alumnos con cursada, el acceso se gestiona desde la lista del grupo", null, { sostener: 3.4 });
}
