# Quickstart — probar 046 en local

El dueño decidió **no correr E2E en vivo** en esta etapa. La verificación
automática es el gate técnico más el PostgreSQL descartable de §2; lo de §4
queda **pendiente de verificación humana**.

## 1. Gate técnico

```bash
pnpm typecheck && pnpm lint && pnpm test
```

## 2. Migración en un PostgreSQL descartable

Sin tocar las bases locales de `.env`:

```bash
initdb -D "$SCRATCH/pg46" -U postgres -A trust
pg_ctl -D "$SCRATCH/pg46" -o "-p 55446" -l "$SCRATCH/pg46.log" start
createdb -h localhost -p 55446 -U postgres cadit46
DATABASE_URL=postgres://postgres@localhost:55446/cadit46 pnpm db:migrate   # 0000 → 0072
psql -h localhost -p 55446 -U postgres cadit46 -f drizzle/0072_rutas_entre_cursos.sql   # 2ª vez: sin error
psql -h localhost -p 55446 -U postgres cadit46 -c "select relrowsecurity from pg_class where relname='course_route'"
pg_ctl -D "$SCRATCH/pg46" stop
```

Esperado: `relrowsecurity = t`, la política `tenant_isolation` existe, y un
`insert` con `from_course_id = to_course_id` falla por `course_route_no_self`.

## 3. Producción

- La 0072 se aplica sola al arrancar el contenedor. No hay variables de
  entorno nuevas ni capacidades nuevas.
- Después del deploy, Coordinación carga las rutas desde Académico → Cursos
  → "Cursos siguientes". Sin rutas, "Le podría interesar" no aparece y el
  atajo de audiencias no excluye a nadie.

## 4. Pendiente de verificación humana

1. Ficha de un exalumno → pestaña Seguimiento: el historial muestra cada
   curso con su estado y grupo; un grupo que nunca salió no figura.
2. Académico → Cursos → "Cursos siguientes" de un curso: agregar dos,
   reordenar, quitar uno, guardar; la fila muestra "Siguen: …".
3. Seguimiento de alguien que aprobó ese curso: "Le podría interesar" con el
   próximo grupo; sin cursos, la sección no aparece.
4. Marketing → nueva audiencia → "Historial de cursos": "aprobó A" + "no hizo
   B" da la cantidad esperada y los excluidos por baja siguen contados aparte.
5. Marketing → Recompra: tasa, días promedio y pares; cambiar el período
   recalcula.

## 5. Importar el historial 2020–2024 (US6)

En producción, en este orden:

1. **Respaldo antes de importar**: un respaldo de la base (Coolify → Backups,
   o `pg_dump`) inmediatamente antes. "Deshacer" borra las cursadas
   históricas, pero no los contactos ni las empresas creados.
2. Deploy: la 0073 se aplica sola y le da `historial.importar` a Dirección.
3. Ajustes → Importar historial → subir `historial-limpio.csv`.
4. Paso 1: revisar cada curso (preelegido si coincide) y cada vendedor.
5. Paso 2: leer la vista previa y las filas con problemas.
6. Paso 3: confirmar y esperar a que termine (si se corta, "Continuar").
7. Verificación humana: dos fichas de exalumnos (Seguimiento) con la insignia
   "Registro histórico"; Marketing → Recompra con "Todo".
