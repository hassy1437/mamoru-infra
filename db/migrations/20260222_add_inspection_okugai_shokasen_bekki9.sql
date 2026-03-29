create table if not exists public.inspection_okugai_shokasen_bekki9 (
    id uuid primary key default gen_random_uuid(),
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    soukatsu_id uuid not null references public.inspection_soukatsu(id) on delete cascade,
    itiran_id uuid not null unique references public.inspection_itiran(id) on delete cascade,
    property_id uuid null references public.properties(id) on delete set null,
    payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_inspection_okugai_shokasen_bekki9_soukatsu_id
    on public.inspection_okugai_shokasen_bekki9 (soukatsu_id);

create index if not exists idx_inspection_okugai_shokasen_bekki9_property_id
    on public.inspection_okugai_shokasen_bekki9 (property_id);



