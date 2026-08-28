# AnimeJD · respaldo temporal de JKAnime

Extractor independiente y reanudable para completar el catálogo sin consumir D1 durante la recopilación.

## Flujo

1. `seed-queue.mjs` carga de forma idempotente los finalizados candidatos.
2. `extract-finalized.mjs` guarda ficha, miniatura, todos los servidores y descargas en Supabase temporal.
3. Cada episodio confirma su checkpoint; una ejecución posterior continúa sin repetirlo.
4. GitHub Actions corre cada seis horas, hasta 290 minutos.
5. Al completar la cola se compara otra vez con AnimeJD y se migra solo lo realmente faltante a D1 en bloques compactos.

## Seguridad

- El repositorio no contiene claves.
- Supabase tiene RLS habilitado y ninguna política pública.
- La `service_role` existe únicamente en GitHub Actions Secrets.

## Secrets requeridos

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Continuidad

Si cambia la cuenta de Codex, continuar desde `C:\Users\YOSHIRO\Desktop\animejd-jkanime-staging`. Revisar el último GitHub Action, el conteo de `jk_queue` y no reactivar el importador directo `run-jkanime-finalized-local.js`.
