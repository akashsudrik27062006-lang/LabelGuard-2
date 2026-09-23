import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, FileText, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getScanResult,
  listProductGroups,
  listRealScans,
  listVersionsForGroup,
  mapToUiResult
} from '../../lib/api';

type ProductGroup = Awaited<ReturnType<typeof listProductGroups>>[number];
type ProductVersion = Awaited<ReturnType<typeof listVersionsForGroup>>[number];
type RealScan = Awaited<ReturnType<typeof listRealScans>>[number];

type HistoryRow = ProductVersion & {
  productName: string;
  productGroup: string;
  violationCount: number | null;
};

function statusClass(status: string): string {
  return status === 'COMPLIANT' ? 'good' : status === 'NOT CHECKED' ? '' : 'bad';
}

export default function ManufacturerVersionHistoryPage({ setScanResult }: {
  setScanResult: (result: undefined) => void;
}) {
  const nav = useNavigate();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingReportId, setLoadingReportId] = useState<string>();

  useEffect(() => {
    Promise.all([listProductGroups(), listRealScans()])
      .then(async ([productGroups, realScans]) => {
        const versionSets = await Promise.all(
          productGroups.map(async group => ({
            group,
            versions: await listVersionsForGroup(group.productGroup)
          }))
        );
        setRows(versionSets.flatMap(({ group, versions }) => versions.map(version => ({
          ...version,
          productName: group.name,
          productGroup: group.productGroup,
          violationCount: findViolationCount(version, group, realScans)
        }))));
      })
      .catch(error => alert('Failed to load version history: ' + (error as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return rows;
    return rows.filter(row =>
      [row.productName, row.versionLabel, row.date ?? ''].some(value => value.toLowerCase().includes(normalizedQuery))
    );
  }, [query, rows]);

  const openReport = async (scanId: string | null) => {
    if (!scanId) return;
    setLoadingReportId(scanId);
    try {
      const backendResult = await getScanResult(scanId);
      nav('/app/report', { state: mapToUiResult(backendResult) });
    } catch (error) {
      alert('Failed to load report: ' + (error as Error).message);
    } finally {
      setLoadingReportId(undefined);
    }
  };

  return (
    <main className="manufacturer-history">
      <div className="manufacturer-history-header">
        <span className="eyebrow">COMPLIANCE HISTORY</span>
        <h1>View Compliance History</h1>
        <p>The central record of every saved artwork version with timestamps and compliance status.</p>
      </div>

      <section className="manufacturer-history-search-card">
        <Search size={18} />
        <input
          aria-label="Search product or artwork version"
          placeholder="Search product or artwork version..."
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
      </section>

      <section className="manufacturer-history-table-card">
        {loading ? (
          <div className="manufacturer-history-table-state">Loading compliance history...</div>
        ) : visibleRows.length === 0 ? (
          <div className="manufacturer-history-table-state">
            <FileText size={34} />
            <strong>{rows.length === 0 ? 'No saved artwork versions found.' : 'No matching versions found.'}</strong>
            <p>{rows.length === 0 ? 'Saved artwork versions will appear here after an artwork check.' : 'Try a different product or artwork version search.'}</p>
          </div>
        ) : (
          <div className="manufacturer-history-table-wrap">
            <table className="manufacturer-history-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Artwork Version</th>
                  <th>Date</th>
                  <th>Compliance Score</th>
                  <th>Status</th>
                  <th>Findings</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(row => (
                  <tr key={row.productId}>
                    <td><strong>{row.productName}</strong></td>
                    <td><span className="manufacturer-history-version">{row.versionLabel}</span></td>
                    <td>{row.date ?? 'Not checked'}</td>
                    <td className="manufacturer-history-score">{row.score === null ? '—' : `${row.score}/100`}</td>
                    <td><span className={'badge ' + statusClass(row.status)}>{row.status.replace(/_/g, ' ')}</span></td>
                    <td>{row.violationCount === null ? '—' : row.violationCount}</td>
                    <td>
                      <div className="manufacturer-history-row-actions">
                        <button className="linkbtn" onClick={() => openReport(row.scanId)} disabled={!row.scanId || loadingReportId === row.scanId}>
                          <ExternalLink size={13} /> {loadingReportId === row.scanId ? 'Loading...' : 'Open Review'}
                        </button>
                        <button className="linkbtn" onClick={() => nav('/app/recommendations', { state: { productGroup: row.productGroup } })}>
                          <AlertTriangle size={13} /> View Recommendations
                        </button>
                        <button className="linkbtn" onClick={() => openReport(row.scanId)} disabled={!row.scanId || loadingReportId === row.scanId}>
                          <FileText size={13} /> Generate Report
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <span className="manufacturer-history-count">{visibleRows.length} of {rows.length} artwork version{rows.length === 1 ? '' : 's'}</span>
    </main>
  );
}

function findViolationCount(version: ProductVersion, group: ProductGroup, scans: RealScan[]): number | null {
  if (!version.scanId) return null;
  const matchingScan = scans.find(scan => scan.scanId === version.scanId);
  if (matchingScan) return matchingScan.violationCount;
  return version.productId === group.currentProductId ? group.issues : null;
}
