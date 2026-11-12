/** Ingresar al panel, cambiar la contraseña propia y cerrar sesión. */

export const rol = "publico";
export const ruta = "/login";

const CORREO = "demo.direccion@demo.test";
const CLAVE = "Demo-Guia-2026"; // contraseña de demostración

export async function guion(g) {
  const { page } = g;
  const correo = page.getByLabel("Correo");
  const clave = page.getByLabel("Contraseña", { exact: true });
  const entrar = page.getByRole("button", { name: "Entrar" });

  await g.paso("La pantalla de acceso pide el correo registrado y la contraseña", page.locator("form"), {
    sostener: 5,
    despues: async () => {
      await g.escribir(correo, CORREO);
      await g.escribir(clave, "clave-equivocada");
    },
  });

  await g.paso("Si los datos no coinciden, aparece un aviso y no se ingresa", entrar, {
    accion: "clic",
    despues: async () => {
      await page.locator("#login-error").waitFor({ state: "visible", timeout: 10000 });
    },
  });

  await g.paso(
    "El ojo muestra lo escrito para comprobar la contraseña antes de entrar",
    page.getByRole("button", { name: "Mostrar la contraseña" }),
    {
      accion: "clic",
      sostener: 4.5,
      despues: async () => {
        await g.escribir(clave, CLAVE);
      },
    }
  );

  await g.paso("Con los datos correctos, el botón Entrar abre el inicio del panel", entrar, {
    accion: "clic",
    sostener: 4,
    despues: async () => {
      await page.getByRole("heading", { name: /^Hola,/ }).waitFor({ state: "visible", timeout: 30000 });
    },
  });

  await g.paso(
    "La llave, al pie de la barra lateral, abre el cambio de la contraseña propia",
    page.getByRole("link", { name: "Cambiar contraseña" }),
    {
      accion: "clic",
      sostener: 4.5,
      despues: async () => {
        await page.getByRole("heading", { name: "Cambiar contraseña" }).waitFor({ state: "visible", timeout: 20000 });
      },
    }
  );

  await g.paso("Se escribe la contraseña actual y la nueva dos veces, con al menos 8 caracteres", page.locator("form"), {
    sostener: 5,
  });

  await g.paso("Con una contraseña temporal entregada por la academia, este cambio se exige al primer ingreso", null, {
    sostener: 4.5,
  });

  // Se vuelve sin cambiar nada: la contraseña de demostración no se toca.
  await page.getByRole("link", { name: "Volver sin cambiarla" }).click();
  await page.getByRole("button", { name: "Cerrar sesión" }).waitFor({ state: "visible", timeout: 30000 });

  await g.paso("Cerrar sesión, al pie de la barra lateral, devuelve a la pantalla de acceso", page.getByRole("button", { name: "Cerrar sesión" }), {
    accion: "clic",
    sostener: 4.5,
    despues: async () => {
      await page.getByRole("heading", { name: "Iniciar sesión" }).waitFor({ state: "visible", timeout: 20000 });
    },
  });
}
