create table if not exists public.seller_listing_audits (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.seller_listings(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  audited_at timestamptz not null default now(),
  score integer not null check (score >= 0 and score <= 100),
  status text not null check (status in ('COMPLIANT', 'REVIEW_REQUIRED', 'NON_COMPLIANT')),
  checked_declarations jsonb not null default '[]'::jsonb,
  findings jsonb not null default '[]'::jsonb
);

create index if not exists seller_listing_audits_listing_id_idx
  on public.seller_listing_audits (listing_id, audited_at desc);

create index if not exists seller_listing_audits_seller_id_idx
  on public.seller_listing_audits (seller_id, audited_at desc);

alter table public.seller_listing_audits enable row level security;

create policy "Sellers can view their own listing audits"
  on public.seller_listing_audits for select
  using (seller_id = auth.uid());

create policy "Sellers can create audits for their own listings"
  on public.seller_listing_audits for insert
  with check (
    seller_id = auth.uid()
    and exists (
      select 1
      from public.seller_listings
      where seller_listings.id = listing_id
        and seller_listings.seller_id = auth.uid()
    )
  );
