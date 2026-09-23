import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileImage, ShieldAlert, Upload, XCircle } from 'lucide-react';
import { listSellerListings, runSellerPackageListingComparison } from '../../lib/api';
import type { PackageComparisonStatus, SellerListing, SellerPackageEvidence, SellerPackageListingComparison } from './sellerTypes';

type Panel = SellerPackageEvidence['panel'];
type UploadItem = { file: File; preview: string; panel: Panel };

const uploadSlots: { panel: Panel; label: string; required?: boolean; hint: string }[] = [
  { panel: 'PRINCIPAL', label: 'Principal Display Panel', required: true, hint: 'Primary front package image (required)' },
  { panel: 'BACK', label: 'Back Panel', hint: 'Manufacturer, care, dates, and other declarations' },
  { panel: 'SIDE', label: 'Side / Other Panel', hint: 'Side panel or seal information' },
  { panel: 'ADDITIONAL', label: 'Additional Evidence', hint: 'Any other relevant package evidence' }
];

const statusText: Record<PackageComparisonStatus, string> = {
  MATCH: 'MATCH',
  MISMATCH: 'MISMATCH',
  NOT_DETECTED: 'NOT DETECTED ON PACKAGE',
  REVIEW: 'REVIEW REQUIRED'
};

function statusClass(status: PackageComparisonStatus): string {
  return status === 'MATCH' ? 'good' : status === 'MISMATCH' ? 'bad' : 'warn';
}

function statusIcon(status: PackageComparisonStatus) {
  if (status === 'MATCH') return <CheckCircle2 size={14} />;
  if (status === 'MISMATCH') return <XCircle size={14} />;
  return <AlertTriangle size={14} />;
}

export default function SellerListingComparisonPage() {
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [listingId, setListingId] = useState('');
  const [uploads, setUploads] = useState<Partial<Record<Panel, UploadItem>>>({});
  const [comparison, setComparison] = useState<SellerPackageListingComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');

  useEffect(() => {
    listSellerListings()
      .then(data => {
        setListings(data);
        if (data.length > 0) setListingId(data[0].id);
      })
      .catch(error => alert('Failed to load listings: ' + (error as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const selectedListing = useMemo(
    () => listings.find(listing => listing.id === listingId) ?? null,
    [listings, listingId]
  );

  const setFile = (panel: Panel, file: File | undefined) => {
    if (!file) return;
    const previous = uploads[panel];
    if (previous) URL.revokeObjectURL(previous.preview);
    setUploads(current => ({ ...current, [panel]: { file, panel, preview: URL.createObjectURL(file) } }));
    setComparison(null);
    setValidationMessage('');
  };

  const removeFile = (panel: Panel) => {
    const previous = uploads[panel];
    if (previous) URL.revokeObjectURL(previous.preview);
    setUploads(current => {
      const next = { ...current };
      delete next[panel];
      return next;
    });
    setComparison(null);
    setValidationMessage('');
  };

  const runComparison = async () => {
    if (!selectedListing) {
      setValidationMessage('Select a saved listing before running the comparison.');
      return;
    }
    const selectedUploads = uploadSlots
      .map(slot => uploads[slot.panel])
      .filter((item): item is UploadItem => Boolean(item));
    if (!uploads.PRINCIPAL) {
      setValidationMessage('Upload the Principal Display Panel image before running the comparison.');
      return;
    }
    setValidationMessage('');
    setRunning(true);
    try {
      const result = await runSellerPackageListingComparison(selectedListing, selectedUploads);
      setComparison(result);
    } catch (error) {
      alert('Comparison failed: ' + (error as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">SELLER EVIDENCE REVIEW</span>
          <h1>Package ↔ Listing Comparison</h1>
          <p>Compare saved online listing declarations with the physical package evidence you provide.</p>
        </div>
        <button className="btn outline" onClick={() => window.history.back()}><ArrowLeft size={16} /> Back</button>
      </div>

      <section className="panel comparison-listing-selector">
        <label>
          Select Saved Listing
          <select value={listingId} onChange={event => { setListingId(event.target.value); setComparison(null); }} disabled={loading || running || listings.length === 0}>
            {listings.length === 0 && <option value="">No saved listings available</option>}
            {listings.map(listing => <option key={listing.id} value={listing.id}>{listing.listingTitle} · {listing.sku}</option>)}
          </select>
        </label>
        {selectedListing && (
          <div className="listing-summary-card">
            <strong>{selectedListing.productName}</strong>
            <span>SKU: {selectedListing.sku}</span>
            <span>Listed MRP: {selectedListing.listedMrp == null ? '—' : `₹${selectedListing.listedMrp}`}</span>
            <span>{selectedListing.marketplace} · {selectedListing.netQuantity || 'Quantity not provided'}</span>
          </div>
        )}
      </section>

      {!loading && listings.length === 0 && (
        <section className="panel"><div className="empty">Create a Seller Listing first, then return here for package comparison.</div></section>
      )}

      {selectedListing && (
        <section className="panel">
          <div className="comparison-section-heading">
            <div>
              <span className="eyebrow">PHYSICAL PACKAGE EVIDENCE</span>
              <h2>Upload Package Image(s)</h2>
              <p>Principal Display Panel is required. Other panels are optional and improve evidence coverage.</p>
            </div>
          </div>
          <div className="comparison-upload-grid">
            {uploadSlots.map(slot => {
              const upload = uploads[slot.panel];
              return (
                <div className={'comparison-upload-card' + (upload ? ' has-upload' : '')} key={slot.panel}>
                  <label className="comparison-upload-target">
                    <input type="file" accept="image/*" onChange={event => setFile(slot.panel, event.target.files?.[0])} disabled={running} />
                    {upload ? <img src={upload.preview} alt={slot.label} /> : <><Upload size={24} /><strong>{slot.label}{slot.required ? ' *' : ''}</strong><span>{slot.hint}</span></>}
                  </label>
                  {upload && (
                    <div className="comparison-file-row">
                      <FileImage size={14} />
                      <span title={upload.file.name}>{upload.file.name}</span>
                      <button type="button" className="linkbtn" onClick={() => removeFile(slot.panel)} disabled={running}>Replace</button>
                      <button type="button" className="linkbtn danger-link" onClick={() => removeFile(slot.panel)} disabled={running}>Remove</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {validationMessage && <p className="comparison-validation" role="alert">{validationMessage}</p>}
          <button className="btn primary comparison-run-button" onClick={runComparison} disabled={running || !uploads.PRINCIPAL}>
            <ShieldAlert size={16} /> {running ? 'Extracting and Comparing...' : 'Run Package ↔ Listing Comparison'}
          </button>
        </section>
      )}

      {comparison && selectedListing && (
        <section className="panel comparison-result">
          <div className="comparison-result-head">
            <div>
              <span className="eyebrow">PACKAGE ↔ LISTING COMPARISON</span>
              <h2>{selectedListing.productName}</h2>
              <p>AI-assisted preliminary comparison</p>
            </div>
            <div className={'audit-score ' + statusClass(comparison.status === 'MATCH' ? 'MATCH' : comparison.status === 'MISMATCH' ? 'MISMATCH' : 'REVIEW')}>
              <strong>{comparison.score}/100</strong>
              <span>{comparison.status}</span>
            </div>
          </div>
          <div className="audit-disclaimer">
            <ShieldAlert size={17} />
            AI-assisted preliminary comparison — officer verification required.
          </div>
          <h3>Package Evidence</h3>
          <div className="comparison-evidence-strip">
            {Object.values(uploads).map(upload => upload && <img key={upload.panel} src={upload.preview} alt={upload.panel} />)}
          </div>
          <h3>Field-by-field Comparison</h3>
          <div className="comparison-table-wrap">
            <table className="comparison-table">
              <thead><tr><th>Field</th><th>Online Listing</th><th>Package</th><th>Status</th></tr></thead>
              <tbody>
                {comparison.fields.map(field => (
                  <tr className={field.status === 'MISMATCH' ? 'comparison-mismatch' : ''} key={field.field}>
                    <td><strong>{field.field}</strong><small>{field.finding}</small></td>
                    <td>{field.onlineValue || 'Not provided'}</td>
                    <td>{field.packageValue || 'Not detected in supplied package image(s)'}</td>
                    <td><span className={'badge ' + statusClass(field.status)}>{statusIcon(field.status)} {statusText[field.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
