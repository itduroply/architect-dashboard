-- Run this migration in Supabase before the next Lead Master upload.
-- Each time a Lead Master upload changes a lead's linked_architect, the upload screen writes one row here
-- (old architect, new architect, date). Nothing is backfilled: transfers made before this table existed have no row.
create table if not exists public.lead_architect_transfers (
  id bigint generated always as identity primary key,
  lead_id text not null,
  project_name text,
  from_architect text not null,
  from_architect_id text not null,
  to_architect text,
  to_architect_id text,
  transferred_at timestamptz not null default now()
);

create index if not exists lead_architect_transfers_lead_id_idx
  on public.lead_architect_transfers (lead_id);
create index if not exists lead_architect_transfers_from_architect_id_idx
  on public.lead_architect_transfers (from_architect_id);

comment on table public.lead_architect_transfers is
  'History of leads_master.linked_architect changes seen during Lead Master uploads. to_architect is null when the architect was removed from the lead.';
