create extension if not exists "pgcrypto";

alter table if exists public.events
  add column if not exists host_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists name text,
  add column if not exists starts_at timestamptz,
  add column if not exists location_text text,
  add column if not exists capacity integer,
  add column if not exists allow_plus_one boolean not null default false,
  add column if not exists payment_instructions text,
  add column if not exists invite_title text,
  add column if not exists invite_subtitle text,
  add column if not exists invite_instructions text,
  add column if not exists requires_payment boolean not null default false,
  add column if not exists is_paid_event boolean not null default false,
  add column if not exists price_cents integer,
  add column if not exists interaction_mode text,
  add column if not exists invite_slug text,
  add column if not exists scanner_access_code text,
  add column if not exists created_at timestamptz not null default now();

update public.events
set invite_slug = encode(gen_random_bytes(12), 'hex')
where invite_slug is null;

update public.events
set interaction_mode = 'RESTRICTED'
where interaction_mode is null;

update public.events
set scanner_access_code = lpad((floor(random() * 1000000)::int)::text, 6, '0')
where scanner_access_code is null;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'events'
      and constraint_name = 'events_invite_slug_key'
  ) then
    alter table public.events
      add constraint events_invite_slug_key unique (invite_slug);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_interaction_mode_check'
  ) then
    alter table public.events
      add constraint events_interaction_mode_check
      check (interaction_mode in ('RESTRICTED', 'OPEN_CHAT'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'price_cents_positive'
  ) then
    alter table public.events
      add constraint price_cents_positive
      check (price_cents is null or price_cents > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'capacity_positive'
  ) then
    alter table public.events
      add constraint capacity_positive
      check (capacity is null or capacity > 0);
  end if;
end
$$;

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

alter table if exists public.event_scanner_roles
  add column if not exists event_id uuid references public.events(id) on delete cascade,
  add column if not exists owner_host_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists scanner_email text,
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists revoked_at timestamptz;

update public.event_scanner_roles
set scanner_email = lower(trim(scanner_email))
where scanner_email is not null;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'event_scanner_roles_status_check'
  ) then
    alter table public.event_scanner_roles drop constraint event_scanner_roles_status_check;
  end if;

  alter table public.event_scanner_roles
    add constraint event_scanner_roles_status_check
    check (status in ('ACTIVE', 'REVOKED'));
end
$$;

create unique index if not exists event_scanner_roles_event_email_uniq
  on public.event_scanner_roles(event_id, scanner_email);
create index if not exists event_scanner_roles_scanner_email_idx
  on public.event_scanner_roles(scanner_email, status);

create table if not exists public.event_scanner_identities (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  scanner_name text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

alter table if exists public.event_scanner_identities
  add column if not exists event_id uuid references public.events(id) on delete cascade,
  add column if not exists scanner_name text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists last_used_at timestamptz not null default now();

create unique index if not exists event_scanner_identities_event_name_uniq
  on public.event_scanner_identities(event_id, scanner_name);
create index if not exists event_scanner_identities_event_used_idx
  on public.event_scanner_identities(event_id, last_used_at desc);

create table if not exists public.invite_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  created_by_host_user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table if exists public.invite_links
  add column if not exists event_id uuid references public.events(id) on delete cascade,
  add column if not exists created_by_host_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists slug text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists revoked_at timestamptz;

insert into public.invite_links (event_id, created_by_host_user_id, slug)
select e.id, e.host_user_id, e.invite_slug
from public.events e
where e.invite_slug is not null
  and e.host_user_id is not null
  and not exists (
    select 1 from public.invite_links il where il.event_id = e.id
  );

create unique index if not exists invite_links_event_id_uniq on public.invite_links(event_id);
create unique index if not exists invite_links_slug_uniq on public.invite_links(slug);
create index if not exists invite_links_event_id_idx on public.invite_links(event_id);
create index if not exists invite_links_slug_idx on public.invite_links(slug);

create table if not exists public.guest_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  display_name text not null,
  guest_email text,
  status text not null default 'PENDING' check (status in ('PENDING', 'PENDING_PAYMENT', 'APPROVED', 'REJECTED', 'WAITLIST', 'REVOKED', 'LEFT', 'CANT_MAKE')),
  payment_status text not null default 'PENDING' check (payment_status in ('PENDING', 'PAID', 'FAILED')),
  stripe_checkout_session_id text,
  paid_at timestamptz,
  approved_at timestamptz,
  decision_at timestamptz,
  rejected_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table if exists public.guest_requests
  add column if not exists event_id uuid references public.events(id) on delete cascade,
  add column if not exists display_name text,
  add column if not exists guest_email text,
  add column if not exists recovery_code text,
  add column if not exists plus_one_requested boolean not null default false,
  add column if not exists status text,
  add column if not exists payment_status text not null default 'PENDING',
  add column if not exists stripe_checkout_session_id text,
  add column if not exists paid_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists decision_at timestamptz,
  add column if not exists payment_confirmed_at timestamptz,
  add column if not exists guest_event_status text,
  add column if not exists guest_event_status_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

update public.guest_requests
set status = 'PENDING'
where status is null;

update public.guest_requests
set payment_status = case
  when payment_confirmed_at is not null then 'PAID'
  else 'PENDING'
end
where payment_status is null;

update public.guest_requests
set payment_status = case
  when upper(trim(payment_status)) = 'PAID' then 'PAID'
  when upper(trim(payment_status)) = 'FAILED' then 'FAILED'
  when payment_confirmed_at is not null then 'PAID'
  else 'PENDING'
end
where payment_status is not null
  and upper(trim(payment_status)) not in ('PENDING', 'PAID', 'FAILED');

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'guest_requests_status_check'
  ) then
    alter table public.guest_requests drop constraint guest_requests_status_check;
  end if;

  alter table public.guest_requests
    add constraint guest_requests_status_check
    check (status in ('PENDING', 'PENDING_PAYMENT', 'APPROVED', 'REJECTED', 'WAITLIST', 'REVOKED', 'LEFT', 'CANT_MAKE'));
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'guest_requests_payment_status_check'
  ) then
    alter table public.guest_requests drop constraint guest_requests_payment_status_check;
  end if;

  alter table public.guest_requests
    add constraint guest_requests_payment_status_check
    check (payment_status in ('PENDING', 'PAID', 'FAILED'));
end
$$;

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
  guest_request_id uuid not null unique references public.guest_requests(id) on delete cascade,
  qr_token_hash text not null unique,
  token_hash text not null unique,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table if exists public.guest_access
  add column if not exists event_id uuid references public.events(id) on delete cascade,
  add column if not exists guest_request_id uuid references public.guest_requests(id) on delete cascade,
  add column if not exists qr_token_hash text,
  add column if not exists token_hash text,
  add column if not exists issued_at timestamptz not null default now(),
  add column if not exists revoked_at timestamptz;

update public.guest_access
set token_hash = qr_token_hash
where token_hash is null
  and qr_token_hash is not null;

update public.guest_access
set qr_token_hash = token_hash
where qr_token_hash is null
  and token_hash is not null;

update public.guest_access ga
set event_id = gr.event_id
from public.guest_requests gr
where ga.guest_request_id = gr.id
  and ga.event_id is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'guest_access'
      and column_name = 'event_id'
      and is_nullable = 'YES'
  ) and not exists (
    select 1 from public.guest_access where event_id is null
  ) then
    alter table public.guest_access
      alter column event_id set not null;
  end if;
end
$$;

create unique index if not exists guest_access_guest_request_id_uniq
  on public.guest_access(guest_request_id);

create unique index if not exists guest_access_token_hash_uniq
  on public.guest_access(token_hash);

create unique index if not exists guest_access_qr_token_hash_uniq
  on public.guest_access(qr_token_hash);

create index if not exists guest_access_event_id_idx
  on public.guest_access(event_id);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_access_id uuid not null unique references public.guest_access(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checker_host_user_id uuid not null references auth.users(id) on delete cascade
);

alter table if exists public.checkins
  add column if not exists event_id uuid references public.events(id) on delete cascade,
  add column if not exists guest_access_id uuid references public.guest_access(id) on delete cascade,
  add column if not exists checked_in_at timestamptz not null default now(),
  add column if not exists checker_host_user_id uuid references auth.users(id) on delete cascade;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'checkins'
      and column_name = 'host_user_id'
  ) then
    execute '
      update public.checkins
      set checker_host_user_id = host_user_id
      where checker_host_user_id is null
        and host_user_id is not null
    ';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'checkins'
      and column_name = 'checker_host_user_id'
      and is_nullable = 'YES'
  ) and not exists (
    select 1 from public.checkins where checker_host_user_id is null
  ) then
    alter table public.checkins
      alter column checker_host_user_id set not null;
  end if;
end
$$;

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
  role text not null,
  host_user_id uuid references auth.users(id) on delete cascade,
  guest_request_id uuid references public.guest_requests(id) on delete cascade,
  joined_at timestamptz not null default now()
);

alter table if exists public.event_chat_members
  add column if not exists event_id uuid references public.events(id) on delete cascade,
  add column if not exists role text,
  add column if not exists host_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists guest_request_id uuid references public.guest_requests(id) on delete cascade,
  add column if not exists joined_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_chat_member_ref_check'
  ) then
    alter table public.event_chat_members
      add constraint event_chat_member_ref_check check (
        (role = 'HOST' and host_user_id is not null and guest_request_id is null)
        or
        (role = 'GUEST' and guest_request_id is not null and host_user_id is null)
      );
  end if;
end
$$;

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
  sender_type text not null,
  sender_name text not null,
  host_user_id uuid references auth.users(id) on delete cascade,
  guest_request_id uuid references public.guest_requests(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table if exists public.event_chat_messages
  add column if not exists event_id uuid references public.events(id) on delete cascade,
  add column if not exists sender_type text,
  add column if not exists sender_name text,
  add column if not exists host_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists guest_request_id uuid references public.guest_requests(id) on delete cascade,
  add column if not exists reply_to_message_id uuid references public.event_chat_messages(id) on delete set null,
  add column if not exists body text,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_chat_messages_sender_type_check'
  ) then
    alter table public.event_chat_messages
      add constraint event_chat_messages_sender_type_check
      check (sender_type in ('HOST', 'GUEST', 'SYSTEM'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_chat_sender_ref_check'
  ) then
    alter table public.event_chat_messages
      add constraint event_chat_sender_ref_check check (
        (sender_type = 'HOST' and host_user_id is not null and guest_request_id is null)
        or
        (sender_type = 'GUEST' and guest_request_id is not null and host_user_id is null)
        or
        (sender_type = 'SYSTEM' and host_user_id is null and guest_request_id is null)
      );
  end if;
end
$$;

create index if not exists event_chat_messages_event_id_created_idx
  on public.event_chat_messages(event_id, created_at);

create table if not exists public.event_chat_reactions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  message_id uuid not null references public.event_chat_messages(id) on delete cascade,
  reaction text not null,
  host_user_id uuid references auth.users(id) on delete cascade,
  guest_request_id uuid references public.guest_requests(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table if exists public.event_chat_reactions
  add column if not exists event_id uuid references public.events(id) on delete cascade,
  add column if not exists message_id uuid references public.event_chat_messages(id) on delete cascade,
  add column if not exists reaction text,
  add column if not exists host_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists guest_request_id uuid references public.guest_requests(id) on delete cascade,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_chat_reactions_reaction_check'
  ) then
    alter table public.event_chat_reactions
      add constraint event_chat_reactions_reaction_check
      check (reaction in ('UP', 'DOWN', 'LAUGH'));
  end if;
end
$$;

drop index if exists public.event_chat_reactions_unique_actor;

with ranked_reactions as (
  select
    id,
    row_number() over (
      partition by event_id, message_id, host_user_id, guest_request_id
      order by created_at asc, id asc
    ) as rn
  from public.event_chat_reactions
)
delete from public.event_chat_reactions r
using ranked_reactions rr
where r.id = rr.id
  and rr.rn > 1;

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

alter table if exists public.event_polls
  add column if not exists event_id uuid references public.events(id) on delete cascade,
  add column if not exists question text,
  add column if not exists created_by_host_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists closed_at timestamptz;

create index if not exists event_polls_event_id_idx on public.event_polls(event_id, created_at);

create table if not exists public.event_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.event_polls(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  guest_request_id uuid not null references public.guest_requests(id) on delete cascade,
  vote text not null,
  created_at timestamptz not null default now()
);

alter table if exists public.event_poll_votes
  add column if not exists poll_id uuid references public.event_polls(id) on delete cascade,
  add column if not exists event_id uuid references public.events(id) on delete cascade,
  add column if not exists guest_request_id uuid references public.guest_requests(id) on delete cascade,
  add column if not exists vote text,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_poll_votes_vote_check'
  ) then
    alter table public.event_poll_votes
      add constraint event_poll_votes_vote_check
      check (vote in ('YES', 'NO'));
  end if;
end
$$;

create unique index if not exists event_poll_votes_unique_guest
  on public.event_poll_votes(poll_id, guest_request_id);

create table if not exists public.event_question_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_request_id uuid not null references public.guest_requests(id) on delete cascade,
  body text not null,
  status text not null default 'PENDING',
  approved_message_id uuid references public.event_chat_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table if exists public.event_question_requests
  add column if not exists event_id uuid references public.events(id) on delete cascade,
  add column if not exists guest_request_id uuid references public.guest_requests(id) on delete cascade,
  add column if not exists body text,
  add column if not exists status text,
  add column if not exists approved_message_id uuid references public.event_chat_messages(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists reviewed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_question_requests_status_check'
  ) then
    alter table public.event_question_requests
      add constraint event_question_requests_status_check
      check (status in ('PENDING', 'APPROVED', 'REJECTED'));
  end if;
end
$$;

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

alter table if exists public.host_profiles
  add column if not exists display_name text,
  add column if not exists cash_app_url text,
  add column if not exists paypal_url text,
  add column if not exists venmo_url text,
  add column if not exists zelle_url text,
  add column if not exists google_pay_url text,
  add column if not exists apple_pay_url text,
  add column if not exists is_pro boolean not null default false,
  add column if not exists stripe_account_id text,
  add column if not exists stripe_connected_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists current_period_end timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

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

alter table if exists public.support_tickets
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists message text,
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists user_agent text,
  add column if not exists ip text,
  add column if not exists created_at timestamptz not null default now();

create index if not exists support_tickets_created_at_idx
  on public.support_tickets(created_at desc);

create index if not exists support_tickets_user_id_idx
  on public.support_tickets(user_id);

create table if not exists public.stripe_events (
  id text primary key,
  created_at timestamptz not null default now()
);

alter table if exists public.stripe_events
  add column if not exists created_at timestamptz not null default now();

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

alter table if exists public.event_images
  add column if not exists event_id uuid references public.events(id) on delete cascade,
  add column if not exists storage_path text,
  add column if not exists public_url text,
  add column if not exists order_index integer not null default 0,
  add column if not exists is_cover boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

create index if not exists event_images_event_id_idx
  on public.event_images(event_id, is_cover desc, order_index asc, created_at asc);

create unique index if not exists event_images_cover_per_event_uniq
  on public.event_images(event_id)
  where is_cover = true;

update public.host_profiles
set is_pro = case
  when subscription_status in ('active', 'trialing') then true
  else false
end
where subscription_status is not null;

create unique index if not exists host_profiles_stripe_customer_id_uniq
  on public.host_profiles(stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists host_profiles_stripe_subscription_id_uniq
  on public.host_profiles(stripe_subscription_id)
  where stripe_subscription_id is not null;

-- Row Level Security hardening (defense-in-depth)
alter table if exists public.events enable row level security;
alter table if exists public.event_scanner_roles enable row level security;
alter table if exists public.event_scanner_identities enable row level security;
alter table if exists public.invite_links enable row level security;
alter table if exists public.guest_requests enable row level security;
alter table if exists public.guest_access enable row level security;
alter table if exists public.checkins enable row level security;
alter table if exists public.guest_sessions enable row level security;
alter table if exists public.event_chat_members enable row level security;
alter table if exists public.event_chat_messages enable row level security;
alter table if exists public.event_chat_reactions enable row level security;
alter table if exists public.event_polls enable row level security;
alter table if exists public.event_poll_votes enable row level security;
alter table if exists public.event_question_requests enable row level security;
alter table if exists public.host_profiles enable row level security;
alter table if exists public.support_tickets enable row level security;
alter table if exists public.stripe_events enable row level security;
alter table if exists public.event_images enable row level security;

drop policy if exists events_owner_all on public.events;
create policy events_owner_all
  on public.events
  for all
  to authenticated
  using (host_user_id = auth.uid())
  with check (host_user_id = auth.uid());

drop policy if exists event_scanner_roles_owner_all on public.event_scanner_roles;
create policy event_scanner_roles_owner_all
  on public.event_scanner_roles
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_scanner_roles.event_id
        and e.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_scanner_roles.event_id
        and e.host_user_id = auth.uid()
    )
  );

drop policy if exists invite_links_owner_all on public.invite_links;
create policy invite_links_owner_all
  on public.invite_links
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = invite_links.event_id
        and e.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      where e.id = invite_links.event_id
        and e.host_user_id = auth.uid()
    )
  );

drop policy if exists event_scanner_identities_owner_all on public.event_scanner_identities;
create policy event_scanner_identities_owner_all
  on public.event_scanner_identities
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_scanner_identities.event_id
        and e.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_scanner_identities.event_id
        and e.host_user_id = auth.uid()
    )
  );

drop policy if exists guest_requests_host_owner_all on public.guest_requests;
create policy guest_requests_host_owner_all
  on public.guest_requests
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = guest_requests.event_id
        and e.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      where e.id = guest_requests.event_id
        and e.host_user_id = auth.uid()
    )
  );

drop policy if exists guest_access_host_owner_all on public.guest_access;
create policy guest_access_host_owner_all
  on public.guest_access
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = guest_access.event_id
        and e.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      where e.id = guest_access.event_id
        and e.host_user_id = auth.uid()
    )
  );

drop policy if exists checkins_host_owner_all on public.checkins;
create policy checkins_host_owner_all
  on public.checkins
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = checkins.event_id
        and e.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      where e.id = checkins.event_id
        and e.host_user_id = auth.uid()
    )
  );

drop policy if exists guest_sessions_host_owner_all on public.guest_sessions;
create policy guest_sessions_host_owner_all
  on public.guest_sessions
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.guest_requests gr
      join public.events e on e.id = gr.event_id
      where gr.id = guest_sessions.guest_request_id
        and e.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.guest_requests gr
      join public.events e on e.id = gr.event_id
      where gr.id = guest_sessions.guest_request_id
        and e.host_user_id = auth.uid()
    )
  );

drop policy if exists event_chat_members_host_owner_all on public.event_chat_members;
create policy event_chat_members_host_owner_all
  on public.event_chat_members
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_chat_members.event_id
        and e.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_chat_members.event_id
        and e.host_user_id = auth.uid()
    )
  );

drop policy if exists event_chat_messages_host_owner_all on public.event_chat_messages;
create policy event_chat_messages_host_owner_all
  on public.event_chat_messages
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_chat_messages.event_id
        and e.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_chat_messages.event_id
        and e.host_user_id = auth.uid()
    )
  );

drop policy if exists event_chat_reactions_host_owner_all on public.event_chat_reactions;
create policy event_chat_reactions_host_owner_all
  on public.event_chat_reactions
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_chat_reactions.event_id
        and e.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_chat_reactions.event_id
        and e.host_user_id = auth.uid()
    )
  );

drop policy if exists event_polls_host_owner_all on public.event_polls;
create policy event_polls_host_owner_all
  on public.event_polls
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_polls.event_id
        and e.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_polls.event_id
        and e.host_user_id = auth.uid()
    )
  );

drop policy if exists event_poll_votes_host_owner_all on public.event_poll_votes;
create policy event_poll_votes_host_owner_all
  on public.event_poll_votes
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_poll_votes.event_id
        and e.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_poll_votes.event_id
        and e.host_user_id = auth.uid()
    )
  );

drop policy if exists event_question_requests_host_owner_all on public.event_question_requests;
create policy event_question_requests_host_owner_all
  on public.event_question_requests
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_question_requests.event_id
        and e.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_question_requests.event_id
        and e.host_user_id = auth.uid()
    )
  );

drop policy if exists host_profiles_self_all on public.host_profiles;
create policy host_profiles_self_all
  on public.host_profiles
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists support_tickets_self_select on public.support_tickets;
create policy support_tickets_self_select
  on public.support_tickets
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists event_images_host_owner_all on public.event_images;
create policy event_images_host_owner_all
  on public.event_images
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_images.event_id
        and e.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_images.event_id
        and e.host_user_id = auth.uid()
    )
  );
