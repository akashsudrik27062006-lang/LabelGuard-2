create table if not exists public.seller_bulk_listing_audits (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  audited_at timestamptz not null default now(),
  total_listings integer not null check (total_listings > 0),
  compliant integer not null default 0 check (compliant >= 0),
  review_required integer not null default 0 check (review_required >= 0),
  potential_issues integer not null default 0 check (potential_issues >= 0),
  average_score numeric(5, 2) not null check (average_score >= 0 and average_score <= 100),
  listing_ids jsonb not null default '[]'::jsonb,
  results jsonb not null default '[]'::jsonb
);

create index if not exists seller_bulk_listing_audits_seller_idx
  on public.seller_bulk_listing_audits (seller_id, audited_at desc);

alter table public.seller_bulk_listing_audits enable row level security;

create policy "Sellers can view their own bulk listing audits"
  on public.seller_bulk_listing_audits for select
  using (seller_id = auth.uid());

create policy "Sellers can create their own bulk listing audits"
  on public.seller_bulk_listing_audits for insert
  with check (seller_id = auth.uid());
