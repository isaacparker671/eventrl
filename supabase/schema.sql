create extension if not exists "pgcrypto";

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  starts_at timestamptz not null,
  location_text text not null,
  capacity integer,
  allow_plus_one boolean not null default false,
  payment_instructions text,
  invite_title text,
  invite_subtitle text,
  invite_instructions text,
  requires_payment boolean not null default false,
  is_paid_event boolean not null default false,
  price_cents integer,
  interaction_mode text not null check (interaction_mode in ('RESTRICTED', 'OPEN_CHAT')),
  invite_slug text not null unique,
  created_at timestamptz not null default now(),
  constraint capacity_positive check (capacity is null or capacity > 0),
  constraint price_cents_positive check (price_cents is null or price_cents > 0)
);

create index if not exists events_host_user_id_idx on public.events(host_user_id);

create table if not exists public.event_scanner_roles (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  owner_host_user_id uuid not null references auth.users(id) on delete cascade,
  scanner_email text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists event_scanner_roles_event_email_uniq
  on public.event_scanner_roles(event_id, scanner_email);
create index if not exists event_scanner_roles_scanner_email_idx
  on public.event_scanner_roles(scanner_email, status);

create table if not exists public.invite_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  created_by_host_user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists invite_links_event_id_idx on public.invite_links(event_id);
create index if not exists invite_links_slug_idx on public.invite_links(slug);

create table if not exists public.guest_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  display_name text not null,
  guest_email text,
  recovery_code text,
  plus_one_requested boolean not null default false,
  status text not null default 'PENDING' check (status in ('PENDING', 'PENDING_PAYMENT', 'APPROVED', 'REJECTED', 'WAITLIST', 'REVOKED', 'LEFT', 'CANT_MAKE')),
  payment_status text not null default 'PENDING' check (payment_status in ('PENDING', 'PAID', 'FAILED')),
  stripe_checkout_session_id text,
  paid_at timestamptz,
  approved_at timestamptz,
  decision_at timestamptz,
  payment_confirmed_at timestamptz,
  guest_event_status text check (guest_event_status in ('ARRIVING', 'RUNNING_LATE', 'CANT_MAKE')),
  guest_event_status_at timestamptz,
  rejected_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists guest_requests_event_id_idx on public.guest_requests(event_id);
create index if not exists guest_requests_status_idx on public.guest_requests(status);
create unique index if not exists guest_requests_event_recovery_code_uniq
  on public.guest_requests(event_id, recovery_code)
  where recovery_code is not null;
create unique index if not exists guest_requests_stripe_checkout_session_id_uniq
  on public.guest_requests(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create table if not exists public.guest_access (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_request_id uuid not null unique references public.guest_requests(id) on delete cascade,
  qr_token_hash text not null unique,
  token_hash text not null unique,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists guest_access_event_id_idx on public.guest_access(event_id);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_access_id uuid not null unique references public.guest_access(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checker_host_user_id uuid not null references auth.users(id) on delete cascade
);

create index if not exists checkins_event_id_idx on public.checkins(event_id);

create table if not exists public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  guest_request_id uuid not null references public.guest_requests(id) on delete cascade,
  session_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists guest_sessions_guest_request_id_idx on public.guest_sessions(guest_request_id);

create table if not exists public.event_chat_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  role text not null check (role in ('HOST', 'GUEST')),
  host_user_id uuid references auth.users(id) on delete cascade,
  guest_request_id uuid references public.guest_requests(id) on delete cascade,
  joined_at timestamptz not null default now(),
  constraint event_chat_member_ref_check check (
    (role = 'HOST' and host_user_id is not null and guest_request_id is null)
    or
    (role = 'GUEST' and guest_request_id is not null and host_user_id is null)
  )
);

create unique index if not exists event_chat_members_event_host_uniq
  on public.event_chat_members(event_id, host_user_id)
  where host_user_id is not null;

create unique index if not exists event_chat_members_event_guest_uniq
  on public.event_chat_members(event_id, guest_request_id)
  where guest_request_id is not null;

create index if not exists event_chat_members_event_id_idx on public.event_chat_members(event_id);

create table if not exists public.event_chat_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  sender_type text not null check (sender_type in ('HOST', 'GUEST', 'SYSTEM')),
  sender_name text not null,
  host_user_id uuid references auth.users(id) on delete cascade,
  guest_request_id uuid references public.guest_requests(id) on delete cascade,
  reply_to_message_id uuid references public.event_chat_messages(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint event_chat_sender_ref_check check (
    (sender_type = 'HOST' and host_user_id is not null and guest_request_id is null)
    or
    (sender_type = 'GUEST' and guest_request_id is not null and host_user_id is null)
    or
    (sender_type = 'SYSTEM' and host_user_id is null and guest_request_id is null)
  )
);

create index if not exists event_chat_messages_event_id_created_idx
  on public.event_chat_messages(event_id, created_at);

create table if not exists public.event_chat_reactions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  message_id uuid not null references public.event_chat_messages(id) on delete cascade,
  reaction text not null check (reaction in ('UP', 'DOWN', 'LAUGH')),
  host_user_id uuid references auth.users(id) on delete cascade,
  guest_request_id uuid references public.guest_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint event_chat_reaction_actor_check check (
    (host_user_id is not null and guest_request_id is null)
    or
    (guest_request_id is not null and host_user_id is null)
  )
);

create unique index if not exists event_chat_reactions_unique_host_message
  on public.event_chat_reactions(event_id, message_id, host_user_id)
  where host_user_id is not null;

create unique index if not exists event_chat_reactions_unique_guest_message
  on public.event_chat_reactions(event_id, message_id, guest_request_id)
  where guest_request_id is not null;

create table if not exists public.event_polls (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  question text not null,
  created_by_host_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists event_polls_event_id_idx on public.event_polls(event_id, created_at);

create table if not exists public.event_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.event_polls(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  guest_request_id uuid not null references public.guest_requests(id) on delete cascade,
  vote text not null check (vote in ('YES', 'NO')),
  created_at timestamptz not null default now()
);

create unique index if not exists event_poll_votes_unique_guest
  on public.event_poll_votes(poll_id, guest_request_id);

create table if not exists public.event_question_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_request_id uuid not null references public.guest_requests(id) on delete cascade,
  body text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  approved_message_id uuid references public.event_chat_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists event_question_requests_event_id_idx
  on public.event_question_requests(event_id, status, created_at);

create table if not exists public.host_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  cash_app_url text,
  paypal_url text,
  venmo_url text,
  zelle_url text,
  google_pay_url text,
  apple_pay_url text,
  is_pro boolean not null default false,
  stripe_account_id text,
  stripe_connected_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  user_id uuid references auth.users(id) on delete set null,
  user_agent text,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_created_at_idx
  on public.support_tickets(created_at desc);

create index if not exists support_tickets_user_id_idx
  on public.support_tickets(user_id);

create table if not exists public.stripe_events (
  id text primary key,
  created_at timestamptz not null default now()
);

create index if not exists stripe_events_created_at_idx
  on public.stripe_events(created_at desc);

create table if not exists public.event_images (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  storage_path text not null unique,
  public_url text not null,
  order_index integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists event_images_event_id_idx
  on public.event_images(event_id, is_cover desc, order_index asc, created_at asc);

create unique index if not exists event_images_cover_per_event_uniq
  on public.event_images(event_id)
  where is_cover = true;

create unique index if not exists host_profiles_stripe_customer_id_uniq
  on public.host_profiles(stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists host_profiles_stripe_subscription_id_uniq
  on public.host_profiles(stripe_subscription_id)
  where stripe_subscription_id is not null;
