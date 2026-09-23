create table if not exists public.seller_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  product_name text not null,
  brand text,
  listing_title text not null,
  sku text not null,
  category text not null,
  marketplace text not null,
  listing_url text,
  listed_mrp numeric(12, 2),
  selling_price numeric(12, 2),
  net_quantity text,
  manufacturer_packer_importer text,
  country_of_origin text,
  manufacturing_packing_date text,
  best_before_use_by text,
  consumer_care_details text,
  description text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, sku)
);

create index if not exists seller_listings_seller_id_idx
  on public.seller_listings (seller_id);

alter table public.seller_listings enable row level security;

create policy "Sellers can view their own listings"
  on public.seller_listings for select
  using (seller_id = auth.uid());

create policy "Sellers can create their own listings"
  on public.seller_listings for insert
  with check (seller_id = auth.uid());

create policy "Sellers can update their own listings"
  on public.seller_listings for update
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());

create policy "Sellers can delete their own listings"
  on public.seller_listings for delete
  using (seller_id = auth.uid());

create or replace function public.set_seller_listing_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists seller_listings_updated_at on public.seller_listings;
create trigger seller_listings_updated_at
before update on public.seller_listings
for each row execute function public.set_seller_listing_updated_at();
