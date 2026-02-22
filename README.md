## Eventrl MVP

Eventrl is a private event access-control app built with Next.js App Router, Tailwind, and Supabase.

## Setup

1. Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

2. Run SQL in your Supabase project:

- `supabase/schema.sql`

3. Install and run:

```bash
npm install
npm run dev
```

## Core Routes

- Host auth: `/host/login`
- Host dashboard: `/host/dashboard`
- Host event dashboard: `/host/events/[id]`
- Host scanner: `/host/events/[id]/scanner`
- Guest invite: `/i/[slug]`
- Guest status: `/g/status`
- Guest QR: `/g/qr`

## Notes

- `/host/*` is protected by middleware using Supabase auth cookies.
- Guests do not create accounts.
- QR validation is server-side with `sha256` token hashing and duplicate check-in prevention via unique `checkins.guest_access_id`.
