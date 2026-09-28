/**
 * cursos-offline T11b — The editor's one way of calling the staff API.
 *
 * Success bodies are the data itself (`{ id, position }`, `{ ids }`…); errors
 * are `{ error: { code, message } }` and the message is shown AS IS: the
 * server already says it in Spanish and knows why (409 `has_history`, 422
 * `invalid_answers`…). A network failure is folded into the same shape so
 * every caller has one branch for "it did not work".
 */

export type ApiFailure = { ok: false; status: number; code: string; message: string };
export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

export const coursePath = (courseId: string) => `/api/offline-courses/${courseId}`;

export async function callApi<T = unknown>(
  url: string,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown
): Promise<ApiResult<T>> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined || isForm ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, code: "network", message: "No se pudo conectar con el servidor. Probá de nuevo." };
  }
  const json = (await res.json().catch(() => null)) as unknown;
  if (res.ok) return { ok: true, data: json as T };
  const error = (json as { error?: { code?: string; message?: string } } | null)?.error;
  return {
    ok: false,
    status: res.status,
    code: error?.code ?? "error",
    message: error?.message ?? `No se pudo completar la acción (error ${res.status}).`,
  };
}
