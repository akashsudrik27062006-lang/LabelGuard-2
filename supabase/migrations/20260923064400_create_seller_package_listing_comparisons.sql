create table if not exists public.seller_package_listing_comparisons (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.seller_listings(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  scan_id uuid references public.scans(id) on delete set null,
  compared_at timestamptz not null default now(),
  score integer not null check (score >= 0 and score <= 100),
  status text not null check (status in ('MATCH', 'MISMATCH', 'REVIEW')),
  extracted_declarations jsonb not null default '{}'::jsonb,
  field_comparisons jsonb not null default '[]'::jsonb,
  findings jsonb not null default '[]'::jsonb,
  package_evidence jsonb not null default '[]'::jsonb
);

create index if not exists seller_package_listing_comparisons_listing_idx
  on public.seller_package_listing_comparisons (listing_id, compared_at desc);

create index if not exists seller_package_listing_comparisons_seller_idx
  on public.seller_package_listing_comparisons (seller_id, compared_at desc);

alter table public.seller_package_listing_comparisons enable row level security;

create policy "Sellers can view their own package listing comparisons"
  on public.seller_package_listing_comparisons for select
  using (seller_id = auth.uid());

create policy "Sellers can create comparisons for their own listings"
  on public.seller_package_listing_comparisons for insert
  with check (
    seller_id = auth.uid()
    and exists (
      select 1
      from public.seller_listings
      where seller_listings.id = listing_id
        and seller_listings.seller_id = auth.uid()
    )
  );
