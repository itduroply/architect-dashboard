-- Run this migration in Supabase before running the claim processor, so each ledger row keeps its DMI approved status date.
alter table public.commission_ledger
  add column if not exists status_date date;

comment on column public.commission_ledger.status_date is
  'Approved status date of the claim, copied from dmi_claims.status_date ("Status Date" column of the DMI claim Excel).';

-- Backfill rows that already exist. The claim processor skips claims already in the ledger, so old rows are filled here.
update public.commission_ledger cl
set status_date = d.status_date::date
from public.dmi_claims d
where cl.status_date is null
  and d.claim_no = cl.claim_no;

-- Converted rows are stored as "<source claim>-1.N" (e.g. C2624680-2-1.7 comes from C2624680-2), so they take the source claim's date.
update public.commission_ledger cl
set status_date = d.status_date::date
from public.dmi_claims d
where cl.status_date is null
  and d.claim_no = split_part(cl.claim_no, '-', 1) || '-' || split_part(cl.claim_no, '-', 2);
