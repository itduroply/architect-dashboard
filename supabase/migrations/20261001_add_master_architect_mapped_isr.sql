-- Run this migration in Supabase before uploading the Master Architect Excel with the "Mapped ISR*" column.
alter table public.master_architect
  add column if not exists mapped_isr text;

comment on column public.master_architect.mapped_isr is
  'ISR mapped to the architect, imported from the "Mapped ISR*" column of the Master Architect Excel.';
