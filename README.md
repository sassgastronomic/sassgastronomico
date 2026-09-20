This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Base de datos (Supabase)

El esquema vive en migraciones de Supabase CLI, en `supabase/migrations/` — es la fuente de verdad. `docs/schema-inicial.sql` es una foto histórica de antes de este flujo (hasta el sprint 3, cuando el SQL se corría a mano en el editor de Supabase); queda solo de referencia, no se mantiene al día.

Para cambiar el esquema:

```bash
npx supabase migration new <nombre-descriptivo>   # crea el archivo vacío
# escribir el SQL del cambio ahí adentro
npx supabase db push                              # lo aplica contra Supabase
```

Nunca se corre SQL suelto a mano en el editor de Supabase: todo cambio pasa por una migración, así el repo y la base no se desincronizan.

Ver [`docs/SCHEMA.md`](docs/SCHEMA.md) para las decisiones de diseño del esquema (tablas, roles, RLS) y la convención de permisos de las funciones (`revoke`/`grant`).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
