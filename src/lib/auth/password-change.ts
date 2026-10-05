import { z } from "zod";

/**
 * Cambio de contraseña: forzado en el primer ingreso y voluntario después.
 *
 * Sin dependencias de servidor a propósito: los layouts, la ruta de API y la
 * pantalla leen las mismas reglas de este archivo.
 */

export const PASSWORD_CHANGE_PATH = "/cambiar-contrasena";

/**
 * Después de elegirla se entra por `/`, igual que tras el login: la raíz
 * decide si es el panel (staff) o el portal (alumnos y profesores). Repetir
 * esa decisión acá sería otra forma de mandar a alguien a la casa equivocada.
 */
export const HOME_AFTER_PASSWORD_CHANGE = "/";

/**
 * ¿Hay que mandar a esta persona a elegir su contraseña antes de mostrarle
 * cualquier pantalla? Sí, mientras la vigente la haya elegido otra persona.
 *
 * No recibe la ruta actual porque no le hace falta para evitar el bucle: la
 * pantalla de cambio vive en el grupo `(auth)`, que no pasa por ninguno de
 * los caparazones que llaman a esta función. Ver `cambio-de-contrasena.test.ts`.
 */
export function forcedPasswordChangeRedirect(
  user: { mustChangePassword?: boolean | null } | null | undefined
): string | null {
  return user?.mustChangePassword === true ? PASSWORD_CHANGE_PATH : null;
}

/**
 * Los límites son los mismos que aplica Better Auth (`minPasswordLength: 8`,
 * máximo 128): validarlos acá devuelve un 422 en castellano en vez del error
 * en inglés de la librería.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Escribí tu contraseña actual."),
    newPassword: z
      .string()
      .min(8, "La contraseña nueva necesita al menos 8 caracteres.")
      .max(128, "La contraseña nueva puede tener hasta 128 caracteres."),
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    path: ["newPassword"],
    message: "La contraseña nueva tiene que ser distinta de la actual.",
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
