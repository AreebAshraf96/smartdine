begin;

create table public.stripe_test_checkout_refs (
  payment_id uuid primary key,
  session_id text not null unique,
  payment_intent_id text unique
);

create table public.order_refunds (
  payment_id uuid primary key,
  order_id uuid not null,
  restaurant_id uuid not null,
  amount numeric not null check (amount > 0),
  currency text not null,
  method text not null,
  provider text,
  stripe_refund_id text unique,
  reason text not null,
  refunded_by uuid not null,
  refunded_at timestamptz not null default now()
);
create index order_refunds_restaurant_time_idx on public.order_refunds(restaurant_id, refunded_at);

create table public.daily_reconciliations (
  restaurant_id uuid not null,
  business_date date not null,
  currency text not null,
  expected_cash numeric not null,
  expected_card numeric not null,
  counted_cash numeric not null,
  reported_card numeric not null,
  closed_by uuid not null,
  closed_at timestamptz not null default now(),
  primary key (restaurant_id, business_date, currency)
);

alter table public.stripe_test_checkout_refs enable row level security;
alter table public.order_refunds enable row level security;
alter table public.daily_reconciliations enable row level security;
revoke all on public.stripe_test_checkout_refs, public.order_refunds, public.daily_reconciliations from public, anon, authenticated;
grant select, insert, update on public.stripe_test_checkout_refs, public.daily_reconciliations to service_role;
grant select, insert on public.order_refunds to service_role;

create view public.smartdine_pending_cash_payments
with (security_invoker = true) as
  select p.*
  from public.order_payment_choices p
  join public.orders o on o.id = p.order_id and o.restaurant_id = p.restaurant_id
  where p.method = 'pay_waiter' and p.status = 'pending' and o.status = 'pending_approval';
revoke all on public.smartdine_pending_cash_payments from public, anon, authenticated, service_role;
grant select on public.smartdine_pending_cash_payments to service_role;

create function public.guard_smartdine_cancelled_order_payment()
returns trigger language plpgsql set search_path = '' as $$
declare order_status text;
begin
  if tg_op = 'UPDATE' then
    if old.status = 'paid' and new.status = 'paid' then return new; end if;
  end if;
  select status::text into order_status from public.orders
    where id = new.order_id and restaurant_id = new.restaurant_id for update;
  if order_status = 'cancelled' then
    raise exception 'Order is cancelled' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger smartdine_no_payment_for_cancelled_order
  before insert or update of status, method on public.order_payment_choices
  for each row execute function public.guard_smartdine_cancelled_order_payment();

create function public.cancel_smartdine_order(target_order uuid, target_restaurant uuid, stripe_expired boolean)
returns boolean language plpgsql set search_path = '' as $$
declare order_status text;
begin
  select status::text into order_status from public.orders
    where id = target_order and restaurant_id = target_restaurant for update;
  if not found or order_status not in ('pending_approval','received','preparing','ready','cancelled') then
    return false;
  end if;
  if order_status = 'cancelled' then return true; end if;

  if exists (
    select 1 from public.order_payment_choices p
    where p.order_id = target_order and p.restaurant_id = target_restaurant
    and (
      p.status = 'processing' or
      (p.status = 'paid' and not exists (select 1 from public.order_refunds f where f.payment_id = p.id)) or
      (p.status = 'pending' and p.provider = 'stripe_test' and not stripe_expired)
    )
  ) then return false; end if;

  update public.orders set status = 'cancelled' where id = target_order and restaurant_id = target_restaurant;
  return true;
end;
$$;
revoke all on function public.cancel_smartdine_order(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.cancel_smartdine_order(uuid, uuid, boolean) to service_role;

create function public.smartdine_reconciliation_totals(target_restaurant uuid, target_currency text, starts_at timestamptz, ends_at timestamptz)
returns table(expected_cash numeric, expected_card numeric, simulated_card numeric)
language sql stable set search_path = '' as $$
  with movements as (
    select p.method::text as method, p.provider::text as provider, p.total_amount::numeric as amount
    from public.order_payment_choices p
    where p.restaurant_id = target_restaurant and p.currency::text = target_currency and p.status = 'paid'
      and p.paid_at >= starts_at and p.paid_at < ends_at
    union all
    select f.method, f.provider, -f.amount
    from public.order_refunds f
    where f.restaurant_id = target_restaurant and f.currency = target_currency
      and f.refunded_at >= starts_at and f.refunded_at < ends_at
  )
  select
    coalesce(sum(amount) filter (where method = 'pay_waiter'), 0),
    coalesce(sum(amount) filter (where method = 'card' and provider is distinct from 'demo' and provider is distinct from 'stripe_test'), 0),
    coalesce(sum(amount) filter (where method = 'card' and provider in ('demo','stripe_test')), 0)
  from movements;
$$;
revoke all on function public.smartdine_reconciliation_totals(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.smartdine_reconciliation_totals(uuid, text, timestamptz, timestamptz) to service_role;

commit;
