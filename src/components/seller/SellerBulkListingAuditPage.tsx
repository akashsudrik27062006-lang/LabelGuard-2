import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Search, ShieldAlert } from 'lucide-react';
import { createSellerBulkListingAudit, listSellerListings } from '../../lib/api';
import type { SellerBulkListingAudit, SellerListing, SellerListingAuditFinding } from './sellerTypes';

function statusClass(status: string): string {
  return status === 'COMPLIANT' ? 'good' : status === 'NON_COMPLIANT' ? 'bad' : 'warn';
}

function findingClass(status: SellerListingAuditFinding['status']): string {
  return status === 'PRESENT' ? 'good' : status === 'MISSING' ? 'bad' : 'warn';
}

export default function SellerBulkListingAuditPage() {
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [audit, setAudit] = useState<SellerBulkListingAudit | null>(null);
  const [expandedId, setExpandedId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    listSellerListings()
      .then(setListings)
      .catch(error => alert('Failed to load listings: ' + (error as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const filteredListings = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return listings;
    return listings.filter(listing =>
      [listing.productName, listing.listingTitle, listing.sku, listing.marketplace, listing.manufacturerPackerImporter]
        .some(value => value.toLowerCase().includes(term))
    );
  }, [listings, query]);

  const allFilteredSelected = filteredListings.length > 0 && filteredListings.every(listing => selectedIds.includes(listing.id));

  const toggleListing = (id: string) => {
    setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
    setAudit(null);
  };

  const toggleAllFiltered = () => {
    setSelectedIds(current => allFilteredSelected
      ? current.filter(id => !filteredListings.some(listing => listing.id === id))
      : Array.from(new Set([...current, ...filteredListings.map(listing => listing.id)])));
    setAudit(null);
  };

  const runAudit = async () => {
    const selected = listings.filter(listing => selectedIds.includes(listing.id));
    if (selected.length === 0) {
      alert('Select at least one saved listing first.');
      return;
    }
    setRunning(true);
    try {
      const saved = await createSellerBulkListingAudit(selected);
      setAudit(saved);
      setExpandedId(undefined);
    } catch (error) {
      alert('Failed to save bulk listing audit: ' + (error as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">SELLER CATALOGUE AUDIT</span>
          <h1>Bulk Listing Audit</h1>
          <p>Audit multiple saved online listings together. No package images are required.</p>
        </div>
        <button className="btn primary" onClick={runAudit} disabled={running || selectedIds.length === 0}>
          <ClipboardCheck size={16} /> {running ? 'Auditing...' : 'Run Bulk Listing Audit'}
        </button>
      </div>

      <div className="filters">
        <Search size={16} />
        <input placeholder="Search product, listing title, SKU, marketplace, or manufacturer..." value={query} onChange={event => setQuery(event.target.value)} />
        <span className="bulk-selection-count">{selectedIds.length} selected</span>
      </div>

      <section className="panel bulk-listings-panel">
        {loading ? <p>Loading saved listings...</p> : listings.length === 0 ? (
          <div className="empty">Create a Seller Listing first, then return here for a bulk audit.</div>
        ) : filteredListings.length === 0 ? (
          <p>No listings match your search.</p>
        ) : (
          <div className="bulk-listings-table-wrap">
            <table>
              <thead>
                <tr>
                  <th><input type="checkbox" aria-label="Select all visible listings" checked={allFilteredSelected} onChange={toggleAllFiltered} /></th>
                  <th>Product Name</th><th>Listing Title</th><th>SKU</th><th>Marketplace</th><th>MRP</th><th>Net Quantity</th><th>Manufacturer</th>
                </tr>
              </thead>
              <tbody>
                {filteredListings.map(listing => (
                  <tr key={listing.id}>
                    <td><input type="checkbox" aria-label={`Select ${listing.listingTitle}`} checked={selectedIds.includes(listing.id)} onChange={() => toggleListing(listing.id)} /></td>
                    <td><strong>{listing.productName}</strong></td>
                    <td>{listing.listingTitle}</td>
                    <td className="num">{listing.sku}</td>
                    <td>{listing.marketplace}</td>
                    <td className="num">{listing.listedMrp == null ? '—' : `₹${listing.listedMrp}`}</td>
                    <td>{listing.netQuantity || '—'}</td>
                    <td>{listing.manufacturerPackerImporter || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {audit && (
        <section className="panel">
          <div className="bulk-audit-summary">
            <article><b className="num">{audit.totalListings}</b><span>Total Listings</span></article>
            <article className="good"><b className="num">{audit.compliant}</b><span>Compliant</span></article>
            <article className="warn"><b className="num">{audit.reviewRequired}</b><span>Review Required</span></article>
            <article className="bad"><b className="num">{audit.potentialIssues}</b><span>Potential Issues</span></article>
            <article><b className="num">{audit.averageScore}/100</b><span>Average Score</span></article>
          </div>
          <div className="audit-disclaimer">
            <ShieldAlert size={17} />
            AI-assisted preliminary screening — officer verification required.
          </div>
          <h2>Bulk Audit Results</h2>
          <table>
            <thead><tr><th>Product</th><th>SKU</th><th>Marketplace</th><th>Score</th><th>Status</th><th>Findings</th><th>Action</th></tr></thead>
            <tbody>
              {audit.results.map(result => (
                <>
                  <tr key={result.listingId}>
                    <td><strong>{result.productName}</strong></td>
                    <td className="num">{result.sku}</td>
                    <td>{result.marketplace}</td>
                    <td className="num">{result.score}/100</td>
                    <td><span className={'badge ' + statusClass(result.status)}>{result.status.replace(/_/g, ' ')}</span></td>
                    <td className="num">{result.findings.filter(finding => finding.status !== 'PRESENT').length}</td>
                    <td><button className="linkbtn" onClick={() => setExpandedId(current => current === result.listingId ? undefined : result.listingId)}>View Details</button></td>
                  </tr>
                  {expandedId === result.listingId && (
                    <tr key={result.listingId + '-details'}>
                      <td colSpan={7}>
                        <div className="bulk-result-details">
                          {result.findings.map(finding => (
                            <div key={finding.field}><span>{finding.field}</span><strong>{finding.value || 'Not provided'}</strong><em className={'badge ' + findingClass(finding.status)}>{finding.status.replace(/_/g, ' ')}</em><small>{finding.finding}</small></div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
