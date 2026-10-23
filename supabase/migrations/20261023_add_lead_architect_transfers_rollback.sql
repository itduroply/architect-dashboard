-- Rollback for 20261023_add_lead_architect_transfers.sql. This deletes the whole transfer history; leads_master and commission_ledger are not touched.
drop table if exists public.lead_architect_transfers;
