-- 1) zines table
create table if not exists public.zines (
  id text primary key,
  title text not null,
  created_at bigint not null,
  page_count integer,
  aspect jsonb,
  icon_data_url text,
  default_font_family text,
  default_bg_color text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- auto update updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_zines_updated_at on public.zines;
create trigger trg_zines_updated_at
before update on public.zines
for each row execute function public.set_updated_at();

-- 2) storage bucket
insert into storage.buckets (id, name, public)
values ('zines', 'zines', true)
on conflict (id) do nothing;

-- 3) RLS policies (demo: allow anon full access).
-- For production, tighten these policies by user ownership.
alter table public.zines enable row level security;

drop policy if exists "zines_select_all" on public.zines;
create policy "zines_select_all"
on public.zines for select
to anon, authenticated
using (true);

drop policy if exists "zines_insert_all" on public.zines;
create policy "zines_insert_all"
on public.zines for insert
to anon, authenticated
with check (true);

drop policy if exists "zines_update_all" on public.zines;
create policy "zines_update_all"
on public.zines for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "zines_delete_all" on public.zines;
create policy "zines_delete_all"
on public.zines for delete
to anon, authenticated
using (true);

-- Storage object policies
drop policy if exists "zines_storage_select_all" on storage.objects;
create policy "zines_storage_select_all"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'zines');

drop policy if exists "zines_storage_insert_all" on storage.objects;
create policy "zines_storage_insert_all"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'zines');

drop policy if exists "zines_storage_update_all" on storage.objects;
create policy "zines_storage_update_all"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'zines')
with check (bucket_id = 'zines');

drop policy if exists "zines_storage_delete_all" on storage.objects;
create policy "zines_storage_delete_all"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'zines');

-- 4) settings table
create table if not exists public.settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value) values ('info_content', '欢迎使用自由ZINE！\n\n你可以在这里创作电子书。\n点击底部按钮开始制作。')
on conflict (key) do nothing;

alter table public.settings enable row level security;

drop policy if exists "settings_select_all" on public.settings;
create policy "settings_select_all" on public.settings for select to anon, authenticated using (true);

drop policy if exists "settings_update_all" on public.settings;
create policy "settings_update_all" on public.settings for update to anon, authenticated using (true) with check (true);

drop policy if exists "settings_insert_all" on public.settings;
create policy "settings_insert_all" on public.settings for insert to anon, authenticated with check (true);

