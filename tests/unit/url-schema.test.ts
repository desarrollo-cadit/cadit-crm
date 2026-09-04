import { describe, expect, it } from "vitest";
import { httpUrl } from "@/lib/url-schema";

/**
 * 025 — La regla que ya se violó DOS VECES en el mismo ciclo.
 *
 * `z.string().url()` acepta cualquier esquema. Un `javascript:` guardado en la
 * base y pintado como `<a href>` ejecuta código en la sesión de quien lo
 * toca, y los campos que pasan por acá se pintan justo así: el enlace de la
 * clase, el de la cohorte, el material, la grabación, la sala del aula.
 *
 * La regla vivía como helper privado dentro de `src/server/courses.ts` y
 * volvió a violarse en dos lugares nuevos. Se extrajo a `src/lib/url-schema`
 * para que estuviera donde se la busca — pero al extraerla se perdió la
 * cobertura que la sostenía (`tests/unit/resources.test.ts` probaba la copia
 * vieja). Sin este archivo, nada falla si mañana alguien la "simplifica" de
 * vuelta a `z.string().url()`, y el agujero vuelve por tercera vez.
 */
describe("025 — httpUrl", () => {
  it("acepta http y https", () => {
    expect(httpUrl.safeParse("https://zoom.us/j/123").success).toBe(true);
    expect(httpUrl.safeParse("http://ejemplo.test/a").success).toBe(true);
  });

  /** El motivo entero de que este esquema exista. */
  it("rechaza javascript:, que es lo que `z.string().url()` deja pasar", () => {
    expect(httpUrl.safeParse("javascript:alert(1)").success).toBe(false);
    // Con mayúsculas intercaladas: el filtro no puede ser sensible al caso.
    expect(httpUrl.safeParse("JaVaScRiPt:alert(1)").success).toBe(false);
    // Con espacio adelante, que el `.trim()` quita antes de mirar el esquema.
    expect(httpUrl.safeParse("  javascript:alert(1)").success).toBe(false);
  });

  it("rechaza los otros esquemas que también ejecutan o filtran", () => {
    for (const v of [
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "ftp://ejemplo.test/a",
    ]) {
      expect(httpUrl.safeParse(v).success, v).toBe(false);
    }
  });

  /**
   * `https:/zoom.us` con UNA barra no es una URL absoluta, y es el error de
   * tipeo real: la persona pega mal y el enlace queda muerto en la pantalla
   * del alumno.
   */
  it("rechaza lo que no es una URL absoluta", () => {
    for (const v of ["zoom.us/j/123", "https:/zoom.us", "//zoom.us/j/1", ""]) {
      expect(httpUrl.safeParse(v).success, v).toBe(false);
    }
  });

  it("recorta los espacios del borde en vez de rechazar por ellos", () => {
    const r = httpUrl.safeParse("  https://zoom.us/j/123  ");
    expect(r.success).toBe(true);
    expect(r.success && r.data).toBe("https://zoom.us/j/123");
  });

  /**
   * El tope va con el esquema y no aparte: una URL de 40 KB no es una URL,
   * es una carga útil, y el límite tiene que viajar junto para que no se
   * olvide en el próximo campo que lo use.
   */
  it("rechaza más de 2000 caracteres", () => {
    expect(httpUrl.safeParse("https://a.test/" + "x".repeat(1985)).success).toBe(true);
    expect(httpUrl.safeParse("https://a.test/" + "x".repeat(1990)).success).toBe(false);
  });

  it("el mensaje dice qué hacer, no qué falló", () => {
    const r = httpUrl.safeParse("javascript:alert(1)");
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0]?.message).toContain("http://");
  });
});
