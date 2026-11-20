begin;

create extension if not exists pg_cron;

create table public.order_receipts (
  payment_id uuid primary key,
  order_id uuid not null,
  restaurant_id uuid not null,
  restaurant_name text not null,
  table_number text,
  method text not null,
  provider text,
  currency text not null,
  subtotal numeric not null,
  tip_amount numeric not null,
  total_amount numeric not null,
  items jsonb not null,
  paid_at timestamptz not null,
  expires_at timestamptz not null
);

create index order_receipts_restaurant_paid_idx
  on public.order_receipts (restaurant_id, paid_at desc, payment_id desc);
create index order_receipts_expires_idx on public.order_receipts (expires_at);

alter table public.order_receipts enable row level security;
revoke all on public.order_receipts from public, anon, authenticated, service_role;
grant select on public.order_receipts to service_role;

create function public.capture_smartdine_receipt(target_payment_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.order_receipts (
    payment_id, order_id, restaurant_id, restaurant_name, table_number,
    method, provider, currency, subtotal, tip_amount, total_amount, items, paid_at, expires_at
  )
  select
    p.id, p.order_id, p.restaurant_id, r.name, t.table_number::text,
    p.method, p.provider, p.currency, p.subtotal, p.tip_amount, p.total_amount,
    coalesce(lines.items, '[]'::jsonb), payment_time.paid_at,
    payment_time.paid_at + interval '168 hours'
  from public.order_payment_choices p
  join public.orders o on o.id = p.order_id and o.restaurant_id = p.restaurant_id
  join public.restaurants r on r.id = p.restaurant_id
  left join public.table_sessions s on s.id = o.table_session_id
  left join public.restaurant_tables t on t.id = s.table_id and t.restaurant_id = p.restaurant_id
  cross join lateral (select coalesce(p.paid_at, p.updated_at, p.created_at) as paid_at) payment_time
  left join lateral (
    select jsonb_agg(
      jsonb_build_object('name', i.item_name, 'quantity', i.quantity, 'unit_price', i.unit_price)
      order by i.created_at, i.id
    ) as items
    from public.order_items i
    where i.order_id = p.order_id
  ) lines on true
  where p.id = target_payment_id
    and p.status = 'paid'
    and payment_time.paid_at + interval '168 hours' > now()
  on conflict (payment_id) do nothing;
$$;

revoke all on function public.capture_smartdine_receipt(uuid) from public, anon, authenticated, service_role;

create function public.capture_smartdine_receipt_on_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.capture_smartdine_receipt(new.id);
  return null;
end;
$$;

revoke all on function public.capture_smartdine_receipt_on_payment() from public, anon, authenticated, service_role;

create constraint trigger smartdine_receipt_on_payment
after insert or update of status, paid_at on public.order_payment_choices
deferrable initially deferred
for each row when (new.status = 'paid')
execute function public.capture_smartdine_receipt_on_payment();

select public.capture_smartdine_receipt(id)
from public.order_payment_choices
where status = 'paid' and coalesce(paid_at, updated_at, created_at) + interval '168 hours' > now();

select cron.schedule(
  'smartdine-expire-order-receipts',
  '* * * * *',
  'delete from public.order_receipts where expires_at <= now()'
);

commit;
