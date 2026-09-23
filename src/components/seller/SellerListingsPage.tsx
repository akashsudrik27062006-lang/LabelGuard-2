import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Edit3, Eye, Plus, Search, Trash2 } from 'lucide-react';
import {
  createSellerListing,
  deleteSellerListing,
  listSellerListings,
  updateSellerListing,
} from '../../lib/api';
import type { SellerListing, SellerListingInput } from './sellerTypes';

const emptyListing: SellerListingInput = {
  productName: '',
  brand: '',
  listingTitle: '',
  sku: '',
  category: '',
  marketplace: '',
  listingUrl: '',
  listedMrp: null,
  sellingPrice: null,
  netQuantity: '',
  manufacturerPackerImporter: '',
  countryOfOrigin: '',
  manufacturingPackingDate: '',
  bestBeforeUseBy: '',
  consumerCareDetails: '',
  description: '',
};

const fields: { key: keyof SellerListingInput; label: string; type?: string; required?: boolean }[] = [
  { key: 'productName', label: 'Product Name', required: true },
  { key: 'brand', label: 'Brand' },
  { key: 'listingTitle', label: 'Listing Title', required: true },
  { key: 'sku', label: 'SKU / Product ID', required: true },
  { key: 'category', label: 'Category', required: true },
  { key: 'marketplace', label: 'Marketplace / Platform', required: true },
  { key: 'listingUrl', label: 'Listing URL', type: 'url' },
  { key: 'listedMrp', label: 'Listed MRP', type: 'number' },
  { key: 'sellingPrice', label: 'Selling Price', type: 'number' },
  { key: 'netQuantity', label: 'Net Quantity' },
  { key: 'manufacturerPackerImporter', label: 'Manufacturer / Packer / Importer' },
  { key: 'countryOfOrigin', label: 'Country of Origin' },
  { key: 'manufacturingPackingDate', label: 'Manufacturing / Packing Date' },
  { key: 'bestBeforeUseBy', label: 'Best Before / Use By' },
  { key: 'consumerCareDetails', label: 'Consumer Care Details' },
];

export default function SellerListingsPage() {
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'list' | 'form' | 'detail'>('list');
  const [selected, setSelected] = useState<SellerListing | null>(null);
  const [form, setForm] = useState<SellerListingInput>(emptyListing);
  const [saving, setSaving] = useState(false);

  const loadListings = () => {
    setLoading(true);
    listSellerListings()
      .then(setListings)
      .catch(error => alert('Failed to load listings: ' + (error as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadListings();
  }, []);

  const filteredListings = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return listings;
    return listings.filter(listing =>
      [listing.productName, listing.listingTitle, listing.sku, listing.brand, listing.marketplace]
        .some(value => value.toLowerCase().includes(normalized))
    );
  }, [listings, query]);

  const openCreate = () => {
    setSelected(null);
    setForm(emptyListing);
    setMode('form');
  };

  const openEdit = (listing: SellerListing) => {
    setSelected(listing);
    setForm({
      productName: listing.productName,
      brand: listing.brand,
      listingTitle: listing.listingTitle,
      sku: listing.sku,
      category: listing.category,
      marketplace: listing.marketplace,
      listingUrl: listing.listingUrl,
      listedMrp: listing.listedMrp,
      sellingPrice: listing.sellingPrice,
      netQuantity: listing.netQuantity,
      manufacturerPackerImporter: listing.manufacturerPackerImporter,
      countryOfOrigin: listing.countryOfOrigin,
      manufacturingPackingDate: listing.manufacturingPackingDate,
      bestBeforeUseBy: listing.bestBeforeUseBy,
      consumerCareDetails: listing.consumerCareDetails,
      description: listing.description,
    });
    setMode('form');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = selected
        ? await updateSellerListing(selected.id, form)
        : await createSellerListing(form);
      setListings(current => selected
        ? current.map(item => item.id === saved.id ? saved : item)
        : [saved, ...current]);
      setSelected(saved);
      setMode('detail');
    } catch (error) {
      alert('Failed to save listing: ' + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (listing: SellerListing) => {
    if (!window.confirm(`Delete listing "${listing.listingTitle}"?`)) return;
    try {
      await deleteSellerListing(listing.id);
      setListings(current => current.filter(item => item.id !== listing.id));
      setSelected(null);
      setMode('list');
    } catch (error) {
      alert('Failed to delete listing: ' + (error as Error).message);
    }
  };

  if (mode === 'form') {
    return (
      <>
        <div className="page-title">
          <div>
            <span className="eyebrow">SELLER CATALOGUE</span>
            <h1>{selected ? 'Edit Listing' : 'Create Listing'}</h1>
            <p>Save reusable marketplace information without uploading package images.</p>
          </div>
          <button className="btn outline" onClick={() => setMode(selected ? 'detail' : 'list')}><ArrowLeft size={16} /> Back</button>
        </div>
        <form className="formpanel" onSubmit={save}>
          <div className="listing-form-grid">
            {fields.map(field => (
              <label key={field.key}>
                {field.label}{field.required ? ' *' : ''}
                <input
                  required={field.required}
                  type={field.type ?? 'text'}
                  min={field.type === 'number' ? 0 : undefined}
                  step={field.type === 'number' ? '0.01' : undefined}
                  value={form[field.key] ?? ''}
                  onChange={event => setForm(current => ({
                    ...current,
                    [field.key]: field.type === 'number'
                      ? (event.target.value === '' ? null : Number(event.target.value))
                      : event.target.value
                  }))}
                />
              </label>
            ))}
          </div>
          <label>
            Description
            <textarea value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} />
          </label>
          <div className="result-actions">
            <button type="button" className="btn outline" onClick={() => setMode(selected ? 'detail' : 'list')}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving...' : 'Save Listing'}</button>
          </div>
        </form>
      </>
    );
  }

  if (mode === 'detail' && selected) {
    const details = fields.map(field => ({ label: field.label, value: selected[field.key] }));
    return (
      <>
        <div className="page-title">
          <div>
            <span className="eyebrow">SAVED SELLER LISTING</span>
            <h1>{selected.listingTitle}</h1>
            <p>{selected.marketplace} · SKU {selected.sku}</p>
          </div>
          <div className="result-actions">
            <button className="btn outline" onClick={() => setMode('list')}><ArrowLeft size={16} /> Listings</button>
            <button className="btn primary" onClick={() => openEdit(selected)}><Edit3 size={16} /> Edit Listing</button>
          </div>
        </div>
        <section className="panel listing-detail">
          <div className="fields">
            {details.map(detail => detail.value !== null && detail.value !== '' && (
              <div key={detail.label}><span>{detail.label}</span><strong>{String(detail.value)}</strong></div>
            ))}
          </div>
          {selected.description && <><h2>Description</h2><p>{selected.description}</p></>}
          {selected.listingUrl && <a className="linkbtn" href={selected.listingUrl} target="_blank" rel="noopener noreferrer">Open marketplace listing</a>}
          <button className="linkbtn listing-delete" onClick={() => remove(selected)}><Trash2 size={14} /> Delete listing</button>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">E-COMMERCE SELLER DESK</span>
          <h1>Seller Listings</h1>
          <p>Manage reusable marketplace listing records before running future audits.</p>
        </div>
        <button className="btn primary" onClick={openCreate}><Plus size={16} /> Create Listing</button>
      </div>
      <div className="filters">
        <Search size={16} />
        <input placeholder="Search by title, product, SKU, brand, or marketplace..." value={query} onChange={event => setQuery(event.target.value)} />
      </div>
      <section className="panel">
        {loading ? <p>Loading listings...</p> : filteredListings.length === 0 ? (
          <div className="empty"><Plus size={18} /> {query ? 'No listings match your search.' : 'No listings saved yet. Create your first listing.'}</div>
        ) : (
          <table>
            <thead><tr><th>Listing</th><th>SKU</th><th>Marketplace</th><th>Price</th><th>Actions</th></tr></thead>
            <tbody>
              {filteredListings.map(listing => (
                <tr key={listing.id}>
                  <td><strong>{listing.listingTitle}</strong><br /><span className="table-muted">{listing.productName}{listing.brand ? ` · ${listing.brand}` : ''}</span></td>
                  <td className="num">{listing.sku}</td>
                  <td>{listing.marketplace}</td>
                  <td className="num">{listing.sellingPrice == null ? '—' : `₹${listing.sellingPrice.toFixed(2)}`}</td>
                  <td className="listing-actions">
                    <button className="linkbtn" onClick={() => { setSelected(listing); setMode('detail'); }}><Eye size={14} /> View</button>
                    <button className="linkbtn" onClick={() => openEdit(listing)}><Edit3 size={14} /> Edit</button>
                    <button className="linkbtn danger-link" onClick={() => remove(listing)}><Trash2 size={14} /> Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
