-- ==============================================================================
-- 002_orders_and_payments.sql
-- SmartDine Agent: Payment collection, delivery fee, and orders table
-- Run in your Supabase SQL Editor: https://supabase.com/dashboard/project/yyixhivmuhioakqikftl/sql
-- ==============================================================================

-- 1. Add payment details and manager phone to agent_restaurants
alter table public.agent_restaurants
  add column if not exists bank_title text not null default 'Aarib Ahmed Vahidy',
  add column if not exists bank_account text not null default '03178018027',
  add column if not exists bank_name text not null default 'Raast / EasyPaisa / Nayapay',
  add column if not exists delivery_fee numeric(10,2) not null default 100.00,
  add column if not exists manager_phone text default '923178018027';

-- 2. Update default values for the existing tenant restaurant
update public.agent_restaurants
set
  bank_title = 'Aarib Ahmed Vahidy',
  bank_account = '03178018027',
  bank_name = 'Raast / EasyPaisa / Nayapay',
  delivery_fee = 100.00,
  manager_phone = '923178018027'
where id = '91d5da18-7c0c-420d-863f-ec2f357057a8';

-- 3. Create agent_orders table
create table if not exists public.agent_orders (
  id uuid primary key default gen_random_uuid(),
  order_number serial,
  restaurant_id uuid not null references public.agent_restaurants(id),
  conversation_id uuid not null references public.agent_conversations(id),
  customer_ref text not null,
  customer_name text,
  customer_phone text not null,
  delivery_address text not null,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  delivery_fee numeric(12,2) not null default 100.00 check (delivery_fee >= 0),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  payment_method text not null check (payment_method in ('online_transfer', 'cod')),
  payment_status text not null default 'pending_transfer' check (
    payment_status in ('pending_transfer', 'verification_pending', 'verified', 'cod_pending', 'paid')
  ),
  order_status text not null default 'received' check (
    order_status in ('received', 'preparing', 'dispatched', 'delivered', 'cancelled')
  ),
  receipt_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Indexes for fast lookups
create index if not exists agent_orders_restaurant_idx on public.agent_orders(restaurant_id);
create index if not exists agent_orders_conversation_idx on public.agent_orders(conversation_id);
create index if not exists agent_orders_customer_idx on public.agent_orders(customer_ref);

-- 5. Security & RLS (server-only via service_role)
alter table public.agent_orders enable row level security;
revoke all on public.agent_orders from anon, authenticated;
grant select, insert, update, delete on public.agent_orders to service_role;
