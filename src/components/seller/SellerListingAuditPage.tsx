import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, ShieldAlert } from 'lucide-react';
import {
  createSellerListingAudit,
  listSellerListings,
  runSellerListingAudit,
} from '../../lib/api';
import type {
  SellerListing,
  SellerListingAudit,
  SellerListingAuditFinding,
} from './sellerTypes';

const statusLabel: Record<SellerListingAuditFinding['status'], string> = {
  PRESENT: 'Present',
  MISSING: 'Missing',
  REVIEW_REQUIRED: 'Review Required / Potential Issue',
};

function statusClass(status: SellerListingAuditFinding['status']): string {
  return status === 'PRESENT' ? 'good' : status === 'MISSING' ? 'bad' : 'warn';
}

export default function SellerListingAuditPage() {
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [audit, setAudit] = useState<SellerListingAudit | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    listSellerListings()
      .then(data => {
        setListings(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch(error => alert('Failed to load listings: ' + (error as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const selectedListing = useMemo(
    () => listings.find(listing => listing.id === selectedId) ?? null,
    [listings, selectedId]
  );

  const runAudit = async () => {
    if (!selectedListing) return;
    setRunning(true);
    try {
      const result = runSellerListingAudit(selectedListing);
      const saved = await createSellerListingAudit(selectedListing.id, result);
      setAudit(saved);
    } catch (error) {
      alert('Failed to save listing audit: ' + (error as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">SELLER CATALOGUE AUDIT</span>
          <h1>Listing Audit</h1>
          <p>Screen saved online listing information without uploading physical package images.</p>
        </div>
        <button className="btn outline" onClick={() => window.history.back()}><ArrowLeft size={16} /> Back</button>
      </div>

      <section className="panel listing-audit-selector">
        <label>
          Saved Seller Listing
          <select value={selectedId} onChange={event => { setSelectedId(event.target.value); setAudit(null); }} disabled={loading || running || listings.length === 0}>
            {listings.length === 0 && <option value="">No saved listings available</option>}
            {listings.map(listing => <option key={listing.id} value={listing.id}>{listing.listingTitle} · {listing.sku}</option>)}
          </select>
        </label>
        <button className="btn primary" onClick={runAudit} disabled={!selectedListing || running}>
          <ClipboardCheck size={16} /> {running ? 'Running Audit...' : 'Run Listing Audit'}
        </button>
      </section>

      {!loading && listings.length === 0 && (
        <section className="panel">
          <div className="empty">Create a Seller Listing first, then return here to audit its online declarations.</div>
        </section>
      )}

      {audit && selectedListing && (
        <section className="panel">
          <div className="audit-summary">
            <div>
              <span className="eyebrow">PRELIMINARY RESULT</span>
              <h2>{selectedListing.listingTitle}</h2>
              <p>Audited {new Date(audit.auditedAt).toLocaleString('en-IN')}</p>
            </div>
            <div className={'audit-score ' + (audit.status === 'COMPLIANT' ? 'good' : audit.status === 'NON_COMPLIANT' ? 'bad' : 'warn')}>
              <strong>{audit.score}/100</strong>
              <span>{audit.status.replace(/_/g, ' ')}</span>
            </div>
          </div>

          <div className="audit-disclaimer">
            <ShieldAlert size={17} />
            AI-assisted preliminary screening — officer verification required.
          </div>

          <table>
            <thead><tr><th>Declaration</th><th>Listing Value</th><th>Status</th><th>Finding</th></tr></thead>
            <tbody>
              {audit.findings.map(finding => (
                <tr key={finding.field}>
                  <td><strong>{finding.field}</strong></td>
                  <td>{finding.value || 'Not provided'}</td>
                  <td><span className={'badge ' + statusClass(finding.status)}>
                    {finding.status === 'PRESENT' ? <CheckCircle2 size={13} /> : finding.status === 'MISSING' ? <AlertTriangle size={13} /> : <ShieldAlert size={13} />}
                    {statusLabel[finding.status]}
                  </span></td>
                  <td>{finding.finding}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
