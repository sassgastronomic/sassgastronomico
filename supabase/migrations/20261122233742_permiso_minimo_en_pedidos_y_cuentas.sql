-- Permiso mínimo de escritura en las tablas de pedidos y en cuentas.
--
-- Las cuatro políticas "escribir" de estas tablas eran `for all` con
-- {duenio,mostrador,mozo}, y `for all` alcanza select, insert, update y
-- delete. Con la sesión de un mozo y la clave anónima se podía, pegándole
-- directo a la API: aceptar un pedido online, borrar pedidos enteros o
-- cerrar una cuenta salteando el control de cerrar_cuenta (el que verifica
-- que no quede nada sin entregar). Que el mozo no acepte pedidos lo
-- imponían solo las funciones y las pantallas, no la base.
--
-- Nada de lo que la app hace necesita todo eso. Son seis escrituras
-- directas en tres archivos; el resto pasa por funciones `security
-- definer`, que no miran estas políticas:
--
--   pedidos                  -> ninguna escritura directa
--   pedido_item_adicionales  -> ninguna escritura directa
--   pedido_items             -> update (el mozo entrega, cocina avanza)
--   cuentas                  -> insert (abrir una mesa)
--
-- El trigger cerrar_pedido_si_completo, que pasa el pedido a `entregado`
-- cuando cae su último ítem, también es security definer: por eso sacarle
-- a todos la escritura directa de `pedidos` no corta esa cascada.
--
-- Esto no cambia *quién* entra —las condiciones de rol son las mismas—,
-- cambia *qué operaciones* le alcanzan. No toca las políticas `_leer` ni
-- las `_admin` (es_admin, que es el soporte de la plataforma).

-- 1. pedidos: la app nunca escribe directo --------------------------------
-- Insert: crear_pedido_landing y crear_pedido_mozo. Update:
-- aceptar/cancelar_pedido_landing y el trigger cerrar_pedido_si_completo.
-- Delete: nadie, nunca. Queda pedidos_leer para la pantalla.
drop policy pedidos_escribir on pedidos;

-- 2. pedido_item_adicionales: ídem ---------------------------------------
-- Se escriben solo dentro de crear_pedido_landing y crear_pedido_mozo,
-- junto con su ítem, y se van con él por la FK (on delete cascade), que
-- tampoco pasa por las políticas.
drop policy pedido_item_adicionales_escribir on pedido_item_adicionales;

-- 3. pedido_items: solo update -------------------------------------------
-- De `for all` a `for update` no se puede con alter policy (el comando de
-- una política no se cambia), así que va drop + create.
--
-- `mostrador` sale: todo lo suyo son las funciones *_pedido_landing
-- (aceptar, cancelar, editar y entregar un pedido online), y de salón
-- está afuera por rol.
--
-- `duenio` queda, y no es de adorno: la pantalla de cocina lo deja operar
-- en cualquier sector (puedeOperarEnSector, en
-- src/app/app/sector/[id]/actions.ts) y entra por esta política, no por
-- items_sector, que exige rol `sector` con ese sector asignado.
--
-- Lo que esto todavía no cierra: un update sigue pudiendo tocar cualquier
-- ítem del comercio, cualquier columna y cualquier salto de estado. Una
-- política filtra filas, no columnas ni transiciones. Eso se cierra
-- moviendo las dos escrituras a funciones (la tanda que sigue).
drop policy pedido_items_escribir on pedido_items;

create policy pedido_items_escribir on pedido_items
  for update
  using (tiene_rol(comercio_id, '{duenio,mozo}'))
  with check (tiene_rol(comercio_id, '{duenio,mozo}'));

-- 4. cuentas: solo insert ------------------------------------------------
-- Abrir una mesa es lo único que la app escribe acá. Cerrarla la hace
-- cerrar_cuenta, y angostar a insert es justo lo que impide saltearla.
-- Delete: nadie.
--
-- Cualquier mozo abre cualquier mesa del comercio, como en cualquier bar:
-- la condición es el comercio, no quién abrió la cuenta. `mozo_id` queda
-- como el registro de quién la abrió, no como un permiso.
--
-- Una política `for insert` solo lleva with check: no hay fila vieja que
-- mirar.
drop policy cuentas_escribir on cuentas;

create policy cuentas_escribir on cuentas
  for insert
  with check (tiene_rol(comercio_id, '{duenio,mozo}'));
