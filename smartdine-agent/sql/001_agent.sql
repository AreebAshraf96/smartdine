-- Run in your SmartDine DEVELOPMENT Supabase project.
-- Independent, tenant-scoped agent tables; does not modify QR ordering tables.
create table if not exists public.agent_restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  instructions text,
  currency text not null default 'PKR',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.agent_menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.agent_restaurants(id),
  name text not null, description text,
  price numeric(12,2) not null check (price >= 0),
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists agent_menu_tenant_idx on public.agent_menu_items(restaurant_id);
create table if not exists public.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.agent_restaurants(id),
  channel text not null check (channel in ('web','whatsapp','email')),
  customer_ref text not null,
  status text not null default 'bot' check (status in ('bot','human')),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, channel, customer_ref)
);
create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.agent_conversations(id),
  role text not null check (role in ('user','assistant')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists agent_messages_conversation_idx on public.agent_messages(conversation_id, created_at);
create table if not exists public.agent_drafts (
  conversation_id uuid primary key references public.agent_conversations(id),
  items jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','on_hold')),
  updated_at timestamptz not null default now()
);
create table if not exists public.agent_inbound_events (
  provider text not null,
  event_id text not null,
  created_at timestamptz not null default now(),
  primary key (provider, event_id)
);
-- No public access, all through server-only service-role endpoints.
alter table public.agent_restaurants enable row level security;
alter table public.agent_menu_items enable row level security;
alter table public.agent_conversations enable row level security;
alter table public.agent_messages enable row level security;
alter table public.agent_drafts enable row level security;
alter table public.agent_inbound_events enable row level security;
revoke all on public.agent_restaurants, public.agent_menu_items, public.agent_conversations,
  public.agent_messages, public.agent_drafts, public.agent_inbound_events from anon, authenticated;
grant select, insert, update, delete on public.agent_restaurants, public.agent_menu_items,
  public.agent_conversations, public.agent_messages, public.agent_drafts,
  public.agent_inbound_events to service_role;
-- Create a test restaurant and use its ID in .env.local:
-- insert into public.agent_restaurants(name,description) values ('Home Kitchen','Homemade meals') returning id;
-- insert into public.agent_menu_items(restaurant_id,name,price) values ('YOUR_UUID','Chicken Biryani',450);
