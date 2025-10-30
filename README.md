CSMS - Central Stock Management System

Next.js 14 + Tailwind CSS app with role-based Login (Edit/View), Master View table, and Per Product detail view. Supabase client is scaffolded for future backend integration.

Getting Started

1. Install dependencies:

```
npm install
```

2. Run dev server:

```
npm run dev
```

App will be available at `http://localhost:3000`.

Auth

- Edit: `alice/bob/carol` with password `pass123`
- View: `victor/vicky` with password `view123`
- Session stored in localStorage.

Routes

- Login: `/login`
- Master View: `/mv`
- Per Product: `/product/[sku]`

Env (optional for Supabase)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Notes

- Images use remote placeholder and fallback.
- Inventory logic utilities in `src/lib/inventory.ts` implement available and return flows.

