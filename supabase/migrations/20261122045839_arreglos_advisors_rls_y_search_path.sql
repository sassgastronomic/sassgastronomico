-- ---------------------------------------------------------------------
-- Dos avisos del advisor de Supabase. Ninguno de los dos cambia qué puede
-- ver o escribir nadie: el primero cierra un agujero teórico de
-- resolución de nombres, el segundo es solo velocidad.
--
-- Los dos van con `alter ...` y no con `create or replace`: así se cambia
-- únicamente lo que nombramos. Si alguien hubiera tocado el cuerpo de la
-- función o la otra cláusula de una policy directo en la base, un
-- `create or replace` con el texto viejo lo pisaría en silencio.
-- ---------------------------------------------------------------------


-- =====================================================================
-- 1. "Function Search Path Mutable": crear_zona_por_defecto
-- =====================================================================
-- Es el trigger que le crea la zona "Salón" a cada comercio nuevo
-- (ver 20260922222110_agregar_zonas_de_salon.sql). Quedó sin search_path
-- fijo cuando el resto de las funciones del proyecto sí lo tienen
-- (es_admin, es_miembro, tiene_rol, etc.).
--
-- Sin search_path fijo, `insert into zonas` se resuelve con el
-- search_path de quien dispara el trigger. Quien pudiera crear una
-- `pg_temp.zonas` haría que el insert caiga ahí en vez de en la tabla
-- real. Acá el riesgo es bajo —la función no es security definer, corre
-- con los privilegios de quien inserta en `comercios`, que ya es admin—
-- pero es una línea y nos saca el aviso.
alter function public.crear_zona_por_defecto() set search_path = public;


-- =====================================================================
-- 2. "Auth RLS Initialization Plan": cinco policies
-- =====================================================================
-- `auth.uid()` suelto dentro de una policy se evalúa UNA VEZ POR FILA:
-- Postgres lo trata como parte del filtro de cada fila. Envuelto en
-- `(select auth.uid())` pasa a ser un subplan sin referencias al
-- exterior, así que lo resuelve una sola vez por consulta y reusa el
-- valor. Es la recomendación de Supabase:
-- supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- Por qué el resultado es idéntico, no "parecido":
--
--   * auth.uid() es STABLE y sin argumentos: lee el `sub` del JWT de la
--     sesión, que no cambia durante una consulta. Evaluarlo una vez o mil
--     da el mismo uuid.
--   * Si no hay sesión, auth.uid() devuelve NULL. `(select auth.uid())`
--     también devuelve NULL (un subquery escalar de una fila con valor
--     nulo ES nulo, no "cero filas"), así que `x = (select auth.uid())`
--     sigue dando NULL y la fila sigue quedando afuera. Igual que antes.
--   * Ninguna de las cinco llamadas depende de la fila, por eso se puede
--     sacar afuera. Lo que SÍ depende de la fila queda como está: en
--     `items_sector`, `tiene_rol(comercio_id, ...)` recibe el comercio de
--     cada fila, así que esa llamada se sigue evaluando por fila a
--     propósito; de esa policy se optimiza solo el `auth.uid()` de
--     adentro del exists.
--
-- Las expresiones de abajo son las que ya estaban (salieron del dump en
-- 20260920144125_remote_schema.sql, líneas 851/921/943/986/999), con el
-- `(select ...)` agregado y nada más. En las dos policies de UPDATE se
-- toca solo el `using`: el `with check` no tiene `auth.uid()` y
-- `alter policy` deja intacta la cláusula que no se nombra.

-- comercios: cada uno ve los comercios donde es miembro.
alter policy comercios_leer on comercios
  using (
    exists (
      select 1
      from miembros
      where miembros.comercio_id = comercios.id
        and miembros.perfil_id = (select auth.uid())
    )
  );

-- perfiles: cada uno ve el suyo (y el admin, todos).
alter policy perfiles_propio on perfiles
  using (id = (select auth.uid()) or es_admin());

-- perfiles: cada uno edita el suyo. El `with check` —que impide darse
-- es_admin a uno mismo— queda tal cual.
alter policy perfiles_editar on perfiles
  using (id = (select auth.uid()) or es_admin());

-- miembros: cada uno ve sus propias membresías.
alter policy miembros_propio on miembros
  using (perfil_id = (select auth.uid()));

-- pedido_items: cocina marca los ítems de SUS sectores. El `with check`
-- (`tiene_rol(comercio_id, '{sector}')`) queda tal cual.
alter policy items_sector on pedido_items
  using (
    tiene_rol(comercio_id, '{sector}')
    and exists (
      select 1
      from miembro_sectores ms
      join miembros m on m.id = ms.miembro_id
      where ms.sector_id = pedido_items.sector_id
        and m.perfil_id = (select auth.uid())
        and m.activo
    )
  );
