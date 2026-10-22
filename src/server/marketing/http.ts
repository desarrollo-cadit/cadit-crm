import { apiError } from "@/lib/api";

/**
 * 045 — Cómo se dice cada falla del dominio de marketing en HTTP. Un solo
 * lugar: dos rutas no pueden contestar distinto el mismo error.
 */
const ESTADO: Record<string, number> = {
  not_found: 404,
  audience_not_found: 404,
  contact_not_in_audience: 404,
  campana_no_editable: 409,
  imagen_en_uso: 409,
  no_esta_enviando: 409,
  otra_campana_enviando: 409,
  campana_enviando: 409,
  invalid_body: 422,
  variable_desconocida: 422,
  enlace_invalido: 422,
  imagen_ajena: 422,
  demasiadas_imagenes: 422,
  buzon_no_listo: 422,
  buzon_no_separado: 422,
  contenido_incompleto: 422,
  audiencia_vacia: 422,
  tope_superado: 422,
  conteo_cambio: 422,
  sin_buzon: 422,
  m365_no_configurado: 422,
  too_many_requests: 429,
  envio_fallido: 502,
};

export function respuestaDeFalla(f: {
  code: string;
  message?: string;
  fields?: { path: string; message: string }[];
}): Response {
  return apiError(ESTADO[f.code] ?? 400, f.code, f.message ?? "No se pudo completar la acción.", {
    ...(f.fields ? { fields: f.fields } : {}),
  });
}
