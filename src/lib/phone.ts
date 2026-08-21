/**
 * 007 — Normalización del teléfono ESCRITO A MANO (formulario público del
 * sitio, alta manual de una inscripción, importación de planillas) a la
 * misma forma con la que llega un mensaje de WhatsApp: solo dígitos y con
 * código de país.
 *
 * Por qué existe aparte de `normalizeMx` (src/lib/meta/client.ts): esa
 * función resuelve un caso específico de México (el prefijo 521 que Meta
 * agrega a los móviles) y deja intacto todo lo demás. Con una academia
 * uruguaya eso significa guardar "098 574 165" tal cual, mientras que el
 * mismo contacto escribiendo por WhatsApp llega como "59898574165" — dos
 * contactos para la misma persona, con `wa_identity` distinto.
 *
 * `normalizeMx` sigue siendo la de la CAPA DE WHATSAPP (ingesta y envío) y
 * no se toca: ahí los números ya vienen en formato internacional.
 */

/** País por defecto cuando el número viene sin código: Uruguay. */
const DEFAULT_COUNTRY = "598";

export function normalizePhoneInput(raw: string): string | null {
  const s = (raw || "").trim();
  if (!s) return null;

  // Un "+" o un "00" delante significa que el número YA trae su país
  // (los alumnos son de Uruguay, Paraguay, República Dominicana y España).
  const international = s.startsWith("+") || /^00\d/.test(s);
  let d = s.replace(/\D/g, "");
  if (international) d = d.replace(/^0+/, "");
  if (!d) return null;

  // México: Meta agrega un "1" a los móviles (521XXXXXXXXXX). Vocero ya
  // colapsaba ese prefijo y se mantiene, porque el CRM no es solo de esta
  // academia: perderlo duplicaría contactos en cualquier instancia mexicana.
  if (/^521\d{10}$/.test(d)) return `52${d.slice(3)}`;
  if (d.startsWith("598") && d.length >= 11) return d;
  if (d.startsWith("595") && d.length >= 12) return d;
  if (international && d.length >= 8) return d;
  // Uruguay sin código de país: "098 574 165" (0 + 8 dígitos) o "99725527".
  if (d.startsWith("0") && d.length === 9) return `${DEFAULT_COUNTRY}${d.slice(1)}`;
  if (d.length === 8) return `${DEFAULT_COUNTRY}${d}`;
  if (d.length === 9) return `${DEFAULT_COUNTRY}${d.slice(1)}`;
  // 10+ dígitos sin "+" ni "00": ya trae el país escrito a mano.
  if (d.length >= 10) return d;
  return null;
}

/**
 * Igual que `normalizePhoneInput` pero nunca devuelve null: si el formato no
 * se reconoce, deja los dígitos como vinieron. Para los puntos donde el
 * teléfono es obligatorio y ya pasó una validación previa (el schema del
 * formulario público exige 7-15 dígitos), y perder el dato sería peor que
 * guardarlo sin normalizar.
 */
export function normalizePhoneOrRaw(raw: string): string {
  return normalizePhoneInput(raw) ?? raw.replace(/\D/g, "");
}
