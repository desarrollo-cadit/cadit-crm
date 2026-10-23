# Contrato — Importar historial (US6)

Puerta: `requireCapability("historial.importar")` en todas. Errores con la
forma de `apiError`. Cuerpos con Zod `.strict()`.

```ts
Mapeo = { cursos: Record<string, string | null>; vendedores: Record<string, string | null> }
Problema = { fila: number; motivo: string }
```

## POST `/api/historial/importaciones/analizar`

**Body**: `{ csv: string (≤ 2 MB) }`. No escribe nada.

**200**
```ts
{
  totalFilas: number;
  filasValidas: number;
  problemas: Problema[];
  cursos: { label: string; filas: number; sugerido: string | null }[];
  vendedores: { raw: string; filas: number; sugerido: string | null }[];  // sin la clave vacía
  catalogo: { id: string; name: string }[];   // sin talleres
  sellers: { id: string; name: string }[];    // sin archivados
}
```
**422** `invalid_csv` (encabezado distinto o archivo vacío).

## POST `/api/historial/importaciones/vista-previa`

**Body**: `{ csv: string; mapeo: Mapeo }`. No escribe nada (FR-016).

**200**
```ts
{
  contactos: { crear: number; completar: number; sinCambios: number };
  empresas: { crear: number };
  cursadas: { nuevas: number; yaPresentes: number };
  problemas: Problema[];
}
```
**422** `invalid_mapping` (falta un curso o un vendedor, o un id que no es de la organización).

## POST `/api/historial/importaciones`

Confirma: crea la importación con las filas válidas pendientes.
**Body**: `{ csv: string; mapeo: Mapeo; fileName?: string }` · **201** `ImportacionDto`.

## POST `/api/historial/importaciones/[id]/aplicar`

Aplica la siguiente tanda (300 filas) en la transacción del pedido.
**200** `ImportacionDto` (`status: "aplicada"` al terminar) · **404** ·
**409** `no_aplicable` si está deshecha.

## GET `/api/historial/importaciones`

**200** `{ importaciones: ImportacionDto[] }` (más reciente primero).

## DELETE `/api/historial/importaciones/[id]`

"Deshacer esta importación": borra sus cursadas históricas; contactos y
empresas quedan. **200** `ImportacionDto` (`status: "deshecha"`) · **404**.

```ts
ImportacionDto = {
  id: string; sourceLabel: string; fileName: string | null;
  status: "aplicando" | "aplicada" | "deshecha";
  totalRows: number; processedRows: number; problemRows: number;
  contactsCreated: number; contactsCompleted: number; companiesCreated: number;
  takingsCreated: number; takingsExisting: number;
  importedByName: string | null; createdAt: string; finishedAt: string | null; undoneAt: string | null;
}
```
