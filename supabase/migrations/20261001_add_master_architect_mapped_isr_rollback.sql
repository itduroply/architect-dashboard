-- Rollback for 20261001_add_master_architect_mapped_isr.sql. This deletes all Mapped ISR values.
alter table public.master_architect
  drop column if exists mapped_isr;
