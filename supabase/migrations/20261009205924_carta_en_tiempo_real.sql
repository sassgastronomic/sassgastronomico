-- =====================================================================
-- Realtime para lo que define la disponibilidad efectiva de la carta
-- (producto, su categoría y su sector — ver docs/SCHEMA.md): la carga de
-- pedidos del mozo (/app/salon/[id]) se suscribe a estas tablas para
-- dejar de ofrecer, sin recargar, algo que el dueño acaba de apagar.
--
-- RLS sigue mandando: Realtime solo le manda a cada usuario las filas que
-- sus policies `*_leer` (es_miembro) le dejan ver.
-- =====================================================================

alter publication supabase_realtime add table productos, categorias, sectores;
