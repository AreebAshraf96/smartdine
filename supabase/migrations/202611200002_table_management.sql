begin;

alter table public.restaurant_tables add column if not exists archived_at timestamptz;
alter table public.restaurant_tables add constraint archived_table_is_inactive
  check (archived_at is null or not is_active);

commit;
