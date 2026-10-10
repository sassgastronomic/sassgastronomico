/**
 * Tipos TypeScript derivados de `supabase/migrations/`.
 * Ver docs/SCHEMA.md para el detalle de cada tabla y las reglas de negocio.
 *
 * La forma de cada tabla (`Row` / `Insert` / `Update` / `Relationships`) y
 * la clave `Views` (vacía: no se usan todavía) siguen la convención de
 * `supabase gen types typescript`, que es lo que espera el genérico
 * `Database` de `@supabase/supabase-js`. `Functions` solo tiene tipadas
 * las que se llaman desde la app — agregar las demás cuando haga falta
 * usarlas.
 *
 * Mantener este archivo a mano con el esquema: si se agrega una tabla,
 * columna o función en `supabase/migrations/`, reflejarla acá.
 */

// ---------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------

export type PlanComercio = "take_away" | "salon" | "completo";
export type EstadoComercio = "activo" | "suspendido";
// El enum `rol_miembro` en Postgres todavía tiene 'cocina' y 'barra' (no se
// pueden sacar valores de un enum sin recrear el tipo), pero ya no se usan:
// los reemplazó 'sector' + la tabla `miembro_sectores` (qué sector concreto
// ve cada miembro). Se excluyen acá a propósito para no tener que sostener
// ramas muertas en cada `Record<RolMiembro, _>` de la app.
export type RolMiembro = "duenio" | "mostrador" | "mozo" | "sector";
export type EstadoCuenta = "abierta" | "cerrada";
export type OrigenPedido = "landing" | "mozo" | "qr_mesa" | "mostrador";
export type EstadoPedido =
  | "pendiente_confirmar"
  | "confirmado"
  | "entregado"
  | "cancelado";
export type ModalidadPedido = "retiro" | "envio";
export type EstadoItem = "pendiente" | "en_preparacion" | "listo" | "entregado";

// ---------------------------------------------------------------------
// Funciones (RPC)
// ---------------------------------------------------------------------

/**
 * Lo que devuelve `carta_publica(p_slug)`: la carta activa de un comercio,
 * lista para mostrarle al cliente (landing, QR de mesa) o para armar una
 * vista previa fiel en el panel. `null` si el slug no existe o el
 * comercio está suspendido (la función solo mira `estado = 'activo'`).
 *
 * Ojo: esta función deja afuera las categorías y productos inactivos (su
 * SQL los filtra) y no incluye el sector de cada categoría — para una
 * vista que necesite mostrar también eso, hace falta completarla con
 * consultas propias (ver src/app/app/carta/page.tsx).
 */
export type CartaPublicaResultado = {
  // Sin el id del comercio a propósito: la función es pública y la carta no
  // lo necesita.
  comercio: { nombre: string; plan: PlanComercio; whatsapp: string | null };
  categorias: {
    id: string;
    nombre: string;
    productos: {
      id: string;
      nombre: string;
      descripcion: string | null;
      precio: number;
      imagen_url: string | null;
      sin_stock: boolean;
      adicionales: { id: string; nombre: string; precio_extra: number }[];
    }[];
  }[];
};

// Un ítem tal como lo manda /app/salon/[id] a `crear_pedido_mozo` — no es
// la forma de `pedido_items` (eso lo arma la función adentro, con las
// copias de nombre/precio/sector).
export type ItemPedidoMozo = {
  producto_id: string;
  cantidad: number;
  nota: string;
  adicionales: string[];
};

// La landing manda los ítems con la misma forma.
export type ItemPedidoLanding = ItemPedidoMozo;

// Un ítem tal como quedó guardado en un pedido: las copias de nombre,
// categoría y precio (regla de oro #3), no lo que mandó el navegador.
export type ItemPedidoGuardado = {
  nombre: string;
  categoria_nombre: string | null;
  precio_unitario: number;
  cantidad: number;
  nota: string | null;
  adicionales: { nombre: string; precio_extra: number }[];
};

/**
 * Lo que devuelve `seguimiento_pedido(p_slug, p_codigo)`: lo justo para
 * que el cliente vea cómo va su pedido de la landing (sin su teléfono ni
 * ids internos). `null` si el código no existe, es de otro comercio, el
 * comercio está suspendido o el pedido tiene más de 24 horas.
 */
export type SeguimientoPedidoResultado = {
  comercio: { nombre: string; whatsapp: string | null; zona_horaria: string };
  numero: number;
  estado: EstadoPedido;
  modalidad: ModalidadPedido;
  cliente_nombre: string;
  direccion: string | null;
  nota: string | null;
  creado_en: string;
  items: (ItemPedidoGuardado & { estado: EstadoItem })[];
};

// ---------------------------------------------------------------------
// Tablas
// ---------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      comercios: {
        Row: {
          id: string;
          nombre: string;
          slug: string;
          plan: PlanComercio;
          estado: EstadoComercio;
          limite_usuarios: number;
          zona_horaria: string;
          hora_corte: string;
          // Solo dígitos, con código de país y sin "+" (lo que pide wa.me).
          // Null: la landing no ofrece avisar por WhatsApp.
          whatsapp: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          slug: string;
          plan?: PlanComercio;
          estado?: EstadoComercio;
          limite_usuarios?: number;
          zona_horaria?: string;
          hora_corte?: string;
          whatsapp?: string | null;
          creado_en?: string;
        };
        Update: Partial<Database["public"]["Tables"]["comercios"]["Insert"]>;
        Relationships: [];
      };

      perfiles: {
        Row: {
          id: string;
          nombre: string;
          email: string | null;
          // Nombre de usuario del personal sin email real (mostrador/mozo/
          // sector). Null para el dueño y los admins, que entran con email.
          // Único en todo el sistema (no por comercio).
          usuario: string | null;
          es_admin: boolean;
          creado_en: string;
        };
        Insert: {
          // Debe coincidir con auth.users.id; en la práctica lo crea el
          // trigger `crear_perfil_nuevo_usuario` al registrarse el usuario.
          id: string;
          nombre?: string;
          email?: string | null;
          usuario?: string | null;
          es_admin?: boolean;
          creado_en?: string;
        };
        Update: Partial<Database["public"]["Tables"]["perfiles"]["Insert"]>;
        Relationships: [];
      };

      miembros: {
        Row: {
          id: string;
          comercio_id: string;
          perfil_id: string;
          rol: RolMiembro;
          activo: boolean;
          creado_en: string;
        };
        Insert: {
          id?: string;
          comercio_id: string;
          perfil_id: string;
          rol: RolMiembro;
          activo?: boolean;
          creado_en?: string;
        };
        Update: Partial<Database["public"]["Tables"]["miembros"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "miembros_comercio_id_fkey";
            columns: ["comercio_id"];
            referencedRelation: "comercios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "miembros_perfil_id_fkey";
            columns: ["perfil_id"];
            referencedRelation: "perfiles";
            referencedColumns: ["id"];
          },
        ];
      };

      sectores: {
        Row: {
          id: string;
          comercio_id: string;
          nombre: string;
          orden: number;
          activo: boolean;
        };
        Insert: {
          id?: string;
          comercio_id: string;
          nombre: string;
          orden?: number;
          activo?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["sectores"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "sectores_comercio_id_fkey";
            columns: ["comercio_id"];
            referencedRelation: "comercios";
            referencedColumns: ["id"];
          },
        ];
      };

      // Qué sectores concretos ve cada miembro con rol 'sector'.
      miembro_sectores: {
        Row: {
          comercio_id: string;
          miembro_id: string;
          sector_id: string;
        };
        Insert: {
          comercio_id: string;
          miembro_id: string;
          sector_id: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["miembro_sectores"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "miembro_sectores_comercio_id_fkey";
            columns: ["comercio_id"];
            referencedRelation: "comercios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "miembro_sectores_miembro_id_fkey";
            columns: ["miembro_id"];
            referencedRelation: "miembros";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "miembro_sectores_sector_id_fkey";
            columns: ["sector_id"];
            referencedRelation: "sectores";
            referencedColumns: ["id"];
          },
        ];
      };

      categorias: {
        Row: {
          id: string;
          comercio_id: string;
          nombre: string;
          sector_id: string;
          orden: number;
          activo: boolean;
        };
        Insert: {
          id?: string;
          comercio_id: string;
          nombre: string;
          sector_id: string;
          orden?: number;
          activo?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["categorias"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "categorias_comercio_id_fkey";
            columns: ["comercio_id"];
            referencedRelation: "comercios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "categorias_sector_id_fkey";
            columns: ["sector_id"];
            referencedRelation: "sectores";
            referencedColumns: ["id"];
          },
        ];
      };

      productos: {
        Row: {
          id: string;
          comercio_id: string;
          categoria_id: string;
          nombre: string;
          descripcion: string | null;
          precio: number;
          imagen_url: string | null;
          sector_id: string | null;
          sin_stock: boolean;
          activo: boolean;
          orden: number;
        };
        Insert: {
          id?: string;
          comercio_id: string;
          categoria_id: string;
          nombre: string;
          descripcion?: string | null;
          precio: number;
          imagen_url?: string | null;
          sector_id?: string | null;
          sin_stock?: boolean;
          activo?: boolean;
          orden?: number;
        };
        Update: Partial<Database["public"]["Tables"]["productos"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "productos_comercio_id_fkey";
            columns: ["comercio_id"];
            referencedRelation: "comercios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "productos_categoria_id_fkey";
            columns: ["categoria_id"];
            referencedRelation: "categorias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "productos_sector_id_fkey";
            columns: ["sector_id"];
            referencedRelation: "sectores";
            referencedColumns: ["id"];
          },
        ];
      };

      adicionales: {
        Row: {
          id: string;
          comercio_id: string;
          nombre: string;
          precio_extra: number;
          activo: boolean;
        };
        Insert: {
          id?: string;
          comercio_id: string;
          nombre: string;
          precio_extra?: number;
          activo?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["adicionales"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "adicionales_comercio_id_fkey";
            columns: ["comercio_id"];
            referencedRelation: "comercios";
            referencedColumns: ["id"];
          },
        ];
      };

      producto_adicionales: {
        Row: {
          comercio_id: string;
          producto_id: string;
          adicional_id: string;
        };
        Insert: {
          comercio_id: string;
          producto_id: string;
          adicional_id: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["producto_adicionales"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "producto_adicionales_producto_id_fkey";
            columns: ["producto_id"];
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "producto_adicionales_adicional_id_fkey";
            columns: ["adicional_id"];
            referencedRelation: "adicionales";
            referencedColumns: ["id"];
          },
        ];
      };

      zonas: {
        Row: {
          id: string;
          comercio_id: string;
          nombre: string;
          orden: number;
          activo: boolean;
        };
        Insert: {
          id?: string;
          comercio_id: string;
          nombre: string;
          orden?: number;
          activo?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["zonas"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "zonas_comercio_id_fkey";
            columns: ["comercio_id"];
            referencedRelation: "comercios";
            referencedColumns: ["id"];
          },
        ];
      };

      mesas: {
        Row: {
          id: string;
          comercio_id: string;
          nombre: string;
          zona_id: string;
          orden: number;
          activo: boolean;
        };
        Insert: {
          id?: string;
          comercio_id: string;
          nombre: string;
          zona_id: string;
          orden?: number;
          activo?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["mesas"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "mesas_comercio_id_fkey";
            columns: ["comercio_id"];
            referencedRelation: "comercios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mesas_zona_id_fkey";
            columns: ["zona_id"];
            referencedRelation: "zonas";
            referencedColumns: ["id"];
          },
        ];
      };

      cuentas: {
        Row: {
          id: string;
          comercio_id: string;
          mesa_id: string;
          mozo_id: string | null;
          estado: EstadoCuenta;
          abierta_en: string;
          cerrada_en: string | null;
        };
        Insert: {
          id?: string;
          comercio_id: string;
          mesa_id: string;
          mozo_id?: string | null;
          estado?: EstadoCuenta;
          abierta_en?: string;
          cerrada_en?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["cuentas"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "cuentas_comercio_id_fkey";
            columns: ["comercio_id"];
            referencedRelation: "comercios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cuentas_mesa_id_fkey";
            columns: ["mesa_id"];
            referencedRelation: "mesas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cuentas_mozo_id_fkey";
            columns: ["mozo_id"];
            referencedRelation: "perfiles";
            referencedColumns: ["id"];
          },
        ];
      };

      pedidos: {
        Row: {
          id: string;
          comercio_id: string;
          // Los completa el trigger `asignar_numero_pedido`.
          jornada: string | null;
          numero: number | null;
          origen: OrigenPedido;
          cuenta_id: string | null;
          estado: EstadoPedido;
          cliente_nombre: string | null;
          cliente_telefono: string | null;
          modalidad: ModalidadPedido | null;
          direccion: string | null;
          nota: string | null;
          creado_por: string | null;
          creado_en: string;
          confirmado_en: string | null;
          cancelado_en: string | null;
          motivo_cancelacion: string | null;
          // Solo pedidos de la landing: lo genera crear_pedido_landing y es
          // lo que va en el link de seguimiento del cliente.
          codigo_seguimiento: string | null;
        };
        Insert: {
          id?: string;
          comercio_id: string;
          jornada?: string | null;
          numero?: number | null;
          origen: OrigenPedido;
          cuenta_id?: string | null;
          estado?: EstadoPedido;
          cliente_nombre?: string | null;
          cliente_telefono?: string | null;
          modalidad?: ModalidadPedido | null;
          direccion?: string | null;
          nota?: string | null;
          creado_por?: string | null;
          creado_en?: string;
          confirmado_en?: string | null;
          cancelado_en?: string | null;
          motivo_cancelacion?: string | null;
          codigo_seguimiento?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["pedidos"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "pedidos_comercio_id_fkey";
            columns: ["comercio_id"];
            referencedRelation: "comercios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedidos_cuenta_id_fkey";
            columns: ["cuenta_id"];
            referencedRelation: "cuentas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedidos_creado_por_fkey";
            columns: ["creado_por"];
            referencedRelation: "perfiles";
            referencedColumns: ["id"];
          },
        ];
      };

      pedido_items: {
        Row: {
          id: string;
          comercio_id: string;
          pedido_id: string;
          producto_id: string | null;
          nombre: string;
          // Copia, como `nombre`. Null en ítems viejos sin producto.
          categoria_nombre: string | null;
          precio_unitario: number;
          cantidad: number;
          nota: string | null;
          sector_id: string;
          estado: EstadoItem;
          listo_en: string | null;
          entregado_en: string | null;
        };
        Insert: {
          id?: string;
          comercio_id: string;
          pedido_id: string;
          producto_id?: string | null;
          nombre: string;
          categoria_nombre?: string | null;
          precio_unitario: number;
          cantidad: number;
          nota?: string | null;
          sector_id: string;
          estado?: EstadoItem;
          listo_en?: string | null;
          entregado_en?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["pedido_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "pedido_items_pedido_id_fkey";
            columns: ["pedido_id"];
            referencedRelation: "pedidos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey";
            columns: ["producto_id"];
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedido_items_sector_id_fkey";
            columns: ["sector_id"];
            referencedRelation: "sectores";
            referencedColumns: ["id"];
          },
        ];
      };

      pedido_item_adicionales: {
        Row: {
          id: string;
          comercio_id: string;
          item_id: string;
          adicional_id: string | null;
          nombre: string;
          precio_extra: number;
        };
        Insert: {
          id?: string;
          comercio_id: string;
          item_id: string;
          adicional_id?: string | null;
          nombre: string;
          precio_extra: number;
        };
        Update: Partial<
          Database["public"]["Tables"]["pedido_item_adicionales"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "pedido_item_adicionales_item_id_fkey";
            columns: ["item_id"];
            referencedRelation: "pedido_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedido_item_adicionales_adicional_id_fkey";
            columns: ["adicional_id"];
            referencedRelation: "adicionales";
            referencedColumns: ["id"];
          },
        ];
      };

      contadores_pedidos: {
        Row: {
          comercio_id: string;
          jornada: string;
          ultimo: number;
        };
        Insert: {
          comercio_id: string;
          jornada: string;
          ultimo?: number;
        };
        Update: Partial<
          Database["public"]["Tables"]["contadores_pedidos"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "contadores_pedidos_comercio_id_fkey";
            columns: ["comercio_id"];
            referencedRelation: "comercios";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      carta_publica: {
        Args: { p_slug: string };
        Returns: CartaPublicaResultado | null;
      };
      // Miembros activos que cuentan para `comercios.limite_usuarios`: ver
      // src/lib/miembros/plan.ts para el espejo en TypeScript de esta misma
      // regla (usado donde ya se tiene una lista de miembros en memoria y
      // llamar a esta función por cada comercio sería una consulta de más).
      usuarios_ocupados: {
        Args: { p_comercio: string };
        Returns: number;
      };
      // Actualiza `perfiles.nombre` de un miembro del propio comercio,
      // validando `tiene_rol` adentro (ver supabase/migrations/ — `perfiles`
      // no tiene policy de UPDATE para esto a propósito).
      actualizar_nombre_miembro: {
        Args: { p_miembro_id: string; p_nombre: string };
        Returns: void;
      };
      // ¿Está libre este nombre de usuario? Único en todo el sistema, no
      // por comercio — ver supabase/migrations/ para por qué hace falta
      // security definer acá.
      usuario_disponible: {
        Args: { p_usuario: string };
        Returns: boolean;
      };
      // Actualiza nombre/activo de una zona y, si `activo` cambió, arrastra
      // el mismo valor a todas sus mesas — ver
      // src/app/app/mesas/zonas/[id]/actions.ts y supabase/migrations/.
      actualizar_zona_con_mesas: {
        Args: { p_id: string; p_nombre: string; p_activo: boolean };
        Returns: void;
      };
      // Crea una ronda de pedido sobre una cuenta abierta: valida rol,
      // cuenta abierta y disponibilidad de cada producto (mismo criterio
      // que carta_publica, sector efectivo incluido) en una sola
      // transacción — ver src/app/app/salon/[id]/actions.ts y
      // supabase/migrations/.
      crear_pedido_mozo: {
        Args: { p_cuenta_id: string; p_items: ItemPedidoMozo[] };
        Returns: { pedido_id: string; numero: number };
      };
      // Pedido de la landing pública (anónimo): valida comercio (activo,
      // con take away y con WhatsApp cargado), datos del cliente y
      // disponibilidad; los precios salen de la base. Nace
      // `pendiente_confirmar`. Devuelve el código de seguimiento (se genera
      // en el mismo insert del pedido) y el detalle guardado para armar el
      // mensaje de WhatsApp — ver src/app/[slug]/actions.ts. También
      // `vence_en` (el tope del link, ver plazos_seguimiento en
      // supabase/migrations/), que hoy la app no usa.
      crear_pedido_landing: {
        Args: {
          p_slug: string;
          p_cliente_nombre: string;
          // Opcional: la landing ya no lo pide (el contacto es el chat de
          // WhatsApp). La columna queda por los pedidos viejos.
          p_cliente_telefono: string | null;
          p_modalidad: ModalidadPedido;
          p_direccion: string | null;
          p_nota: string | null;
          p_items: ItemPedidoLanding[];
        };
        Returns: {
          numero: number;
          codigo_seguimiento: string;
          vence_en: string;
          items: ItemPedidoGuardado[];
        };
      };
      seguimiento_pedido: {
        Args: { p_slug: string; p_codigo: string };
        Returns: SeguimientoPedidoResultado | null;
      };
      // Mostrador (src/app/app/pedidos/): una función por acción sobre un
      // pedido de la landing. Validan adentro rol (dueño o mostrador),
      // estado y origen, y bloquean el pedido mientras trabajan — ver
      // supabase/migrations/.
      aceptar_pedido_landing: {
        Args: { p_pedido_id: string };
        Returns: void;
      };
      cancelar_pedido_landing: {
        Args: { p_pedido_id: string };
        Returns: void;
      };
      // Cantidad 0 = sacar el ítem. Solo con el pedido todavía pendiente.
      cambiar_item_pedido_landing: {
        Args: { p_item_id: string; p_cantidad: number };
        Returns: void;
      };
      entregar_pedido_landing: {
        Args: { p_pedido_id: string };
        Returns: void;
      };
      // Cierra la cuenta solo si no queda nada sin entregar; si queda,
      // devuelve `ok: false` con cuántos ítems hay en cada estado (y no
      // cierra). Bloquea la cuenta mientras tanto — ver supabase/migrations/.
      cerrar_cuenta: {
        Args: { p_cuenta_id: string };
        Returns: {
          ok: boolean;
          pendiente: number;
          en_preparacion: number;
          listo: number;
        };
      };
    };
  };
}
