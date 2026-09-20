# Esquema de datos — SaaS gastronómico (Plan 1)

Contexto para desarrolladores y asistentes de IA. La fuente de verdad del esquema son las migraciones en `supabase/migrations/` (Supabase CLI) — ver "Cómo cambiar el esquema" más abajo. `docs/schema-inicial.sql` es una foto histórica de antes de migrar a este flujo (hasta el sprint 3, cuando el SQL se corría a mano en el editor de Supabase); queda solo de referencia, no se mantiene al día.

## Producto en una línea

App web multi-comercio (SaaS) para bares, restós y take away. Organiza pedidos y comandas. **No maneja pagos ni facturación.**

## Stack

- Next.js (App Router) + TypeScript
- Supabase: Postgres, Auth, Realtime, Row Level Security (RLS)
- Vercel (hosting)

## Cómo cambiar el esquema

Desde el sprint 3, todo cambio de base pasa por una migración de Supabase CLI — nunca más SQL suelto pegado a mano en el editor de Supabase (así el repo y la base nunca se desincronizan).

1. `npx supabase migration new <nombre-descriptivo>` — crea un archivo vacío y con timestamp en `supabase/migrations/`.
2. Escribir el SQL del cambio ahí adentro (y nada más que ese cambio: una migración, un propósito).
3. `npx supabase db push` — la aplica contra el proyecto de Supabase real. Este paso lo corre la persona, no el asistente.

`supabase/migrations/` es la fuente de verdad del esquema. Antes de este flujo se armaba a mano `docs/schema-inicial.sql` (ver la nota al principio de ese archivo) — queda como referencia histórica, no se vuelve a tocar.

## Reglas de oro

1. **Toda tabla de negocio lleva `comercio_id`.** Las políticas RLS filtran por ahí: un comercio nunca ve datos de otro.
2. **No se borra, se desactiva.** Productos, adicionales, mesas y usuarios usan `activo = false`. Los pedidos viejos siguen intactos.
3. **Los pedidos guardan copias** de nombre, precio y sector de productos y adicionales. Cambiar la carta no altera el historial.
4. **El plan del comercio decide qué se ve y qué se permite.** No se mueven ni borran datos al cambiar de plan.
5. **No hay pagos online.** Los comercios los crean los admins (nosotros) y activan/suspenden el plan a mano.
6. **Toda función nueva en el esquema `public` revoca `EXECUTE` de `PUBLIC` y de `anon` explícitamente.** Ver "Funciones nuevas" más abajo.

### Funciones nuevas

Postgres otorga `EXECUTE` a `PUBLIC` automáticamente al crear una función (`CREATE FUNCTION`), salvo que se revoque a mano — y `PUBLIC` no es "el rol `anon`", es un pseudo-rol que agrupa a *todos* los roles, `anon` y `authenticated` incluidos. Por eso revocar (o simplemente no otorgar) a `anon`/`authenticated` puntualmente **no alcanza**: si nunca se corre el `revoke`, el permiso les sigue llegando por `PUBLIC` igual.

Regla: toda función nueva en `public` lleva, en su misma migración e inmediatamente después de su definición (`create or replace function ... end $$;`), este patrón:

```sql
revoke execute on function nombre_funcion(tipos, de, los, argumentos) from public, anon;
grant execute on function nombre_funcion(tipos, de, los, argumentos) to authenticated;
-- + `, anon` en el grant de arriba únicamente si la función es parte de la
-- API pública (piensa: se llama desde una pantalla sin sesión, como la
-- landing o el QR de mesa — hoy son `carta_publica` y `crear_pedido_landing`).
```

- Casi ninguna función necesita `anon`: la mayoría solo las llama la app ya logueada (rol `authenticated`), o las invoca otra función/trigger/policy dentro de una transacción de un usuario logueado.
- Las funciones `security definer` (la mayoría acá) igual necesitan que quien las invoca tenga `EXECUTE`: `security definer` cambia con qué permisos corre el *cuerpo* de la función una vez adentro, no quién puede *llamarla* desde afuera.
- El `revoke` explícito de `anon` (además de `public`) es redundante en los hechos — revocar de `PUBLIC` ya le saca el acceso heredado — pero se deja igual de explícito, a propósito, para que quede a la vista sin tener que razonar la cadena de herencia cada vez.
- Un `EXECUTE` otorgado a `authenticated` no es "solo para dueños": lo tiene *cualquier* sesión logueada de *cualquier* comercio, cualquier rol. Si la función responde algo que no debería ver cualquier miembro de cualquier comercio (ver `usuario_disponible` más abajo, que consulta a través de todos los comercios), el candado real tiene que ir *adentro* de la función (un chequeo con `raise exception` si no corresponde), no en el grant.
- Esta regla se sumó en el sprint 3 y ya se aplicó retroactivamente a todas las funciones existentes a esa fecha (helpers de permisos, triggers, `carta_publica`, `crear_pedido_landing`, etc.), no solo a las nuevas del sprint. Cualquier función que se agregue de acá en adelante también tiene que llevarla.
- Los triggers (`crear_perfil_nuevo_usuario`, `asignar_numero_pedido`, `validar_limite_usuarios`, etc.) llevan el `revoke` pero **sin** `grant` a ningún rol: nadie los invoca directo, el motor los dispara solo al ocurrir el evento (`insert`/`update` de la tabla), y eso no requiere `EXECUTE` de quien dispara el evento — revocar `PUBLIC` no rompe el trigger.

## Planes

| Plan | Take away / delivery | Salón (mesas, mozos, QR) |
| --- | --- | --- |
| `take_away` | Sí | No |
| `salon` | No | Sí |
| `completo` | Sí | Sí |

- Todos incluyen: roles, carta, adicionales, sectores y pantallas por sector.
- Límite de usuarios activos: **10 por defecto** (`comercios.limite_usuarios`). Los admins lo suben a 15/20 si el local paga el extra.

### Cambio de plan (bajar)

- **Pierde salón:** mesas e historial quedan ocultos. El admin no puede cambiar el plan si hay `cuentas` abiertas.
- **Pierde take away:** la landing muestra "no disponible". El admin no puede cambiar el plan si hay pedidos `pendiente_confirmar`.
- **Roles que ya no aplican** (ej. `mozo` en plan `take_away`): no pueden entrar y **no cuentan** para el límite.
- **Baja del límite de usuarios:** no se desactiva a nadie automáticamente; el dueño no puede crear nuevos hasta quedar por debajo.
- Si el local vuelve a subir de plan, recupera todo tal cual.

### Comercio suspendido

`comercios.estado = 'suspendido'` → sus usuarios no acceden a datos (RLS) y la app muestra un aviso. La landing pública muestra "no disponible".

## Roles

| Rol | Qué hace |
| --- | --- |
| `duenio` | Todo en su comercio: carta, mesas, usuarios, pedidos |
| `mostrador` | Confirma/rechaza pedidos de la landing, edita y cancela pedidos, entrega take away |
| `mozo` | Abre/cierra mesas, carga rondas, escanea QR, marca ítems entregados |
| `sector` | Ve la pantalla y cambia el estado de los ítems de los sectores que tiene asignados |

- Los **admins** (`perfiles.es_admin`) son del equipo del producto, no de un comercio. Ven y gestionan todo desde el panel de administrador.
- Los admins crean el comercio y el usuario dueño. El dueño crea a su personal.
- El dueño gestiona a su personal desde `/app/usuarios`: alta (mostrador, mozo o sector), edición de rol/sectores/estado, reseteo de contraseña. Nunca puede asignar el rol `duenio` desde ahí (ni al crear ni al editar) ni editarse o desactivarse a sí mismo — siempre queda exactamente un dueño activo por comercio (índice único parcial sobre `miembros (comercio_id) where rol = 'duenio'`). El nombre de un miembro (columna `nombre` en `perfiles`) lo actualiza la función `actualizar_nombre_miembro`, que valida `tiene_rol` adentro: `perfiles` no tiene una policy de UPDATE para "soy dueño de esta persona en algún comercio" a propósito, es una tabla sensible (tiene `es_admin`).
- Se permite compartir una cuenta entre dispositivos (ej. una cuenta de cocina en 2 tablets). Los mozos conviene que tengan cuenta propia para saber quién atendió cada mesa. No hay control de sesiones simultáneas.
- Un rol `sector` no ve todos los sectores por defecto: cada miembro se vincula a los sectores concretos que le tocan (`miembro_sectores`), así que "Juan cocina, María atiende la barra" son dos miembros con rol `sector` cada uno con su propia asignación. El dueño sí ve todos los sectores activos del comercio, sin necesidad de asignación explícita.
- `cocina` y `barra` existían como roles separados y quedaron obsoletos (reemplazados por `sector` + `miembro_sectores`, ver "Tablas"); el enum los conserva por limitación de Postgres pero no se usan más.

### Identificación del personal

- El **dueño** entra con su email real: es el titular del servicio y tiene que poder recuperar el acceso por su cuenta.
- El **personal** (mostrador, mozo, sector) entra con un **nombre de usuario** (`perfiles.usuario`), sin email: mucha gente en un local no tiene mail o no lo recuerda, y pedirlo en el alta es fricción innecesaria.
  - Se sugiere solo al crear, a partir del nombre de la persona y el slug del comercio (ej. "Juan Pérez" en `bar-demo` → `juan.bardemo`), y es editable antes de guardar.
  - **No se puede cambiar una vez creado** — mismo criterio que el slug de un comercio: cambiarlo rompería la referencia de con qué credencial entra esa persona.
  - Formato `^[a-z0-9._]{3,30}$` (check de la columna) y único en **todo el sistema**, no por comercio: dos comercios no pueden tener cada uno un `juan`. Se valida contra la función `usuario_disponible` (security definer) porque la policy `perfiles_personal` acota lo que un dueño ve a su propio comercio — una consulta común daría "libre" un nombre que ya usa el personal de otro comercio. Esa misma necesidad de mirar todo el sistema es lo que obliga a `usuario_disponible` a autorizar por dentro (exige ser dueño activo de algún comercio, no alcanza con `authenticated`): quien la llama puede, en los hechos, confirmar si un nombre de usuario existe en cualquier comercio, así que se acota a quienes ya son dueños reales — no a cualquier cuenta de personal — para no convertirla en una herramienta de enumeración abierta. El riesgo residual (un dueño real probando nombres de otros comercios) se acepta: es inherente a que la unicidad sea global, y el dato que se filtra es apenas un booleano, no datos de la cuenta.
- Supabase Auth igual exige un email por cuenta: al personal se le arma uno interno (`{usuario}@usuarios.local`, dominio centralizado en `src/lib/usuarios/email-interno.ts`) solo para satisfacer esa exigencia. **Nunca se muestra en la interfaz** — es un detalle de implementación, no una credencial que use ni conozca nadie.
- El login (`/login`) acepta ambos en el mismo campo de texto: si lo tipeado tiene `@` se usa tal cual como email (dueño/admin); si no, se arma el email interno a partir de eso (personal). No hay ambigüedad posible entre los dos casos porque el formato de `usuario` nunca incluye `@`.
- La contraseña, tanto al crear como al resetear, la puede escribir el dueño (mínimo 6 caracteres — el personal la tipea en una tablet compartida, más largo es fricción sin ganancia real acá) o generarla el sistema (bastante más fuerte, ~80 bits). La generada se muestra una sola vez para que el dueño se la pase al empleado; no se guarda en ningún lado más que esa respuesta.
- El alta de comercios (`/admin/comercios/nuevo`) no cambia: el dueño se sigue creando con email real y contraseña propia, sin nombre de usuario.

## Diagrama

```mermaid
erDiagram
  perfiles ||--o{ miembros : "trabaja en"
  comercios ||--o{ miembros : tiene
  comercios ||--o{ sectores : tiene
  miembros ||--o{ miembro_sectores : "ve (rol sector)"
  sectores ||--o{ miembro_sectores : "visto por"
  comercios ||--o{ categorias : tiene
  comercios ||--o{ productos : tiene
  comercios ||--o{ adicionales : tiene
  comercios ||--o{ mesas : tiene
  comercios ||--o{ cuentas : tiene
  comercios ||--o{ pedidos : tiene
  sectores ||--o{ categorias : "destino por defecto"
  sectores ||--o{ productos : "destino (override)"
  categorias ||--o{ productos : agrupa
  productos ||--o{ producto_adicionales : ofrece
  adicionales ||--o{ producto_adicionales : "se ofrece en"
  mesas ||--o{ cuentas : "se abre como"
  cuentas ||--o{ pedidos : "rondas"
  pedidos ||--|{ pedido_items : contiene
  pedido_items ||--o{ pedido_item_adicionales : lleva
```

## Tablas

### Base (sprint 1)

**`comercios`**: `id`, `nombre`, `slug` (único, para URLs: `/garage-grill`), `plan`, `estado` (`activo` | `suspendido`), `limite_usuarios` (10), `zona_horaria` (`America/Argentina/Buenos_Aires`), `hora_corte` (06:00), `creado_en`.

**`perfiles`**: `id` (= `auth.users.id`), `nombre`, `email`, `usuario` (nombre de usuario del personal sin email real, único en todo el sistema, ver "Identificación del personal"), `es_admin`, `creado_en`.

**`miembros`**: `id`, `comercio_id`, `perfil_id`, `rol`, `activo`, `creado_en`. Único por (`comercio_id`, `perfil_id`). Una persona puede estar en varios comercios.

### Carta (sprint 2)

**`sectores`**: `id`, `comercio_id`, `nombre` (libre: "Cocina", "Barra", "Parrilla", lo que haga falta), `orden`, `activo`. Todo comercio nace con "Cocina".

**`miembro_sectores`**: (`comercio_id`, `miembro_id`, `sector_id`), PK compuesta por `miembro_id` + `sector_id`. Qué sectores puede ver un miembro con rol `sector`. El dueño no necesita filas acá: ve todos los sectores activos igual.

**`categorias`**: `id`, `comercio_id`, `nombre`, `sector_id` (destino por defecto de sus productos), `orden`, `activo`.

**`productos`**: `id`, `comercio_id`, `categoria_id`, `nombre`, `descripcion`, `precio`, `imagen_url`, `sector_id`, `sin_stock`, `activo`, `orden`.

- `sin_stock = true` → se muestra en gris con "Sin stock" y no se puede pedir.
- `activo = false` → no se muestra.
- `sector_id`: la columna existe y la siguen usando las copias en `pedido_items` (a qué pantalla va cada ítem) y `crear_pedido_landing`, pero **la interfaz de administración del comercio siempre la deja en `null`** al crear o editar un producto. Decisión de negocio: un producto se prepara siempre en el sector de su categoría; si un local necesita que algo salga de otro sector, crea una categoría aparte para eso en vez de pisarle el sector a un producto puntual. Si en algún momento se necesita volver a permitir un sector propio por producto, la columna ya está lista.

**`adicionales`**: `id`, `comercio_id`, `nombre` ("Extra cheddar", "Sin cebolla"), `precio_extra` (0 si es gratis), `activo`. Se crean una vez y se reutilizan.

**`producto_adicionales`**: (`producto_id`, `adicional_id`). Qué adicionales ofrece cada producto.

Futuro (no Plan 1): grupos de adicionales con elección única ("Punto: jugoso / a punto / cocido").

### Salón y pedidos (sprints 3 a 6)

**`mesas`**: `id`, `comercio_id`, `nombre` ("Mesa 4"), `activo`, `orden`.

**`cuentas`** (mesa abierta): `id`, `comercio_id`, `mesa_id`, `mozo_id` (→ `perfiles`), `estado` (`abierta` | `cerrada`), `abierta_en`, `cerrada_en`. Solo una cuenta abierta por mesa.

**`pedidos`** (un pedido take away o una ronda de mesa): `id`, `comercio_id`, `jornada` (date), `numero` (visible, reinicia por jornada), `origen` (`landing` | `mozo` | `qr_mesa` | `mostrador`), `cuenta_id` (null en take away), `estado`, `cliente_nombre`, `cliente_telefono`, `modalidad` (`retiro` | `envio`), `direccion`, `nota`, `creado_por`, `creado_en`, `confirmado_en`, `cancelado_en`, `motivo_cancelacion`.

**`pedido_items`**: `id`, `comercio_id`, `pedido_id`, `producto_id`, `nombre` (copia), `precio_unitario` (copia), `cantidad`, `nota` ("bien cocida"), `sector_id` (copia: a qué pantalla va), `estado`, `listo_en`, `entregado_en`.

**`pedido_item_adicionales`**: `id`, `comercio_id`, `item_id`, `adicional_id`, `nombre` (copia), `precio_extra` (copia).

## Estados

### Pedido

```mermaid
stateDiagram-v2
  [*] --> pendiente_confirmar: origen landing
  [*] --> confirmado: origen mozo / qr_mesa / mostrador
  pendiente_confirmar --> confirmado: mostrador acepta
  pendiente_confirmar --> cancelado: mostrador rechaza
  confirmado --> entregado: todos los ítems entregados
  confirmado --> cancelado: mostrador cancela
  entregado --> [*]
  cancelado --> [*]
```

- Las pantallas de sector solo muestran ítems de pedidos `confirmado`.
- El mostrador puede editar o cancelar un pedido aunque la cocina ya lo haya empezado. El `id` y el `numero` se mantienen.

### Ítem

`pendiente` → `en_preparacion` → `listo` → `entregado`

- El estado va **por ítem** para que cocina y barra avancen a su ritmo.
- Ejemplo: ronda con hamburguesa + fernet. La barra marca el fernet listo, el mozo lo lleva y lo marca entregado. La hamburguesa sigue en cocina. Cuando todos los ítems están `entregado`, el pedido pasa solo a `entregado` (trigger).
- En take away, el mostrador entrega todo junto cuando todos los ítems están `listo`.

## Numeración por jornada

- `numero` arranca en 1 cada **jornada**, no cada día calendario.
- Jornada = fecha local del comercio restando `hora_corte`. Con corte 06:00, un pedido de las 02:00 del sábado pertenece a la jornada del viernes.
- Lo asigna un trigger con la tabla `contadores_pedidos` (sin carreras entre inserts simultáneos).

## Canales

### Landing pública (plan `take_away` o `completo`)

- URL: `/{slug}`. Muestra la carta activa. Pide nombre, teléfono, modalidad y dirección si es envío.
- No tiene opción de mesa.
- El cliente **no** escribe en tablas directamente: usa la función `crear_pedido_landing` (security definer), que valida plan, estado del comercio, stock y precios desde la base (nunca confía en precios del cliente).
- El pedido nace `pendiente_confirmar`.

### Pedido desde la mesa con QR (plan `salon` o `completo`)

- Cada mesa tiene un QR a `/{slug}/mesa/{mesa_id}` con la carta.
- El cliente arma el pedido en su celular **sin escribir en la base**. La app genera un QR con el carrito (ids de producto, cantidades, adicionales, notas).
- El mozo lo escanea desde su app; la app valida contra la base y crea la ronda en la cuenta abierta con `origen = 'qr_mesa'`.
- Ventaja: no hay pedidos anónimos ni spam en la base.

### Mozo

- Abre la cuenta de la mesa, carga rondas (incluso de un solo producto), marca ítems entregados y cierra la mesa.
- Si en el futuro se muestra el total de la cuenta al cliente, debe decir "Documento no válido como factura".

## Realtime

- Pantallas de sector: suscripción a `pedido_items` filtrando por `comercio_id` y `sector_id`.
- Mostrador y mozos: suscripción a `pedidos` y `pedido_items` del comercio.
- Cada pantalla abierta es una conexión. Supabase Pro incluye 500 simultáneas (~50-80 locales activos).

## Fuera del Plan 1

Promociones (2x1), grupos de adicionales, impresión de comandas, caja/cierres/reportes, stock por cantidades, pagos online, facturación.
