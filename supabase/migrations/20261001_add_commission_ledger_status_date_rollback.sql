-- Rollback for 20261001_add_commission_ledger_status_date.sql. This deletes all ledger status dates; dmi_claims.status_date is not touched.
alter table public.commission_ledger
  drop column if exists status_date;
