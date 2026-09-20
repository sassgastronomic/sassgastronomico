/**
 * Tipos TypeScript derivados de `supabase/migrations/`.
 * Ver docs/SCHEMA.md para el detalle de cada tabla y las reglas de negocio.
 *
 * La forma de cada tabla (`Row` / `Insert` / `Update` / `Relationships`) y
 * la clave `Views` (vacía: no se usan todavía) siguen la convención de
 * `supabase gen types typescript`, que es lo que espera el genérico
 * `Database` de `@supabase/supabase-js`. `Functions` solo tiene tipada
 * `carta_publica`, la única que se llama desde la app por ahora — agregar
 * las demás (`crear_pedido_landing`) cuando haga falta usarlas.
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
  comercio: { id: string; nombre: string; plan: PlanComercio };
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

      mesas: {
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
        Update: Partial<Database["public"]["Tables"]["mesas"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "mesas_comercio_id_fkey";
            columns: ["comercio_id"];
            referencedRelation: "comercios";
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
    };
  };
}
