-- plan_permite_rol es un helper interno: solo la llaman tiene_rol y
-- usuarios_ocupados desde su propio cuerpo (ambas security definer, corren
-- con sus propios privilegios, no con los del caller externo). Nadie más
-- la invoca — ni anon ni authenticated necesitan poder llamarla directo.
--
-- En la base real terminó con GRANT EXECUTE a "anon" y "authenticated"
-- (probablemente el default que Supabase aplica a objetos nuevos del
-- schema public, no un grant explícito nuestro — el revoke que se corrió
-- en su momento solo alcanzó a PUBLIC). Se lo sacamos: sin eso, cualquier
-- sesión logueada de cualquier comercio podía llamarla directo, aunque no
-- devuelve nada sensible (es una función pura sobre sus dos parámetros, sin
-- acceso a tablas). Ver docs/SCHEMA.md, "Funciones nuevas".
revoke execute on function public.plan_permite_rol(public.plan_comercio, public.rol_miembro)
  from public, anon, authenticated;
