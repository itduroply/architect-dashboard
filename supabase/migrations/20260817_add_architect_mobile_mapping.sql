-- Run this migration in Supabase before using the Architect Mobile upload.
create table if not exists public.architect_mob (
  arch_id text primary key,
  mobile_no text not null unique,
  created_at timestamptz not null default now(),
  constraint architect_mob_arch_id_not_blank check (length(trim(arch_id)) > 0),
  constraint architect_mob_mobile_no_format check (mobile_no ~ '^[0-9]{10}$')
);

alter table public.commission_ledger
  add column if not exists architect_mobile text;

comment on column public.commission_ledger.architect_mobile is
  'Mobile number resolved from public.architect_mob using the Architect ID in leads_master.linked_architect.';
