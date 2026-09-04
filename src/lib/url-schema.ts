import { z } from "zod";

/**
 * 025 — La única validación de URL para todo campo que termina en un `href`.
 *
 * `z.string().url()` **acepta cualquier esquema**, `javascript:` incluido. Un
 * enlace así guardado en la base y pintado como `<a href>` ejecuta código en
 * la sesión de quien lo toca — y los campos que caen acá se pintan justo así:
 * el enlace de la clase, el de la cohorte, el material, la grabación.
 *
 * Vivía como un helper privado dentro de `src/server/courses.ts`, y el ciclo
 * 025 agregó `meetingUrl` en dos lugares nuevos usando `z.string().url()` a
 * secas. Ese es el motivo de moverlo: una regla de seguridad escondida en un
 * módulo se vuelve a violar en el siguiente, no por descuido sino porque no
 * está donde se la busca.
 *
 * El tope de 2000 va junto y no aparte: una URL de 40 KB no es una URL, es una
 * carga útil, y el límite tiene que viajar con el esquema para que no se
 * olvide en el próximo campo.
 */
export const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (v) => /^https?:\/\//i.test(v),
    "Debe ser una URL que empiece con http:// o https://"
  );
