-- Spool survey: real spools weighed on a scale + a photo of each.
-- These labelled samples are the reference set for a later AI step that estimates
-- remaining filament (and its value) from a photo alone.
-- A sample may be any spool seen during the survey, so spool_id is optional.

create table public.spool_survey_samples (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  spool_id        uuid references public.spools (id) on delete set null,
  brand           text,
  material        text not null default 'PLA',
  color_name      text,
  diameter_mm     numeric(4, 2) not null default 1.75 check (diameter_mm > 0),
  gross_weight_g  numeric(10, 2) not null check (gross_weight_g > 0),   -- scale reading, spool + filament
  tare_weight_g   numeric(10, 2) not null check (tare_weight_g >= 0),   -- empty spool weight
  net_weight_g    numeric(10, 2) generated always as (gross_weight_g - tare_weight_g) stored,
  price_per_kg    numeric(14, 2) check (price_per_kg is null or price_per_kg >= 0),
  currency        text not null default 'IDR',
  photo_path      text not null,  -- spool-photos/{owner_id}/{uuid}.{ext}
  note            text,
  measured_at     timestamptz not null default now(),
  check (gross_weight_g >= tare_weight_g)
);
create index spool_survey_samples_owner_idx on public.spool_survey_samples (owner_id, measured_at desc);

alter table public.spool_survey_samples enable row level security;

create policy "survey: read own" on public.spool_survey_samples
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "survey: insert own" on public.spool_survey_samples
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and split_part(photo_path, '/', 1) = (select auth.uid())::text
    and (spool_id is null or exists (select 1 from public.spools s where s.id = spool_id))
  );
create policy "survey: delete own" on public.spool_survey_samples
  for delete to authenticated using (owner_id = (select auth.uid()));
revoke all on public.spool_survey_samples from anon;

-- Private bucket; path starts with the owner's uid like the other buckets.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('spool-photos', 'spool-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "spool photos: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'spool-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "spool photos: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'spool-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "spool photos: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'spool-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
