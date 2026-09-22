import React, { useState } from 'react';

import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, CheckCircle2, AlertTriangle, XCircle, Upload, FileText, LogOut, Search,
  Camera, LayoutDashboard, History as HistoryIcon, ClipboardCheck, Flag, RefreshCw,
  Printer, MapPin, ExternalLink, ArrowRight, Sparkles, BookOpen, Check,
  MessageSquare, ArrowLeftRight, ShieldAlert, PhoneCall, AlertCircle
} from 'lucide-react';
import './styles.css';
import { supabase } from './lib/supabase';
import { startScan, getScanResult, mapToUiResult, listRealScans, updateViolationDecision, updateScanStatus, submitComplaint, listComplaintsReal, getDashboardStats, startComplaintInvestigation, resolveComplaint, getEvidenceImageUrl, getAllEvidenceImages, listNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead, startBulkScan, listProductGroups, listVersionsForGroup, compareVersions, compareVersionsDetailed, FIELD_LABELS, listRecommendations, setManufacturerAction, nextVersionLabel, listManufacturerChecks } from './lib/api';
type DbProfile = {
  id: string;
  full_name: string;
  role: 'MANUFACTURER' | 'OFFICER' | 'SELLER' | 'CONSUMER';
  organization_id: string | null;
};

type Role = 'officer' | 'manufacturer' | 'seller' | 'consumer';
type Status = 'COMPLIANT' | 'WARNING' | 'NON_COMPLIANT' | 'INSPECTOR_CONFIRMED_NON_COMPLIANT' | 'UNDER_REINSPECTION';
type Permission = 'scan' | 'detailed' | 'records' | 'officialReport' | 'complaint' | 'manageRules' | 'analytics' | 'review';
type Confidence = Record<string, number>;
type RuleRef = { law: string; section: string; url: string };

type RuleViolation = {
  dbId?: string;
  requirement: string;
  section: string;
  status: 'PASSED' | 'MALFORMED' | 'MISSING';
  detectedValue: string;
  expectedValue: string;
  explanation: string;
  ruleRef: RuleRef;
  recommendation: string;
  officerDecision?: 'VERIFIED' | 'REJECTED';
};

type Product = {
  id: string;
  name: string;
  manufacturer: string;
  category: string;
  image: string;
  fields: Record<string, string>;
  status: Status;
  location?: string;
  confidence?: Record<string, number>;
  productGroup?: string;
  versionLabel?: string;
};

type Result = {
  id: string;
  dbScanId?: string;
  product: Product;
  score: number;
  status: Status;
  violations: RuleViolation[];
  date: string;
  review?: {
    inspector: string;
    remarks?: string;
    confirmedAt: string;
  };
};

type Complaint = {
  id: string;
  dbId?: string;
  productId?: string | null;
  scanId?: string | null;
  productName: string;
  brand: string;
  category: string;
  issueType: string;
  description: string;
  status: 'SUBMITTED' | 'UNDER_INVESTIGATION' | 'RESOLVED';
  outcome?: 'CONFIRMED' | 'REJECTED' | null;
  officerRemarks?: string | null;
  amountCharged?: number | null;
  mrp?: number | null;
  date: string;
  assignedOfficer?: string;
  evidenceImage?: string;
};

const URL_ACT_2009 = 'https://consumeraffairs.gov.in/pages/legal-metrology-act';
const URL_PCR_2011 = 'https://indiankanoon.org/doc/100694501/';
const URL_AMEND_2023 = 'https://www.legitquest.com/act/legal-metrology-packaged-commodities-amendment-rules-2023/E049';
const URL_NCH = 'https://consumerhelpline.gov.in/';

const products: Product[] = [
  {
    id: 'rice',
    name: 'Premium Basmati Rice',
    manufacturer: 'ABC Foods Pvt. Ltd.',
    category: 'Food grain',
    image: '🍚',
    status: 'COMPLIANT',
    fields: {
      'Generic Name': 'Premium Basmati Rice',
      'Net Quantity': '5 kg',
      'MRP': '₹650 (incl. of all taxes)',
      'Manufacturer': 'ABC Foods Pvt. Ltd., Pune 411001',
      'Country of Origin': 'India',
      'Consumer Care': '1800-123-4567, care@abcfoods.com',
      'Packing Date': '07/2026'
    },
    location: 'Retail Store, Pune, Maharashtra',
    confidence: { 'Generic Name': 99, 'Net Quantity': 98, 'MRP': 97, 'Manufacturer': 96, 'Country of Origin': 95, 'Consumer Care': 93, 'Packing Date': 97 }
  },
  {
    id: 'oil',
    name: 'PureDrop Cooking Oil',
    manufacturer: 'Narmada Essentials',
    category: 'Edible oil',
    image: '🫗',
    status: 'NON_COMPLIANT',
    fields: {
      'Generic Name': 'PureDrop Cooking Oil',
      'Net Quantity': '1 Litre (900 mL)',
      'MRP': '₹340 (incl. of taxes)',
      'Manufacturer': 'Narmada Essentials, Indore, MP',
      'Country of Origin': 'India',
      'Consumer Care': '1800-780-1212',
      'Packing Date': '07/2026'
    },
    location: 'Grocery World, Indore',
    confidence: { 'Generic Name': 96, 'Net Quantity': 62, 'MRP': 95, 'Manufacturer': 93, 'Country of Origin': 94, 'Consumer Care': 90, 'Packing Date': 93 }
  },
  {
    id: 'biscuits',
    name: 'Golden Crunch Biscuits',
    manufacturer: 'Sunrise Foods India',
    category: 'Packaged food',
    image: '🍪',
    status: 'NON_COMPLIANT',
    fields: {
      'Generic Name': 'Golden Crunch Biscuits',
      'Net Quantity': '300 g',
      'MRP': 'Not detected',
      'Manufacturer': 'Sunrise Foods India, Noida, UP',
      'Country of Origin': 'India',
      'Consumer Care': '1800-222-9090',
      'Packing Date': '06/2026'
    },
    location: 'Super Mart, Sector 18, Noida',
    confidence: { 'Generic Name': 97, 'Net Quantity': 95, 'Manufacturer': 92, 'Consumer Care': 94, 'Packing Date': 91 }
  },
  {
    id: 'spices',
    name: 'Heritage Turmeric Powder',
    manufacturer: 'Not detected',
    category: 'Spices',
    image: '🫙',
    status: 'NON_COMPLIANT',
    fields: {
      'Generic Name': 'Heritage Turmeric Powder',
      'Net Quantity': '200 g',
      'MRP': '₹95',
      'Manufacturer': 'Not detected',
      'Country of Origin': 'India',
      'Consumer Care': 'Not detected',
      'Packing Date': '08/2026'
    },
    location: 'Local Kirana Store, Chandni Chowk, Delhi',
    confidence: { 'Generic Name': 94, 'Net Quantity': 92, 'MRP': 90, 'Country of Origin': 88, 'Packing Date': 85 }
  },
];

const mockViolations = (p: Product): RuleViolation[] => {
  if (p.id === 'oil') {
    return [
      {
        requirement: 'Net Quantity Specification',
        section: 'Rule 6(1)(b)',
        status: 'MALFORMED',
        detectedValue: '1 Litre (900 mL)',
        expectedValue: '1 L or 1000 mL (Consistent SI unit)',
        explanation: 'Contradictory volume declared: 1 Litre mathematically equals 1000 mL, not 900 mL. This misleads the buyer on true packaged content.',
        ruleRef: { law: 'Legal Metrology (Packaged Commodities) Rules, 2011', section: 'Rule 6(1)(b)', url: URL_PCR_2011 },
        recommendation: 'Declare uniform standard metric units without conflicting parenthetical weights.'
      }
    ];
  }
  if (p.id === 'biscuits') {
    return [
      {
        requirement: 'Maximum Retail Price (MRP)',
        section: 'Rule 6(1)(e)',
        status: 'MISSING',
        detectedValue: 'Not detected on display panel',
        expectedValue: 'MRP Rs. / ₹ ... (inclusive of all taxes)',
        explanation: 'The package lacks any visible or unambiguous Maximum Retail Price declaration on the principal display panel.',
        ruleRef: { law: 'Legal Metrology (Packaged Commodities) Rules, 2011', section: 'Rule 6(1)(e)', url: URL_PCR_2011 },
        recommendation: 'Print clear, unambiguous MRP inclusive of all applicable taxes.'
      }
    ];
  }
  if (p.id === 'spices') {
    return [
      {
        requirement: 'Manufacturer / Packer Identification',
        section: 'Rule 6(1)(a)',
        status: 'MISSING',
        detectedValue: 'Not detected',
        expectedValue: 'Full corporate name and registered address of Manufacturer/Packer',
        explanation: 'No registered packer or manufacturing address was found printed on the product packaging.',
        ruleRef: { law: 'Legal Metrology (Packaged Commodities) Rules, 2011', section: 'Rule 6(1)(a)', url: URL_PCR_2011 },
        recommendation: 'Add the complete manufacturing or packing enterprise name and postal pin code.'
      },
      {
        requirement: 'Consumer Grievance Redressal Mechanism',
        section: 'Rule 6(2)',
        status: 'MISSING',
        detectedValue: 'Not detected',
        expectedValue: 'Designated helpline phone number, email ID, and postal address',
        explanation: 'Missing mandatory consumer care helpline credentials for grievance redressal.',
        ruleRef: { law: 'Legal Metrology (Packaged Commodities) Rules, 2011', section: 'Rule 6(2)', url: URL_PCR_2011 },
        recommendation: 'Include active customer care phone and email contact details.'
      }
    ];
  }
  return [];
};

const makeMockResult = (p: Product): Result => ({
  id: 'INSP-' + Math.floor(1000 + Math.random() * 9000),
  product: p,
  score: p.status === 'COMPLIANT' ? 98 : p.id === 'oil' ? 74 : p.id === 'biscuits' ? 62 : 48,
  status: p.status,
  violations: mockViolations(p),
  date: new Date().toLocaleDateString('en-IN')
});

const initialComplaints: Complaint[] = [
  {
    id: 'CMP-8821',
    productName: 'Heritage Turmeric Powder',
    brand: 'Heritage Foods',
    category: 'Spices',
    issueType: 'Missing Manufacturer Details',
    description: 'Bought at Chandni Chowk store. No manufacturer address or consumer helpline number printed on pack.',
    status: 'SUBMITTED',
    date: '24/08/2026',
    assignedOfficer: 'Ananya Sharma'
  },
  {
    id: 'CMP-7714',
    productName: 'PureDrop Cooking Oil',
    brand: 'Narmada Essentials',
    category: 'Edible oil',
    issueType: 'Misleading Quantity',
    description: 'Package shows 1 Litre on front but 900 ml on back side in small font.',
    status: 'UNDER_INVESTIGATION',
    date: '20/08/2026',
    assignedOfficer: 'Ananya Sharma'
  }
];

const labels: Record<Role, string> = {
  officer: 'Legal Metrology Officer',
  manufacturer: 'Manufacturer / Packer',
  seller: 'E-commerce / Seller',
  consumer: 'Consumer'
};

const creds: Record<Role, { email: string; password: string; name: string }> = {
  officer: { email: 'thombreomkar098+officer@gmail.com', password: 'Demo@Officer123', name: 'Ananya Sharma (Insp. ID: LMO-441)' },
  manufacturer: { email: 'thombreomkar098+manufacturer@gmail.com', password: 'Demo@Manufacturer123', name: 'ABC Foods Quality Desk' },
  seller: { email: 'thombreomkar098+seller@gmail.com', password: 'Demo@Seller123', name: 'Marketplace Seller Desk' },
  consumer: { email: 'thombreomkar098+consumer@gmail.com', password: 'Demo@Consumer123', name: 'Rahul Verma' },
};

const ruleSummaries = [
  {
    id: 'act-2009',
    title: 'Legal Metrology Act, 2009',
    subtitle: 'Primary Central Act',
    url: URL_ACT_2009,
    source: 'Ministry of Consumer Affairs',
    simpleTakeaway: 'The parent legislation in India establishing legal standards for weights, measures, numerical units, and consumer trade protections.',
    keyPoints: [
      'Standard Metric Units: All pre-packaged goods must declare contents strictly in standard SI metric units (kg, g, L, ml, m).',
      'Statutory Protection: Selling, manufacturing, or distributing packages without mandatory declarations is an offence under Section 18.',
      'Enforcement Powers: Empowers Legal Metrology Officers to inspect premises, audit stock, and seize non-compliant goods under Section 15.',
      'Penal Consequences: Prescribes fines up to ₹25,000 for the first offence, ₹50,000 for the second, and imprisonment for subsequent offences under Section 36.'
    ]
  },
  {
    id: 'pcr-2011',
    title: 'Packaged Commodities Rules (PCR), 2011',
    subtitle: 'Mandatory PDP Declarations',
    url: URL_PCR_2011,
    source: 'Indian Kanoon Statutory Library',
    simpleTakeaway: 'Specifies the mandatory declaration fields that must appear clearly on the Principal Display Panel (PDP) of all packaged products.',
    keyPoints: [
      '1. Manufacturer / Packer Details: Registered legal name and complete postal address of the manufacturer, packer, or importer.',
      '2. Generic Name: Unambiguous common or trade name of the product inside.',
      '3. Net Quantity: Stated accurately with valid metric units and symbols (e.g., 500 g, 2 L).',
      '4. Packing Date: Month and year of packing, manufacturing, or import.',
      '5. Maximum Retail Price: Stated as "MRP ₹ / Rs. ... (inclusive of all taxes)".',
      '6. Consumer Care Helpline: Mandatory telephone number, email, and postal address for grievance redressal.',
      '7. Country of Origin: Clear declaration of the country where the product was manufactured.'
    ]
  },
  {
    id: 'amend-2023',
    title: 'Packaged Commodities (Amendment) Rules, 2023',
    subtitle: 'Unit Pricing & Digital Marketplace Rules',
    url: URL_AMEND_2023,
    source: 'LegitQuest Legal Portal',
    simpleTakeaway: 'Standardizes Unit Sale Price (USP) declarations and enforces mandatory label transparency across online marketplaces.',
    keyPoints: [
      'Unit Sale Price (USP): Mandatory declaration per gram or milliliter for packages exceeding 1 kg or 1 L to enable transparent pricing.',
      'E-commerce Transparency: Marketplaces (Amazon, Flipkart, Blinkit, etc.) must show all mandatory declarations on digital product pages.',
      'Contrast & Typography: Strict minimum font height and high-contrast color visibility standards for readable packaging.'
    ]
  }
];

const cls = (s: Status) => (s === 'COMPLIANT' ? 'good' : s === 'WARNING' || s === 'UNDER_REINSPECTION' ? 'warn' : 'bad');

function Seal({ score, statusLabel, tone, size = 96 }: { score: number; statusLabel: string; tone: 'good' | 'warn' | 'bad'; size?: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const strokeColor = tone === 'good' ? 'var(--status-good)' : tone === 'warn' ? 'var(--status-warn)' : 'var(--status-bad)';
  const offset = c - (score / 100) * c;

  return (
    <div className={`seal seal-${tone}`}>
      <div className="seal-ring-wrapper">
        <svg width={size} height={size} viewBox="0 0 96 96">
          <circle cx="48" cy="48" r={r} stroke="var(--border-light)" strokeWidth="6" fill="none" />
          <circle
            cx="48"
            cy="48"
            r={r}
            stroke={strokeColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            fill="none"
            transform="rotate(-90 48 48)"
          />
        </svg>
        <div className="seal-center-text">
          <b>{score}</b>
          <span>/100</span>
        </div>
      </div>
      <div className="seal-badge">{statusLabel.replace(/_/g, ' ')}</div>
    </div>
  );
}

function ScanGauge({ progress }: { progress: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, progress)) / 100) * c;
  return (
    <svg viewBox="0 0 64 64" width="60" height="60">
      <circle cx="32" cy="32" r={r} stroke="rgba(255,255,255,0.2)" strokeWidth="5" fill="none" />
      <circle
        cx="32"
        cy="32"
        r={r}
        stroke="var(--brand-primary)"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        style={{ strokeDasharray: c, strokeDashoffset: offset }}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="37" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="700" fontFamily="var(--font-mono)">
        {progress}%
      </text>
    </svg>
  );
}

function NchCard() {
  return (
    <section className="panel" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', marginTop: '20px' }}>
      <span className="eyebrow" style={{ color: '#0b6675', fontWeight: 800 }}>OFFICIAL GRIEVANCE SUPPORT</span>
      <h3 style={{ fontSize: '18px', margin: '6px 0 10px', color: '#0f172a' }}>National Consumer Helpline</h3>
      <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#475569' }}>
        Consumers can use the National Consumer Helpline to seek assistance or register a consumer grievance.
      </p>
      <p style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
        Helpline: <span style={{ color: '#0b6675' }}>1915</span>
      </p>
      <a
        className="btn outline"
        href={URL_NCH}
        target="_blank"
        rel="noopener noreferrer"
        style={{ background: '#ffffff', color: '#0f172a', fontWeight: 700, borderColor: '#cbd5e1' }}
      >
        Visit National Consumer Helpline <ExternalLink size={13} />
      </a>
    </section>
  );
}

const SCAN_STEPS = [
  'Reading package display panel...',
  'Extracting mandatory declarations (OCR)...',
  'Checking Maximum Retail Price (Rule 6(1)(e))...',
  'Validating Net Quantity & SI Units (Rule 6(1)(b))...',
  'Verifying Manufacturer / Packer details (Rule 6(1)(a))...',
  'Checking Consumer Care helpline credentials (Rule 6(2))...',
  'Applying Legal Metrology (PCR) 2011 compliance rules...',
  'Generating compliance assessment...'
];

const IMAGE_SLOTS: { type: 'FRONT' | 'BACK' | 'STRIP'; label: string; hint: string; required: boolean }[] = [
  { type: 'FRONT', label: 'Front panel', hint: 'Brand, product name', required: true },
  { type: 'BACK', label: 'Back panel', hint: 'Manufacturer, consumer care', required: false },
  { type: 'STRIP', label: 'Tear-strip / seal', hint: 'Often has MRP, batch info', required: false },
];

function Scanner({ done, role, productGroup, versionLabel, lockedProductName }: { done: (r: Result) => void; role: Role; productGroup?: string; versionLabel?: string; lockedProductName?: string }) {
  const [slots, setSlots] = useState<Record<string, { file: File; preview: string } | undefined>>({});
  const [productName, setProductName] = useState(lockedProductName ?? '');
  const [isImported, setIsImported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const setSlotFile = (type: string, f: File | undefined) => {
    setSlots(prev => ({ ...prev, [type]: f ? { file: f, preview: URL.createObjectURL(f) } : undefined }));
  };

  const hasAnyImage = Object.values(slots).some(Boolean);

  const analyze = async () => {
    if (!hasAnyImage) return alert('Please upload at least the front panel image.');
    if (!productName.trim()) return alert('Please enter a product name.');
    setLoading(true);
    setStatusMsg('Uploading image(s) and running AI analysis (this can take 10-20 seconds)...');
    try {
      const images = IMAGE_SLOTS
        .filter(s => slots[s.type])
        .map(s => ({ file: slots[s.type]!.file, type: s.type }));

      const { scanId } = await startScan({
        images,
        productName: productName.trim(),
        category: 'Packaged food',
        scanType: role.toUpperCase() as 'OFFICER' | 'MANUFACTURER' | 'SELLER' | 'CONSUMER',
        isImported,
        productGroup,
        versionLabel
      });
      const backendResult = await getScanResult(scanId);
      const uiResult = mapToUiResult(backendResult);
      done(uiResult as unknown as Result);
    } catch (e) {
      alert('Scan failed: ' + ((e as Error).message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="scanner">
      <div className="sample-picker">
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', maxWidth: '360px' }}>
          <b>Product Name</b>
          <input
            type="text"
            placeholder="e.g. Amul Ghee 500g"
            value={productName}
            onChange={e => setProductName(e.target.value)}
            disabled={loading}
            style={{ padding: '10px 12px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)' }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontWeight: 500, fontSize: '13px' }}>
          <input type="checkbox" checked={isImported} onChange={e => setIsImported(e.target.checked)} disabled={loading} style={{ width: 'auto' }} />
          This product is imported (Country of Origin declaration will be checked)
        </label>
        {versionLabel && (
          <div style={{ marginTop: '8px' }}>
            <span className="badge good">Uploading as {versionLabel}</span>
          </div>
        )}
      </div>

      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 12px' }}>
        Many labels split info across panels — add the back and the tear-strip near the seal too for the most accurate result (only Front is required).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
        {IMAGE_SLOTS.map(slot => {
          const current = slots[slot.type];
          return (
            <label key={slot.type} className="dropzone" style={{ height: '180px' }}>
              <input
                aria-label={`Upload ${slot.label}`}
                type="file"
                accept="image/*"
                onChange={e => setSlotFile(slot.type, e.target.files?.[0])}
                disabled={loading}
              />
              {current ? (
                <img src={current.preview} alt={slot.label + ' preview'} />
              ) : (
                <>
                  <Upload size={22} />
                  <b style={{ fontSize: '13px' }}>{slot.label}{slot.required ? '' : ' (optional)'}</b>
                  <span style={{ fontSize: '11px' }}>{slot.hint}</span>
                </>
              )}
            </label>
          );
        })}
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '24px', background: 'var(--bg-sidebar)', borderRadius: 'var(--radius-md)', marginTop: '16px' }}>
          <ScanGauge progress={60} />
          <b style={{ color: '#fff', fontSize: '14px', textAlign: 'center' }}>{statusMsg}</b>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>Evaluating against statutory Legal Metrology rules</span>
        </div>
      )}

      {hasAnyImage && (
        <div className="scan-actions">
          <button
            className="btn outline"
            onClick={() => IMAGE_SLOTS.forEach(s => setSlotFile(s.type, undefined))}
            disabled={loading}
          >
            Remove All Images
          </button>
          <button className="btn primary" onClick={analyze} disabled={loading}>
            {loading ? <RefreshCw className="spin" size={16} /> : <Camera size={16} />}
            {loading ? 'Analyzing...' : role === 'consumer' ? 'Check Product' : 'Run Compliance Scan'}
          </button>
        </div>
      )}
    </section>
  );
}

function OfficerDashboard({ onNewScan }: { onNewScan: () => void }) {
  const nav = useNavigate();
  const [stats, setStats] = useState({ totalScans: 0, compliant: 0, nonCompliant: 0, review: 0, pendingComplaints: 0, confirmedViolations: 0 });
  const [recentScans, setRecentScans] = useState<Awaited<ReturnType<typeof listRealScans>>>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    Promise.all([getDashboardStats(), listRealScans()])
      .then(([s, scans]) => { setStats(s); setRecentScans(scans.slice(0, 3)); })
      .catch(e => alert('Failed to load dashboard: ' + (e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const compliantPct = stats.totalScans > 0 ? Math.round((stats.compliant / stats.totalScans) * 100) : 0;
  const nonCompliantPct = stats.totalScans > 0 ? Math.round((stats.nonCompliant / stats.totalScans) * 100) : 0;
  const reviewPct = stats.totalScans > 0 ? Math.round((stats.review / stats.totalScans) * 100) : 0;

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">ENFORCEMENT COMMAND CENTRE</span>
          <h1>Legal Metrology Officer Dashboard</h1>
          <p>Monitor package violations, audit consumer complaints, and execute statutory enforcement actions.</p>
        </div>
        <button className="btn primary" onClick={onNewScan}><Camera size={16} /> Start New Inspection</button>
      </div>

      <div className="stats">
        <article><b className="num">{stats.totalScans}</b><span>Total Inspections</span></article>
        <article><b className="num" style={{ color: 'var(--status-bad)' }}>{stats.confirmedViolations}</b><span>Confirmed Violations</span></article>
        <article><b className="num" style={{ color: 'var(--status-warn)' }}>{stats.review}</b><span>Under Re-inspection</span></article>
        <article><b className="num" style={{ color: 'var(--brand-primary)' }}>{stats.pendingComplaints}</b><span>Pending Complaints</span></article>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <h2>Statutory Compliance Distribution</h2>
          {stats.totalScans === 0 ? (
            <p>No scans yet.</p>
          ) : (
            <div className="bars">
              <p><span>Compliant</span><i style={{ width: compliantPct + '%' }}></i><b className="num">{compliantPct}%</b></p>
              <p><span>Non-Compliant</span><i className="redbar" style={{ width: nonCompliantPct + '%' }}></i><b className="num">{nonCompliantPct}%</b></p>
              <p><span>Warnings / Re-inspect</span><i className="amberbar" style={{ width: reviewPct + '%' }}></i><b className="num">{reviewPct}%</b></p>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Enforcement Action Queue</h2>
          {stats.pendingComplaints > 0 && (
            <div className="alert" style={{ background: 'var(--status-bad-bg)', border: '1px solid var(--status-bad-border)' }}>
              <AlertTriangle size={18} color="var(--status-bad)" />
              <div>
                <strong style={{ color: 'var(--status-bad)', display: 'block' }}>Complaints Awaiting Review</strong>
                <span>{stats.pendingComplaints} consumer complaint(s) need investigation.</span>
              </div>
            </div>
          )}
          {stats.review > 0 && (
            <div className="alert">
              <CheckCircle2 size={18} color="var(--status-good)" />
              <div>
                <strong style={{ display: 'block' }}>Scans Under Re-inspection</strong>
                <span>{stats.review} scan(s) flagged for follow-up verification.</span>
              </div>
            </div>
          )}
          {stats.pendingComplaints === 0 && stats.review === 0 && <p>No pending actions.</p>}
        </section>
      </div>

      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2>Recent Field Inspections</h2>
          <button className="linkbtn" onClick={() => nav('/app/history')}>View Complete Register <ArrowRight size={14} /></button>
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : recentScans.length === 0 ? (
          <p>No inspections yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Inspection ID</th><th>Product</th><th>Manufacturer</th><th>Status</th><th>Violations</th></tr>
            </thead>
            <tbody>
              {recentScans.map(r => (
                <tr key={r.scanId}>
                  <td className="num">{r.id}</td>
                  <td>📦 {r.productName}</td>
                  <td>{r.manufacturer}</td>
                  <td><span className={'badge ' + cls(r.status as Status)}>{r.status.replace(/_/g, ' ')}</span></td>
                  <td className="num">{r.violationCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function OfficerInspectionResult({ result, onUpdateStatus }: { result: Result; onUpdateStatus: (newStatus: Status) => void }) {
  const [violationsState, setViolationsState] = useState<RuleViolation[]>(result.violations);
  const [savingIdx, setSavingIdx] = useState<number>();
  const nav = useNavigate();

  const handleDecision = async (idx: number, decision: 'VERIFIED' | 'REJECTED') => {
    const violation = violationsState[idx];
    setSavingIdx(idx);
    try {
      if (violation.dbId) {
        await updateViolationDecision(violation.dbId, decision);
      }
      const updated = [...violationsState];
      updated[idx] = { ...updated[idx], officerDecision: decision };
      setViolationsState(updated);
    } catch (e) {
      alert('Failed to save decision: ' + (e as Error).message);
    } finally {
      setSavingIdx(undefined);
    }
  };

  return (
    <div className="result">
      <div className="result-head">
        <div className="product-art">{result.product.image}</div>
        <div>
          <span className="eyebrow">OFFICIAL FIELD AUDIT · <span className="num">{result.id}</span></span>
          <h1>{result.product.name}</h1>
          <p>{result.product.manufacturer} · {result.product.category} · Inspected on <span className="num">{result.date}</span></p>
        </div>
        <Seal score={result.score} statusLabel={result.status} tone={cls(result.status) as 'good' | 'warn' | 'bad'} />
      </div>

      {result.product.location && (
        <div className="panel" style={{ margin: '18px 0', padding: '16px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <MapPin size={18} color="var(--brand-primary)" />
            <div>
              <strong>Point of Sale / Retail Outlet: </strong>
              <span style={{ color: 'var(--text-muted)' }}>{result.product.location}</span>
            </div>
          </div>
        </div>
      )}

      <section className="panel" style={{ margin: '18px 0' }}>
        <h2>Statutory Rule Violations & Evidence</h2>
        {violationsState.length > 0 ? (
          violationsState.map((v, idx) => (
            <article key={idx} className="panel" style={{ margin: '14px 0', padding: '20px', background: 'var(--bg-subtle)', borderLeft: '4px solid var(--status-bad)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span className="badge bad">{v.section}</span>
                  <h3 style={{ marginTop: '8px', fontSize: '16px' }}>{v.requirement}</h3>
                </div>
                {v.officerDecision ? (
                  <span className={'badge ' + (v.officerDecision === 'VERIFIED' ? 'bad' : 'good')}>
                    OFFICER {v.officerDecision}
                  </span>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn outline" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleDecision(idx, 'REJECTED')} disabled={savingIdx === idx}>
                      {savingIdx === idx ? 'Saving...' : 'Reject Finding'}
                    </button>
                    <button className="btn primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleDecision(idx, 'VERIFIED')} disabled={savingIdx === idx}>
                      {savingIdx === idx ? 'Saving...' : 'Verify Finding'}
                    </button>
                  </div>
                )}
              </div>

              <div style={{ margin: '14px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: '#fff', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                  <small style={{ color: 'var(--text-muted)', display: 'block' }}>Extracted Packaging Finding:</small>
                  <strong style={{ color: 'var(--status-bad)' }}>"{v.detectedValue}"</strong>
                </div>
                <div style={{ background: '#fff', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                  <small style={{ color: 'var(--text-muted)', display: 'block' }}>Legal Requirement:</small>
                  <strong style={{ color: 'var(--status-good)' }}>{v.expectedValue}</strong>
                </div>
              </div>

              <p style={{ margin: '6px 0', fontSize: '13px' }}><b>Statutory Violation:</b> {v.explanation}</p>
              <p style={{ margin: '6px 0', fontSize: '13px', color: 'var(--text-muted)' }}><b>Legal Reference:</b> {v.ruleRef.law} — {v.ruleRef.section}</p>
              <p style={{ margin: '6px 0', fontSize: '13px', color: 'var(--brand-primary)' }}><b>Required Corrective Action:</b> {v.recommendation}</p>
            </article>
          ))
        ) : (
          <div className="empty"><CheckCircle2 /> No statutory declaration violations detected on this label.</div>
        )}
      </section>

      <section className="panel" style={{ margin: '18px 0' }}>
        <h2>Principal Display Panel Extracted Fields</h2>
        <div className="fields">
          {Object.entries(result.product.fields).map(([k, val]) => (
            <div key={k}>
              <span>{k}</span>
              <strong className={val === 'Not detected' ? 'missing' : 'num'}>{val}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" style={{ margin: '18px 0', border: '1px solid var(--border-light)' }}>
        <span className="eyebrow">STATUTORY ENFORCEMENT DECISION</span>
        <h2>Issue Statutory Order</h2>
        <p>AI provides assisting evidence. Confirm violation findings or flag for re-inspection:</p>

        {result.review && (
          <div style={{ padding: '12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', margin: '12px 0' }}>
            <p style={{ margin: 0, fontSize: '12px' }}>
              <b>Officer in Charge:</b> {result.review.inspector} | <b>Timestamp:</b> {result.review.confirmedAt}
            </p>
          </div>
        )}

        <div className="result-actions" style={{ justifyContent: 'flex-start', gap: '12px', marginTop: '14px' }}>
          <button
            className="btn primary"
            style={{ background: 'var(--status-bad)' }}
            onClick={() => onUpdateStatus('INSPECTOR_CONFIRMED_NON_COMPLIANT')}
          >
            <ShieldAlert size={16} /> [Confirm Non-Compliant]
          </button>
          <button
            className="btn outline"
            style={{ borderColor: 'var(--status-warn)', color: 'var(--status-warn)' }}
            onClick={() => onUpdateStatus('UNDER_REINSPECTION')}
          >
            [Send for Re-inspection]
          </button>
          <button
            className="btn outline"
            onClick={() => nav('/app/report', { state: result })}
          >
            <FileText size={16} /> Generate Official Inspection Report
          </button>
        </div>
      </section>
    </div>
  );
}

function ComplaintRow({ c, onRefresh }: { c: Complaint; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [evidenceImages, setEvidenceImages] = useState<{ url: string; type: string }[] | undefined>();
  const [loadingReport, setLoadingReport] = useState(false);
  const nav = useNavigate();

  const overcharge = c.amountCharged != null && c.mrp != null ? c.amountCharged - c.mrp : null;
  const isOvercharging = c.issueType.toLowerCase().includes('overcharg');

  const statusBadgeClass = c.status === 'SUBMITTED' ? 'bad' : c.status === 'UNDER_INVESTIGATION' ? 'warn' : 'good';

  const IMAGE_TYPE_LABELS: Record<string, string> = { FRONT: 'Front panel', BACK: 'Back panel', STRIP: 'Tear-strip / seal', LABEL: 'Label' };

  React.useEffect(() => {
    if (!expanded || !c.productId || evidenceImages !== undefined) return;
    getAllEvidenceImages(c.productId).then(setEvidenceImages).catch(() => setEvidenceImages([]));
  }, [expanded, c.productId]);

  const viewFullReport = async () => {
    if (!c.scanId) return;
    setLoadingReport(true);
    try {
      const backendResult = await getScanResult(c.scanId);
      const uiResult = mapToUiResult(backendResult);
      nav('/app/report', { state: uiResult });
    } catch (e) {
      alert('Failed to load scan report: ' + (e as Error).message);
    } finally {
      setLoadingReport(false);
    }
  };

  const doStart = async () => {
    if (!c.dbId) return;
    setBusy(true);
    try { await startComplaintInvestigation(c.dbId); onRefresh(); }
    catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  };

  const doResolve = async (outcome: 'CONFIRMED' | 'REJECTED') => {
    if (!c.dbId) return;
    if (!remarks.trim()) return alert('Please add remarks explaining your decision before closing this complaint.');
    setBusy(true);
    try { await resolveComplaint(c.dbId, outcome, remarks.trim()); onRefresh(); }
    catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <tr onClick={() => setExpanded(x => !x)} style={{ cursor: 'pointer' }}>
        <td className="num">{c.id}</td>
        <td><strong>{c.productName}</strong> ({c.brand})</td>
        <td>{c.issueType}</td>
        <td className="num">{c.date}</td>
        <td><span className={'badge ' + statusBadgeClass}>{c.status.replace(/_/g, ' ')}</span></td>
        <td><button className="linkbtn">{expanded ? 'Hide' : 'View / Act'} <ArrowRight size={13} /></button></td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} style={{ padding: 0 }}>
            <div style={{ padding: '20px', background: 'var(--bg-subtle)', borderTop: '1px solid var(--border-light)' }}>
              {c.scanId ? (
                <div style={{ marginBottom: '16px' }}>
                  <strong style={{ display: 'block', fontSize: '13px', marginBottom: '10px' }}>
                    Evidence: original photo(s) scanned by the consumer
                  </strong>
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {evidenceImages === undefined ? (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading images...</span>
                    ) : evidenceImages.length === 0 ? (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No photos found</span>
                    ) : (
                      evidenceImages.map((img, i) => (
                        <div key={i} style={{ textAlign: 'center' }}>
                          <div style={{ width: '140px', height: '140px', background: '#fff', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                            <img src={img.url} alt={IMAGE_TYPE_LABELS[img.type] ?? img.type} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {IMAGE_TYPE_LABELS[img.type] ?? img.type}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <p style={{ margin: '10px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                    These are the exact packaging photo(s) the consumer's app analysis was based on.
                  </p>
                  <button className="btn outline" onClick={viewFullReport} disabled={loadingReport} style={{ fontSize: '12px', padding: '6px 12px' }}>
                    {loadingReport ? 'Loading...' : 'View Full AI Scan Report'}
                  </button>
                </div>
              ) : (
                <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  No photo attached — this complaint was filed manually, not from a product scan.
                </p>
              )}

              <p style={{ margin: '0 0 12px', fontSize: '13px' }}><b>Description:</b> {c.description}</p>

              {isOvercharging && overcharge != null && (
                <div className="panel" style={{ margin: '0 0 16px', padding: '16px', background: 'var(--status-bad-bg)', border: '1px solid var(--status-bad-border)' }}>
                  <strong style={{ color: 'var(--status-bad)', display: 'block', marginBottom: '6px' }}>
                    Overcharging complaint: ₹{overcharge.toFixed(2)} above declared MRP

                  </strong>
                  <p style={{ margin: '0 0 8px', fontSize: '13px' }}>
                    Charged ₹{c.amountCharged?.toFixed(2)} against a printed MRP of ₹{c.mrp?.toFixed(2)}.
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                    <b>Legal basis if confirmed:</b> Selling above MRP is an offence under Section 18 of the Legal
                    Metrology Act, 2009, penalized under Section 36 (fine up to ₹25,000 for a first offence,
                    escalating for repeat offences, with imprisonment possible thereafter). Beyond statutory
                    enforcement, the consumer is separately entitled to a refund of the excess amount plus
                    compensation via the Consumer Protection Act, 2019 — either through the National Consumer
                    Helpline (1915 / consumerhelpline.gov.in) or the local District Consumer Disputes Redressal
                    Commission, independent of this enforcement action.
                  </p>
                </div>
              )}

              {c.status === 'SUBMITTED' && (
                <button className="btn primary" onClick={doStart} disabled={busy}>
                  {busy ? 'Starting...' : 'Start Investigation'}
                </button>
              )}

              {c.status === 'UNDER_INVESTIGATION' && (
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '13px' }}>
                    Officer remarks (required to close this complaint)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Visited retail outlet, confirmed overcharging via receipt evidence..."
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                    style={{ width: '100%', padding: '10px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', marginBottom: '10px' }}
                  />
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn outline" style={{ borderColor: 'var(--status-good)', color: 'var(--status-good)' }} onClick={() => doResolve('REJECTED')} disabled={busy}>
                      Reject — No Violation Found
                    </button>
                    <button className="btn primary" style={{ background: 'var(--status-bad)' }} onClick={() => doResolve('CONFIRMED')} disabled={busy}>
                      {busy ? 'Saving...' : 'Confirm Violation'}
                    </button>
                  </div>
                </div>
              )}

              {c.status === 'RESOLVED' && (
                <div>
                  <span className={'badge ' + (c.outcome === 'CONFIRMED' ? 'bad' : 'good')}>
                    {c.outcome === 'CONFIRMED' ? 'VIOLATION CONFIRMED' : 'COMPLAINT REJECTED'}
                  </span>
                  {c.officerRemarks && <p style={{ margin: '10px 0 0', fontSize: '13px' }}><b>Officer remarks:</b> {c.officerRemarks}</p>}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function OfficerComplaintsView({ complaints, loading, onRefresh }: { complaints: Complaint[]; loading: boolean; onRefresh: () => void }) {
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">CONSUMER GRIEVANCE QUEUE</span>
          <h1>Consumer Complaints Register</h1>
          <p>Investigate consumer-reported label violations and record enforcement outcomes. Click a row to act on it.</p>
        </div>
      </div>
      <section className="panel">
        {loading ? (
          <p style={{ padding: '20px' }}>Loading complaints...</p>
        ) : complaints.length === 0 ? (
          <p style={{ padding: '20px' }}>No complaints submitted yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Complaint ID</th><th>Product</th><th>Reported Issue</th><th>Date</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {complaints.map(c => <ComplaintRow key={c.id} c={c} onRefresh={onRefresh} />)}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

const LABEL_RULE_ROWS: { key: string; label: string }[] = [
  { key: 'manufacturer', label: 'Manufacturer / packer — Rule 6(1)(a)' },
  { key: 'countryOfOrigin', label: 'Country of origin — Rule 6(1)(aa)' },
  { key: 'genericName', label: 'Generic name — Rule 6(1)(b)' },
  { key: 'netQuantity', label: 'Net quantity — Rule 6(1)(c)' },
  { key: 'manufacturingDate', label: 'Month/year of manufacture — Rule 6(1)(d)' },
  { key: 'mrpDisplay', label: 'Retail sale price — Rule 6(1)(e)' },
  { key: 'consumerCare', label: 'Consumer care — Rule 6(2)' },
];

function LabelGenerator() {
  const [productName, setProductName] = useState('');
  const [genericName, setGenericName] = useState('');
  const [netQuantity, setNetQuantity] = useState('');
  const [mrp, setMrp] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [countryOfOrigin, setCountryOfOrigin] = useState('India');
  const [manufacturingDate, setManufacturingDate] = useState('');
  const [consumerCare, setConsumerCare] = useState('');

  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [textColor, setTextColor] = useState('#0f172a');
  const [bgColor, setBgColor] = useState('#ffffff');

  const svgRef = React.useRef<SVGSVGElement>(null);

  const fieldValues: Record<string, string> = {
    manufacturer,
    countryOfOrigin,
    genericName,
    netQuantity,
    manufacturingDate,
    mrpDisplay: mrp ? `MRP ₹${mrp} (incl. of all taxes)` : '',
    consumerCare,
  };

  const allFilled = [productName, genericName, netQuantity, mrp, manufacturer, countryOfOrigin, manufacturingDate, consumerCare]
    .every(f => f.trim().length > 0);

  const downloadSvg = () => {
    if (!svgRef.current) return;
    const source = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([source], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${productName || 'label'}-compliant-label.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPng = () => {
    if (!svgRef.current) return;
    const source = new XMLSerializer().serializeToString(svgRef.current);
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = 680 * scale;
      canvas.height = 620 * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, 680, 620);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (!blob) return;
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `${productName || 'label'}-compliant-label.png`;
        a.click();
        URL.revokeObjectURL(pngUrl);
      });
    };
    img.src = url;
  };

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">PACKAGING DESIGN ASSISTANT</span>
          <h1>Generate a Compliant Label</h1>
          <p>Fill in your product details below — the layout will include every field required under the Legal Metrology (Packaged Commodities) Rules, 2011. Customize the colors, then download it as a starting point for your real artwork.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <h2>Product Details</h2>
          <label>Brand / Product Name<input value={productName} onChange={e => setProductName(e.target.value)} placeholder="e.g. TrueGrain" /></label>
          <label>Generic Name (Rule 6(1)(b))<input value={genericName} onChange={e => setGenericName(e.target.value)} placeholder="e.g. Premium Basmati Rice" /></label>
          <label>Net Quantity (Rule 6(1)(c))<input value={netQuantity} onChange={e => setNetQuantity(e.target.value)} placeholder="e.g. 5 kg" /></label>
          <label>MRP in ₹ (Rule 6(1)(e))<input value={mrp} onChange={e => setMrp(e.target.value)} placeholder="e.g. 650" /></label>
          <label>Manufacturer Name & Address (Rule 6(1)(a))<input value={manufacturer} onChange={e => setManufacturer(e.target.value)} placeholder="e.g. ABC Foods Pvt Ltd, Pune 411001" /></label>
          <label>Country of Origin (Rule 6(1)(aa))<input value={countryOfOrigin} onChange={e => setCountryOfOrigin(e.target.value)} /></label>
          <label>Manufacturing Month/Year (Rule 6(1)(d))<input value={manufacturingDate} onChange={e => setManufacturingDate(e.target.value)} placeholder="e.g. 09/2026" /></label>
          <label>Consumer Care (Rule 6(2))<input value={consumerCare} onChange={e => setConsumerCare(e.target.value)} placeholder="e.g. 1800-123-4567, care@brand.com" /></label>
        </section>

        <section className="panel">
          <h2>Customize Styling</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            Brand Color
            <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} style={{ width: '50px', height: '32px', padding: 0, border: '1px solid var(--border-light)' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            Text Color
            <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} style={{ width: '50px', height: '32px', padding: 0, border: '1px solid var(--border-light)' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            Background Color
            <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: '50px', height: '32px', padding: 0, border: '1px solid var(--border-light)' }} />
          </label>

          {!allFilled ? (
            <p style={{ color: 'var(--status-warn)', fontSize: '13px', marginTop: '16px' }}>
              Fill in all product details to generate the compliant preview and enable download.
            </p>
          ) : (
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button className="btn primary" onClick={downloadPng}><Camera size={16} /> Download PNG</button>
              <button className="btn outline" onClick={downloadSvg}>Download SVG</button>
            </div>
          )}
        </section>
      </div>

      {allFilled && (
        <section className="panel" style={{ margin: '22px 32px' }}>
          <h2>Live Preview</h2>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)' }}>
            <svg ref={svgRef} viewBox="0 0 680 620" width="440" xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="680" height="620" fill={bgColor} />
              <rect x="40" y="20" width="600" height="580" rx="12" fill="none" stroke={textColor} strokeWidth="1" opacity="0.5" />

              <rect x="70" y="50" width="540" height="150" rx="8" fill={primaryColor} opacity="0.1" stroke={primaryColor} strokeWidth="1" />
              <text x="340" y="90" textAnchor="middle" fill={textColor} fontSize="13" fontWeight="500" opacity="0.7">Principal display panel</text>
              <text x="340" y="130" textAnchor="middle" fill={primaryColor} fontSize="24" fontWeight="700">{productName}</text>
              <text x="340" y="155" textAnchor="middle" fill={textColor} fontSize="15">{genericName}</text>
              <text x="340" y="180" textAnchor="middle" fill={textColor} fontSize="13">Net quantity: {netQuantity}</text>
              <text x="340" y="200" textAnchor="middle" fill={textColor} fontSize="13">MRP: ₹{mrp} (inclusive of all taxes)</text>

              <text x="90" y="245" fill={textColor} fontSize="13" fontWeight="700">Mandatory declarations (Rule 6)</text>

              {LABEL_RULE_ROWS.map((row, i) => (
                <g key={row.key}>
                  <line x1="90" y1={260 + i * 44} x2="610" y2={260 + i * 44} stroke={textColor} strokeWidth="0.5" opacity="0.2" />
                  <text x="90" y={260 + i * 44 + 22} fill={textColor} fontSize="11" opacity="0.65">{row.label}</text>
                  <text x="610" y={260 + i * 44 + 22} textAnchor="end" fill={textColor} fontSize="12" fontWeight="600">{fieldValues[row.key]}</text>
                </g>
              ))}
            </svg>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '14px' }}>
            This preview includes every field currently required by the compliance rule engine. Use it as a starting
            layout — swap in your logo, imagery, and final artwork around these declarations before sending to print,
            then run it through Package Check to confirm the final design still passes.
          </p>
        </section>
      )}
    </>
  );
}

function productStatusBadgeCls(status: string) {
  if (status === 'COMPLIANT') return 'good';
  if (status === 'REVIEW REQUIRED') return 'warn';
  if (status === 'ISSUES FOUND') return 'bad';
  return '';
}

function ProductsArtwork({ setScanResult }: {
  setScanResult: (r: Result | undefined) => void
}) {
  const nav = useNavigate();
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof listProductGroups>>>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string>();
  const [versionsByGroup, setVersionsByGroup] = useState<Record<string, Awaited<ReturnType<typeof listVersionsForGroup>>>>({});

  const load = () => {
    setLoading(true);
    listProductGroups().then(setGroups).catch(e => alert('Failed to load products: ' + (e as Error).message)).finally(() => setLoading(false));
  };
  React.useEffect(() => { load(); }, []);

  const toggleExpand = async (productGroup: string) => {
    if (expanded === productGroup) { setExpanded(undefined); return; }
    setExpanded(productGroup);
    if (!versionsByGroup[productGroup]) {
      const vs = await listVersionsForGroup(productGroup);
      setVersionsByGroup(prev => ({ ...prev, [productGroup]: vs }));
    }
  };

  const openVersionReport = async (scanId: string) => {
    const backendResult = await getScanResult(scanId);
    nav('/app/report', { state: mapToUiResult(backendResult) });
  };

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">ARTWORK MANAGEMENT</span>
          <h1>Products &amp; Artwork</h1>
          <p>Every product line, grouped with all its artwork versions.</p>
        </div>
        <button className="btn primary" onClick={() => { setScanResult(undefined); nav('/app/scan'); }}><Camera size={16} /> Check New Artwork</button>
      </div>

      <section className="panel">
        {loading ? (
          <p style={{ padding: '20px' }}>Loading...</p>
        ) : groups.length === 0 ? (
          <p style={{ padding: '20px' }}>No products yet. Run "Start Packaging Compliance Check" to check your first artwork.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Product</th><th>Category</th><th>Latest Version</th><th>Versions</th><th>Score</th><th>Status</th><th>Issues</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <React.Fragment key={g.productGroup}>
                  <tr>
                    <td><strong>{g.name}</strong></td>
                    <td>{g.category}</td>
                    <td className="num">{g.currentVersionLabel}</td>
                    <td className="num">{g.versionCount}</td>
                    <td className="num">{g.score ?? '—'}</td>
                    <td><span className={'badge ' + productStatusBadgeCls(g.status)}>{g.status}</span></td>
                    <td className="num">{g.issues}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button className="linkbtn" onClick={() => toggleExpand(g.productGroup)}>{expanded === g.productGroup ? 'Hide Versions' : 'View Versions'}</button>
                        <button className="linkbtn" onClick={() => { setScanResult(undefined); nav('/app/scan', { state: { productGroup: g.productGroup, lockedProductName: g.name } }); }}>Upload New Version</button>
                        {g.versionCount > 1 && <button className="linkbtn" onClick={() => nav('/app/version-comparison', { state: { productGroup: g.productGroup } })}>Compare</button>}
                      </div>
                    </td>
                  </tr>
                  {expanded === g.productGroup && (
                    <tr>
                      <td colSpan={8} style={{ padding: 0 }}>
                        <div style={{ padding: '14px 20px', background: 'var(--bg-subtle)' }}>
                          {!versionsByGroup[g.productGroup] ? (
                            <p style={{ fontSize: '13px' }}>Loading versions...</p>
                          ) : (
                            <table>
                              <thead><tr><th>Version</th><th>Date</th><th>Score</th><th>Status</th><th>Action</th></tr></thead>
                              <tbody>
                                {versionsByGroup[g.productGroup].map(v => (
                                  <tr key={v.productId}>
                                    <td className="num">{v.versionLabel}</td>
                                    <td className="num">{v.date ?? '—'}</td>
                                    <td className="num">{v.score ?? '—'}</td>
                                    <td><span className={'badge ' + (v.status === 'COMPLIANT' ? 'good' : v.status === 'NOT CHECKED' ? '' : 'bad')}>{v.status.replace(/_/g, ' ')}</span></td>
                                    <td>{v.scanId && <button className="linkbtn" onClick={() => openVersionReport(v.scanId!)}>View Report</button>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function Recommendations({ setScanResult }: {
  setScanResult: (r: Result | undefined) => void
}) {
  const nav = useNavigate();
  const location = useLocation();
  const filterGroup = (location.state as { productGroup?: string } | null)?.productGroup;
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listRecommendations>>>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string>();

  const load = () => {
    setLoading(true);
    listRecommendations(filterGroup)
      .then(setRows)
      .catch(e => alert('Failed to load recommendations: ' + (e as Error).message))
      .finally(() => setLoading(false));
  };

  React.useEffect(() => { load(); }, []);

  const act = async (violationId: string, action: 'REVIEWED' | 'CORRECTED') => {
    setBusyId(violationId);
    try { await setManufacturerAction(violationId, action); load(); }
    catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusyId(undefined); }
  };

  const severityCls = (s: string) => s === 'HIGH' ? 'bad' : s === 'MEDIUM' ? 'warn' : 'good';

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">CORRECTION RECOMMENDATIONS</span>
          <h1>Turn findings into artwork updates</h1>
          <p>Review rule-engine findings by saved product and artwork version.</p>
        </div>
      </div>

      <section className="panel">
        {loading ? (
          <p style={{ padding: '20px' }}>Loading...</p>
        ) : rows.length === 0 ? (
          <p style={{ padding: '20px' }}>No open recommendations — every checked artwork has passed all rules.</p>
        ) : (
          rows.map(row => (
            <article key={row.violationId} className="panel" style={{ margin: '14px 0', padding: '18px', background: 'var(--bg-subtle)', borderLeft: `4px solid var(--status-${row.severity === 'HIGH' ? 'bad' : 'warn'})` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span className="eyebrow">{row.productName} · {row.versionLabel}</span>
                  <h3 style={{ margin: '6px 0' }}>{row.issue}</h3>
                </div>
                <span className={'badge ' + severityCls(row.severity)}>{row.severity}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '10px 0' }}>
                <div style={{ background: '#fff', padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                  <small style={{ color: 'var(--text-muted)' }}>Current value</small><br /><strong>{row.currentValue}</strong>
                </div>
                <div style={{ background: '#fff', padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                  <small style={{ color: 'var(--text-muted)' }}>Required value</small><br /><strong>{row.requiredValue}</strong>
                </div>
              </div>
              <p style={{ fontSize: '13px', margin: '6px 0' }}><b>Recommendation:</b> {row.recommendation}</p>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px' }}>
                {row.manufacturerAction && <span className={'badge ' + (row.manufacturerAction === 'CORRECTED' ? 'good' : 'warn')}>{row.manufacturerAction}</span>}
                <button className="btn outline" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => act(row.violationId, 'REVIEWED')} disabled={busyId === row.violationId}>Mark as Reviewed</button>
                <button className="btn outline" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => act(row.violationId, 'CORRECTED')} disabled={busyId === row.violationId}>Mark as Corrected</button>
                <button className="btn primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => {
                  setScanResult(undefined);
                  nav('/app/scan', { state: { productGroup: row.productGroup, lockedProductName: row.productName } });
                }}>
                  <RefreshCw size={13} /> Re-check Artwork
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </>
  );
}

function VersionComparison() {
  const nav = useNavigate();
  const location = useLocation();
  const preselect = (location.state as { productGroup?: string } | null)?.productGroup;
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof listProductGroups>>>([]);
  const [productGroup, setProductGroup] = useState(preselect ?? '');
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof listVersionsForGroup>>>([]);
  const [verAId, setVerAId] = useState('');
  const [verBId, setVerBId] = useState('');
  const [compareData, setCompareData] = useState<Awaited<ReturnType<typeof compareVersionsDetailed>>>();
  const [comparisonImages, setComparisonImages] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);

  React.useEffect(() => { listProductGroups().then(setGroups); }, []);

  React.useEffect(() => {
    if (!productGroup) { setVersions([]); return; }
    listVersionsForGroup(productGroup).then(vs => {
      setVersions(vs);
      setVerAId(vs[0]?.productId ?? '');
      setVerBId(vs[1]?.productId ?? vs[0]?.productId ?? '');
    });
  }, [productGroup]);

  React.useEffect(() => {
    if (!verAId || !verBId) return;
    setLoading(true);
    setCompareData(undefined);

    compareVersionsDetailed(verAId, verBId)
      .then(async data => {
        // The API normally returns the image URL. If a signed URL could not be
        // produced on the first comparison request, make one direct fallback
        // request for each selected version so the artwork still appears.
        const [fallbackA, fallbackB] = await Promise.all([
          data.a?.imageUrl ? Promise.resolve(data.a.imageUrl) : getEvidenceImageUrl(verAId),
          data.b?.imageUrl ? Promise.resolve(data.b.imageUrl) : getEvidenceImageUrl(verBId),
        ]);

        setComparisonImages({
          [verAId]: fallbackA ?? null,
          [verBId]: fallbackB ?? null,
        });
        setCompareData(data);
      })
      .catch(e => alert('Failed to load version comparison: ' + (e as Error).message))
      .finally(() => setLoading(false));
  }, [verAId, verBId]);

  const a = compareData?.a;
  const b = compareData?.b;
  const groupName = groups.find(g => g.productGroup === productGroup)?.name ?? '';
  const aLabel = a?.scan.products?.version_label ?? 'V1';
  const bLabel = b?.scan.products?.version_label ?? 'V2';

  const viewReport = (scanId: string) => {
    nav('/app/report', { state: null });
    getScanResult(scanId).then(r => nav('/app/report', { state: mapToUiResult(r) }));
  };

  let resolvedList: any[] = [], remainingList: any[] = [], newList: any[] = [];
  let declRows: { field: string; label: string; aText: string; bText: string; changeLabel: string; changeCls: string }[] = [];

  if (a && b) {
    const aViolMap = new Map(a.violations.map((v: any) => [v.field, v]));
    const bViolMap = new Map(b.violations.map((v: any) => [v.field, v]));
    const allViolFields = new Set([...aViolMap.keys(), ...bViolMap.keys()]);
    for (const field of allViolFields) {
      const av = aViolMap.get(field), bv = bViolMap.get(field);
      if (av && !bv) resolvedList.push(av);
      else if (av && bv) remainingList.push(bv);
      else if (!av && bv) newList.push(bv);
    }

    const NOT_DETECTED = 'Not detected in supplied package image';
    const aDeclMap = new Map(a.declarations.map((d: any) => [d.field, d]));
    const bDeclMap = new Map(b.declarations.map((d: any) => [d.field, d]));
    const allFields = Array.from(new Set([...aDeclMap.keys(), ...bDeclMap.keys()]));
    declRows = allFields.map(field => {
      const av: any = aDeclMap.get(field);
      const bv: any = bDeclMap.get(field);
      const aText = av?.present && av.value ? av.value : NOT_DETECTED;
      const bText = bv?.present && bv.value ? bv.value : NOT_DETECTED;
      let changeLabel = 'Unchanged', changeCls = '';
      if (aText === bText) { changeLabel = 'Unchanged'; changeCls = ''; }
      else if (aText === NOT_DETECTED) { changeLabel = 'Added'; changeCls = 'good'; }
      else if (bText === NOT_DETECTED) { changeLabel = 'Removed'; changeCls = 'bad'; }
      else { changeLabel = 'Changed'; changeCls = 'warn'; }
      return { field, label: FIELD_LABELS[field] ?? field, aText, bText, changeLabel, changeCls };
    });
  }

  const scoreDelta = a && b ? (b.scan.score ?? 0) - (a.scan.score ?? 0) : 0;

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">VERSION COMPARISON</span>
          <h1>{groupName || 'Measure revision progress'}</h1>
          <p>Compare two saved artwork versions of the same product.</p>
        </div>
      </div>

      <section className="panel">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
          <label style={{ margin: 0 }}>Product
            <select value={productGroup} onChange={e => setProductGroup(e.target.value)}>
              <option value="">— Select —</option>
              {groups.map(g => <option key={g.productGroup} value={g.productGroup}>{g.name}</option>)}
            </select>
          </label>
          <label style={{ margin: 0 }}>Earlier version
            <select value={verAId} onChange={e => setVerAId(e.target.value)}>
              {versions.map(v => <option key={v.productId} value={v.productId}>{v.versionLabel}</option>)}
            </select>
          </label>
          <label style={{ margin: 0 }}>Later version
            <select value={verBId} onChange={e => setVerBId(e.target.value)}>
              {versions.map(v => <option key={v.productId} value={v.productId}>{v.versionLabel}</option>)}
            </select>
          </label>
        </div>
      </section>

      {loading ? (
        <section className="panel"><p style={{ padding: '20px' }}>Loading comparison...</p></section>
      ) : a && b ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '16px', alignItems: 'center', margin: '18px 0' }}>
            <div className="panel" style={{ padding: '18px' }}>
              <span className="eyebrow">{aLabel}</span>
              <p style={{ margin: '8px 0 4px', fontSize: '18px', fontWeight: 700 }}>Score: {a.scan.score ?? 0}/100</p>
              <p style={{ margin: '4px 0' }}><span className={'badge ' + cls(a.scan.status as Status)}>{(a.scan.status as string)?.replace(/_/g, ' ')}</span></p>
              <p style={{ margin: '4px 0', fontSize: '13px' }}>Findings: {a.violations.length}</p>
              <p style={{ margin: '4px 0', fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(a.scan.completed_at ?? a.scan.started_at).toLocaleDateString('en-IN')}</p>
            </div>
            <ArrowLeftRight size={22} color="var(--text-muted)" />
            <div className="panel" style={{ padding: '18px' }}>
              <span className="eyebrow">{bLabel}</span>
              <p style={{ margin: '8px 0 4px', fontSize: '18px', fontWeight: 700 }}>Score: {b.scan.score ?? 0}/100</p>
              <p style={{ margin: '4px 0' }}><span className={'badge ' + cls(b.scan.status as Status)}>{(b.scan.status as string)?.replace(/_/g, ' ')}</span></p>
              <p style={{ margin: '4px 0', fontSize: '13px' }}>Findings: {b.violations.length}</p>
              <p style={{ margin: '4px 0', fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(b.scan.completed_at ?? b.scan.started_at).toLocaleDateString('en-IN')}</p>
            </div>
          </div>

          <section className="panel">
            <h2>Score Change</h2>
            <p style={{ margin: '4px 0' }}>{aLabel}: <b>{a.scan.score ?? 0}/100</b></p>
            <p style={{ margin: '4px 0' }}>{bLabel}: <b>{b.scan.score ?? 0}/100</b></p>
            <p style={{ margin: '4px 0' }}>Change: <b style={{ color: scoreDelta < 0 ? 'var(--status-bad)' : 'var(--status-good)' }}>{scoreDelta >= 0 ? '+' : ''}{scoreDelta} points</b></p>
            <p style={{ margin: '4px 0', fontSize: '13px', color: 'var(--text-muted)' }}>Status: {(a.scan.status as string)?.replace(/_/g, ' ')} → {(b.scan.status as string)?.replace(/_/g, ' ')}</p>
          </section>

          <section className="panel">
            <h2>Artwork Comparison</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <span className="eyebrow">{aLabel} — ORIGINAL ARTWORK</span>
                <div style={{ marginTop: '10px', minHeight: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-subtle)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', padding: '10px' }}>
                  {(comparisonImages[a.scan.product_id] ?? a.imageUrl) ? (
                    <img
                      src={comparisonImages[a.scan.product_id] ?? a.imageUrl ?? ''}
                      alt={`${aLabel} original artwork`}
                      onError={async e => {
                        const img = e.currentTarget;
                        if (img.dataset.retried === '1') return;
                        img.dataset.retried = '1';
                        const freshUrl = await getEvidenceImageUrl(a.scan.product_id);
                        if (freshUrl) img.src = freshUrl;
                      }}
                      style={{ width: '100%', maxWidth: '360px', maxHeight: '420px', objectFit: 'contain', display: 'block', borderRadius: 'var(--radius-sm)' }}
                    />
                  ) : (
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No image available for {aLabel}</p>
                  )}
                </div>
              </div>
              <div>
                <span className="eyebrow">{bLabel} — REVISED ARTWORK</span>
                <div style={{ marginTop: '10px', minHeight: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-subtle)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', padding: '10px' }}>
                  {(comparisonImages[b.scan.product_id] ?? b.imageUrl) ? (
                    <img
                      src={comparisonImages[b.scan.product_id] ?? b.imageUrl ?? ''}
                      alt={`${bLabel} revised artwork`}
                      onError={async e => {
                        const img = e.currentTarget;
                        if (img.dataset.retried === '1') return;
                        img.dataset.retried = '1';
                        const freshUrl = await getEvidenceImageUrl(b.scan.product_id);
                        if (freshUrl) img.src = freshUrl;
                      }}
                      style={{ width: '100%', maxWidth: '360px', maxHeight: '420px', objectFit: 'contain', display: 'block', borderRadius: 'var(--radius-sm)' }}
                    />
                  ) : (
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No image available for {bLabel}</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>Version Timeline</h2>
            {versions.map(v => (
              <p key={v.productId} style={{ margin: '6px 0', fontSize: '13px' }}>
                <b>{v.versionLabel}</b> — {v.date ?? 'Not checked'} · Score: {v.score ?? '—'}
              </p>
            ))}
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <section className="panel">
              <h2>Issues Resolved ({resolvedList.length})</h2>
              {resolvedList.length === 0 ? <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>None.</p> : resolvedList.map((v: any, i: number) => (
                <div key={i} style={{ padding: '10px', background: 'var(--status-good-bg)', borderRadius: 'var(--radius-sm)', marginBottom: '8px' }}>
                  <span className="badge good" style={{ marginBottom: '4px', display: 'inline-block' }}>Resolved in {bLabel}</span>
                  <p style={{ margin: '4px 0', fontSize: '13px', fontWeight: 600 }}>{v.rules?.rule_name ?? v.field}</p>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Rule: {v.rules?.rule_code ?? '—'}</p>
                </div>
              ))}
            </section>
            <section className="panel">
              <h2>Issues Still Remaining ({remainingList.length})</h2>
              {remainingList.length === 0 ? <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No findings remain under the same rule identity.</p> : remainingList.map((v: any, i: number) => (
                <div key={i} style={{ padding: '10px', background: 'var(--status-warn-bg)', borderRadius: 'var(--radius-sm)', marginBottom: '8px' }}>
                  <p style={{ margin: '4px 0', fontSize: '13px', fontWeight: 600 }}>{v.rules?.rule_name ?? v.field}</p>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Rule: {v.rules?.rule_code ?? '—'}</p>
                </div>
              ))}
            </section>
            <section className="panel">
              <h2>New Issues Detected ({newList.length})</h2>
              {newList.length === 0 ? <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>None.</p> : newList.map((v: any, i: number) => (
                <div key={i} style={{ padding: '10px', background: 'var(--status-bad-bg)', borderRadius: 'var(--radius-sm)', marginBottom: '8px' }}>
                  <span className="badge bad" style={{ marginBottom: '4px', display: 'inline-block' }}>New Issue in {bLabel}</span>
                  <p style={{ margin: '4px 0', fontSize: '13px', fontWeight: 600 }}>{v.rules?.rule_name ?? v.field}</p>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Rule: {v.rules?.rule_code ?? '—'}</p>
                  <p style={{ margin: '4px 0 0', fontSize: '12px' }}>{bLabel} evidence: {v.detected_value ?? '—'}</p>
                </div>
              ))}
            </section>
          </div>

          <section className="panel">
            <h2>Declaration Comparison</h2>
            <table>
              <thead><tr><th>Declaration</th><th>{aLabel}</th><th>{bLabel}</th><th>Change</th><th>Status</th></tr></thead>
              <tbody>
                {declRows.map(row => (
                  <tr key={row.field}>
                    <td>{row.label}</td>
                    <td>{row.aText}</td>
                    <td>{row.bText}</td>
                    <td>{row.changeLabel === 'Unchanged' ? '—' : row.changeLabel}</td>
                    <td><span className={'badge ' + row.changeCls}>{row.changeLabel.toUpperCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn outline" onClick={() => viewReport(a.scan.id)}>Open {aLabel}</button>
            <button className="btn primary" onClick={() => viewReport(b.scan.id)}>Open {bLabel}</button>
          </div>
        </>
      ) : (
        <section className="panel"><p style={{ padding: '20px' }}>Select a product with at least two checked versions to compare.</p></section>
      )}
    </>
  );
}


function ManufacturerResultView({ result, previousVersion, nav, setScanResult }: {
  result: Result;
  previousVersion?: { label: string; score: number; issues: number };
  nav: ReturnType<typeof useNavigate>;
  setScanResult: (r: Result | undefined) => void;
}) {
  const productGroup = result.product.productGroup;
  const versionLabel = result.product.versionLabel ?? 'v1';

  return (
    <div className="result">
      <div className="result-head">
        <div className="product-art">{result.product.image}</div>
        <div>
          <span className="eyebrow">COMPLIANCE RESULT · {versionLabel}</span>
          <h1>{result.product.name}</h1>
          <p>{result.product.category}</p>
        </div>
        <Seal score={result.score} statusLabel={result.status} tone={cls(result.status) as 'good' | 'warn' | 'bad'} />
      </div>

      {previousVersion && (
        <div className="panel" style={{ margin: '18px 0', padding: '16px', background: 'var(--brand-soft)', border: '1px solid rgba(37,99,235,0.2)' }}>
          <span className="eyebrow">REVISED ARTWORK SUBMISSION</span>
          <p style={{ margin: '6px 0 0' }}>
            Previous version: <b>{previousVersion.label}</b> · Previous score: <b>{previousVersion.score}/100</b> · Previous issues: <b>{previousVersion.issues}</b>
            {' → '}Now <b>{versionLabel}</b>: {result.score}/100, {result.violations.length} issue(s)
          </p>
        </div>
      )}

      <section className="panel" style={{ margin: '18px 0' }}>
        <h2>Extracted Declarations</h2>
        <div className="fields">
          {Object.entries(result.product.fields).map(([k, val]) => (
            <div key={k}>
              <span>{k}</span>
              <strong className={val === 'Not detected' ? 'missing' : 'num'}>{val}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" style={{ margin: '18px 0' }}>
        <h2>Findings, Evidence &amp; Recommended Corrections</h2>
        {result.violations.length === 0 ? (
          <div className="empty"><CheckCircle2 /> No statutory declaration violations detected on this artwork.</div>
        ) : (
          result.violations.map((v, i) => (
            <article key={i} className="panel" style={{ margin: '14px 0', padding: '20px', background: 'var(--bg-subtle)', borderLeft: '4px solid var(--status-bad)' }}>
              <span className="badge bad">{v.section}</span>
              <h3 style={{ margin: '8px 0' }}>{v.requirement}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', margin: '10px 0' }}>
                <div style={{ background: '#fff', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                  <small style={{ color: 'var(--text-muted)' }}>Detected</small><br /><strong style={{ color: 'var(--status-bad)' }}>{v.detectedValue}</strong>
                </div>
                <div style={{ background: '#fff', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                  <small style={{ color: 'var(--text-muted)' }}>Expected</small><br /><strong style={{ color: 'var(--status-good)' }}>{v.expectedValue}</strong>
                </div>
              </div>
              <p style={{ margin: '6px 0', fontSize: '13px' }}><b>Why this fails:</b> {v.explanation}</p>
              <p style={{ margin: '6px 0', fontSize: '13px', color: 'var(--text-muted)' }}><b>Rule:</b> {v.ruleRef.law} — {v.ruleRef.section}</p>
              <p style={{ margin: '6px 0', fontSize: '13px', color: 'var(--brand-primary)' }}><b>Recommended correction:</b> {v.recommendation}</p>
            </article>
          ))
        )}
      </section>

      <div className="result-actions" style={{ justifyContent: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
        <button className="btn outline" onClick={() => nav('/app/recommendations', { state: { productGroup } })}>
          <AlertTriangle size={16} /> View Correction Recommendations
        </button>
        {productGroup && (
          <button className="btn outline" onClick={() => nav('/app/version-comparison', { state: { productGroup } })}>
            <ArrowLeftRight size={16} /> Compare Versions
          </button>
        )}
        {productGroup && (
          <button
            className="btn primary"
            onClick={() => {
              setScanResult(undefined);
              nav('/app/scan', {
                state: {
                  productGroup,
                  lockedProductName: result.product.name,
                  previousVersion: { label: versionLabel, score: result.score, issues: result.violations.length }
                }
              });
            }}
          >
            <Upload size={16} /> Submit Revised Artwork
          </button>
        )}
      </div>
    </div>
  );
}

function ManufacturerDashboard({ onNewScan }: { onNewScan: () => void }) {
  const nav = useNavigate();
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof listProductGroups>>>([]);
  const [checks, setChecks] = useState<Awaited<ReturnType<typeof listManufacturerChecks>>>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    Promise.all([listProductGroups(), listManufacturerChecks()])
      .then(([g, c]) => { setGroups(g); setChecks(c); })
      .catch(e => alert('Failed to load dashboard: ' + (e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const reviewRequired = groups.filter(g => g.status === 'REVIEW REQUIRED').length;
  const potentialIssues = groups.reduce((sum, g) => sum + g.issues, 0);
  const latest = checks[0];

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">PREVENTIVE COMPLIANCE</span>
          <h1>Manufacturer Compliance Centre</h1>
          <p>Upload packaging artwork, identify potential issues, and save a review before release.</p>
        </div>
        <button className="btn primary" onClick={onNewScan}><Camera size={16} /> Start Packaging Compliance Check</button>
      </div>

      <div className="stats">
        <article><b className="num">{groups.length}</b><span>Products / Artworks</span></article>
        <article><b className="num">{checks.length}</b><span>Compliance Checks</span></article>
        <article><b className="num" style={{ color: 'var(--status-warn)' }}>{reviewRequired}</b><span>Review Required</span></article>
        <article><b className="num" style={{ color: 'var(--status-bad)' }}>{potentialIssues}</b><span>Potential Issues</span></article>
        <article><b className="num" style={{ color: 'var(--status-warn)' }}>{latest ? `${latest.score}/100` : '—'}</b><span>Latest Compliance Score</span></article>
      </div>

      <section className="panel">
        <h2>Recent Compliance Checks</h2>
        {loading ? (
          <p style={{ padding: '20px' }}>Loading...</p>
        ) : checks.length === 0 ? (
          <p style={{ padding: '20px' }}>No compliance checks yet.</p>
        ) : (
          <table>
            <thead><tr><th>Product</th><th>Version</th><th>Date</th><th>Score</th><th>Status</th><th>Findings</th></tr></thead>
            <tbody>
              {checks.slice(0, 8).map(c => (
                <tr key={c.scanId}>
                  <td><strong>{c.productName}</strong></td>
                  <td className="num">{c.versionLabel}</td>
                  <td className="num">{c.date}</td>
                  <td className="num">{c.score}/100</td>
                  <td><span className={'badge ' + cls(c.status as Status)}>{c.status.replace(/_/g, ' ')}</span></td>
                  <td className="num">{c.issues}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
function SellerBulkScan() {
  const [pending, setPending] = useState<{ file: File; previewUrl: string; productName: string }[]>([]);
  const [category, setCategory] = useState('Packaged food');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<Awaited<ReturnType<typeof startBulkScan>>>([]);
  const nav = useNavigate();

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const newItems = Array.from(fileList).map(file => ({
      file,
      previewUrl: URL.createObjectURL(file),
      productName: file.name.replace(/\.[^.]+$/, '')
    }));
    setPending(prev => [...prev, ...newItems]);
  };

  const updateName = (idx: number, name: string) => {
    setPending(prev => prev.map((p, i) => i === idx ? { ...p, productName: name } : p));
  };

  const removeItem = (idx: number) => {
    setPending(prev => prev.filter((_, i) => i !== idx));
  };

  const runBulkCheck = async () => {
    if (pending.length === 0) return alert('Add at least one image first.');
    setRunning(true);
    setResults([]);
    setProgress({ done: 0, total: pending.length });
    const items = pending.map(p => ({ imageFile: p.file, productName: p.productName || 'Untitled product' }));
    const res = await startBulkScan(items, category, (done, total) => setProgress({ done, total }));
    setResults(res);
    setRunning(false);
    setPending([]);
  };

  const viewReport = async (scanId?: string) => {
    if (!scanId) return;
    try {
      const backendResult = await getScanResult(scanId);
      const uiResult = mapToUiResult(backendResult);
      nav('/app/report', { state: uiResult });
    } catch (e) {
      alert('Failed to load report: ' + (e as Error).message);
    }
  };

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">BATCH CATALOGUE CHECKER</span>
          <h1>Bulk Listing Compliance Check</h1>
          <p>Upload several product label photos at once — each one runs through the same real AI compliance pipeline as a single scan.</p>
        </div>
      </div>

      <section className="panel">
        <label style={{ display: 'block', marginBottom: '14px' }}>
          Category (applies to this whole batch)
          <select value={category} onChange={e => setCategory(e.target.value)} disabled={running}>
            <option>Packaged food</option>
            <option>Edible oil</option>
            <option>Spices</option>
            <option>Packaged goods</option>
          </select>
        </label>

        <label className="dropzone" style={{ height: '120px' }}>
          <input type="file" accept="image/*" multiple onChange={e => handleFiles(e.target.files)} disabled={running} />
          <Upload size={26} />
          <b>Add product label photos (select multiple at once)</b>
          <span>Each photo becomes one item in the batch</span>
        </label>

        {pending.length > 0 && (
          <div style={{ marginTop: '18px' }}>
            <h3 style={{ fontSize: '14px', marginBottom: '10px' }}>{pending.length} item(s) queued</h3>
            {pending.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', borderBottom: '1px solid var(--border-light)' }}>
                <img src={p.previewUrl} alt="" style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                <input
                  type="text"
                  value={p.productName}
                  onChange={e => updateName(i, e.target.value)}
                  disabled={running}
                  style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)' }}
                />
                <button className="btn outline" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => removeItem(i)} disabled={running}>Remove</button>
              </div>
            ))}
            <button className="btn primary" style={{ marginTop: '16px' }} onClick={runBulkCheck} disabled={running}>
              <ClipboardCheck size={16} /> {running ? `Scanning ${progress.done}/${progress.total}...` : `Run Bulk Check (${pending.length})`}
            </button>
          </div>
        )}
      </section>

      {results.length > 0 && (
        <section className="panel">
          <h2>Batch Results</h2>
          <table>
            <thead>
              <tr><th>Product</th><th>Score</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td>{r.productName}</td>
                  <td className="num">{r.success ? `${r.score}/100` : '—'}</td>
                  <td>
                    {r.success
                      ? <span className={'badge ' + cls(r.status as Status)}>{r.status?.replace(/_/g, ' ')}</span>
                      : <span className="badge bad">FAILED: {r.error}</span>}
                  </td>
                  <td>
                    {r.success && <button className="linkbtn" onClick={() => viewReport(r.scanId)}>View Report</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function SellerDashboard({ onNewScan }: { onNewScan: () => void }) {
  const [stats, setStats] = useState({ totalScans: 0, compliant: 0, nonCompliant: 0, review: 0, pendingComplaints: 0, confirmedViolations: 0 });
  const [recentScans, setRecentScans] = useState<Awaited<ReturnType<typeof listRealScans>>>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    Promise.all([getDashboardStats(), listRealScans()])
      .then(([s, scans]) => { setStats(s); setRecentScans(scans); })
      .catch(e => alert('Failed to load dashboard: ' + (e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">E-COMMERCE SELLER DESK</span>
          <h1>Marketplace Listing Compliance</h1>
          <p>Scan catalogue images to ensure all PDP declarations are visible before listing.</p>
        </div>
        <button className="btn primary" onClick={onNewScan}><Camera size={16} /> Scan Listing Label</button>
      </div>

      <div className="stats">
        <article><b className="num">{stats.totalScans}</b><span>Listings Scanned</span></article>
        <article><b className="num" style={{ color: 'var(--status-good)' }}>{stats.compliant}</b><span>Passed Listings</span></article>
        <article><b className="num" style={{ color: 'var(--status-warn)' }}>{stats.review}</b><span>Needs Review</span></article>
        <article><b className="num" style={{ color: 'var(--status-bad)' }}>{stats.nonCompliant}</b><span>Potential High Risk</span></article>
      </div>

      <section className="panel">
        <h2>Catalogue Listing Checks</h2>
        {loading ? (
          <p>Loading...</p>
        ) : recentScans.length === 0 ? (
          <p>No listings scanned yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Catalogue Item</th><th>Score</th><th>Status</th></tr>
            </thead>
            <tbody>
              {recentScans.map(r => (
                <tr key={r.scanId}>
                  <td>📦 <strong>{r.productName}</strong></td>
                  <td className="num">{r.score}/100</td>
                  <td><span className={'badge ' + cls(r.status as Status)}>{r.status.replace(/_/g, ' ')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function ConsumerDashboard({ onNewScan }: { onNewScan: () => void }) {
  const nav = useNavigate();
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">CITIZEN PORTAL</span>
          <h1>Check a Product Label</h1>
          <p>Scan any packaged product to understand if price, quantity, and manufacturer details are clearly printed.</p>
        </div>
        <button className="btn primary lg" onClick={onNewScan}><Camera size={18} /> Scan Product Now</button>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <h2>How Consumer Check Works</h2>
          <ol style={{ paddingLeft: '20px', lineHeight: '1.8', color: 'var(--text-muted)' }}>
            <li>Take a photo of the product front or back label.</li>
            <li>We automatically read mandatory price and quantity numbers.</li>
            <li>If any detail is missing or non-compliant, you will receive an alert explaining why.</li>
          </ol>
        </section>

        <section className="panel" style={{ background: 'var(--brand-soft)', borderColor: 'rgba(37, 99, 235, 0.2)' }}>
          <h2 style={{ color: 'var(--brand-primary)' }}>Notice a Violation?</h2>
          <p>If you suspect MRP overcharging or missing weights, submit a formal grievance for Legal Metrology Officer review.</p>
          <button className="btn primary" onClick={() => nav('/app/complaint')}>
            <MessageSquare size={16} /> Report a Suspected Issue
          </button>
        </section>
      </div>

      <section className="panel">
        <h2>Your Grievance Redressal Journey</h2>
        <div className="steps" style={{ marginTop: '16px' }}>
          <article><b className="num">1</b><h3>Scan Product</h3><p>Verify label declarations instantly.</p></article>
          <article><b className="num">2</b><h3>Submit Issue</h3><p>Upload details to the state portal.</p></article>
          <article><b className="num">3</b><h3>Officer Review</h3><p>Legal Metrology Officer audits the complaint.</p></article>
          <article><b className="num">4</b><h3>Action Taken</h3><p>Store inspection & statutory resolution.</p></article>
        </div>
      </section>

      <div style={{ padding: '0 32px 32px' }}>
        <NchCard />
      </div>
    </>
  );
}

const ISSUE_TYPE_OPTIONS = [
  'Missing Manufacturer / Packer Address',
  'Missing Generic/Common Name of Commodity',
  'Missing Net Quantity Declaration',
  'Contradictory / Incorrect Net Quantity',
  'Missing Manufacturing Date',
  'Missing Maximum Retail Price (MRP)',
  'Missing Country of Origin',
  'Missing Consumer Care Details',
  'Overcharging Above Printed MRP',
];

// Maps a rule's code (from a real scan violation) to the matching standard
// checkbox label above, so pre-filled complaints select the exact same
// option instead of a slightly-differently-worded duplicate.
const RULE_CODE_TO_ISSUE_LABEL: Record<string, string> = {
  'LM-6-1-A': 'Missing Manufacturer / Packer Address',
  'LM-6-1-B': 'Missing Generic/Common Name of Commodity',
  'LM-6-1-C': 'Missing Net Quantity Declaration',
  'LM-6-1-C-CONSISTENCY': 'Contradictory / Incorrect Net Quantity',
  'LM-6-1-D': 'Missing Manufacturing Date',
  'LM-6-1-E': 'Missing Maximum Retail Price (MRP)',
  'LM-6-1-AA': 'Missing Country of Origin',
  'LM-6-2': 'Missing Consumer Care Details',
};

function consumerStatusLabel(c: Complaint): { label: string; cls: string } {
  if (c.status === 'RESOLVED') {
    return c.outcome === 'CONFIRMED'
      ? { label: 'Accepted', cls: 'good' }
      : { label: 'Rejected', cls: 'bad' };
  }
  if (c.status === 'UNDER_INVESTIGATION') return { label: 'Under Review', cls: 'warn' };
  return { label: 'Pending', cls: 'warn' };
}

function ConsumerGrievanceRow({ c }: { c: Complaint }) {
  const [expanded, setExpanded] = useState(false);
  const { label, cls } = consumerStatusLabel(c);
  const hasNote = c.status === 'RESOLVED' && !!c.officerRemarks;

  return (
    <>
      <tr onClick={() => setExpanded(x => !x)} style={{ cursor: 'pointer' }}>
        <td className="num">{c.id}</td>
        <td><strong>{c.productName}</strong> ({c.brand})</td>
        <td>{c.issueType}</td>
        <td className="num">{c.date}</td>
        <td><span className={'badge ' + cls}>{label}</span></td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} style={{ padding: 0 }}>
            <div style={{ padding: '18px 20px', background: 'var(--bg-subtle)', borderTop: '1px solid var(--border-light)' }}>
              <p style={{ margin: '0 0 10px', fontSize: '13px' }}><b>Your description:</b> {c.description}</p>
              {c.status === 'SUBMITTED' && (
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                  Waiting for a Legal Metrology Officer to begin reviewing this grievance.
                </p>
              )}
              {c.status === 'UNDER_INVESTIGATION' && (
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--status-warn)' }}>
                  An officer is currently investigating this complaint (e.g. visiting the retail outlet to verify).
                </p>
              )}
              {hasNote && (
                <div style={{ padding: '12px', background: '#fff', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)' }}>
                  <strong style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    Officer's note:
                  </strong>
                  <p style={{ margin: 0, fontSize: '13px' }}>{c.officerRemarks}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ConsumerGrievancesPage({ onGlobalComplaintAdd }: { onGlobalComplaintAdd: (c: Complaint) => void }) {
  const prefill = useLocation().state as {
    productName?: string;
    brand?: string;
    category?: string;
    issueType?: string;
    description?: string;
    scanId?: string;
  } | null;

  const [view, setView] = useState<'list' | 'form'>(prefill ? 'form' : 'list');
  const [myComplaints, setMyComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);

  const loadComplaints = () => {
    setLoading(true);
    listComplaintsReal()
      .then(setMyComplaints)
      .catch(e => alert('Failed to load grievances: ' + (e as Error).message))
      .finally(() => setLoading(false));
  };

  React.useEffect(() => { loadComplaints(); }, []);

  if (view === 'form') {
    return (
      <ConsumerComplaintForm
        prefill={prefill}
        onCancel={() => setView('list')}
        onSubmit={c => { onGlobalComplaintAdd(c); loadComplaints(); setView('list'); }}
      />
    );
  }

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">CITIZEN GRIEVANCE REGISTRATION</span>
          <h1>My Grievances</h1>
          <p>Track the status of complaints you have submitted. Click a row to see the officer's note.</p>
        </div>
        <button className="btn primary" onClick={() => setView('form')}>
          <MessageSquare size={16} /> Report New Issue
        </button>
      </div>
      <section className="panel">
        {loading ? (
          <p style={{ padding: '20px' }}>Loading your grievances...</p>
        ) : myComplaints.length === 0 ? (
          <p style={{ padding: '20px' }}>You haven't submitted any grievances yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Complaint ID</th><th>Product</th><th>Issue</th><th>Date</th><th>Status</th></tr>
            </thead>
            <tbody>
              {myComplaints.map(c => <ConsumerGrievanceRow key={c.id} c={c} />)}
            </tbody>
          </table>
        )}
      </section>
      <div style={{ padding: '0 32px 32px' }}>
        <NchCard />
      </div>
    </>
  );
}

function ConsumerComplaintForm({ prefill, onSubmit, onCancel }: {
  prefill: { productName?: string; brand?: string; category?: string; issueType?: string; description?: string; scanId?: string } | null;
  onSubmit: (c: Complaint) => void;
  onCancel: () => void;
}) {
  const [productName, setProductName] = useState(prefill?.productName ?? '');
  const [brand, setBrand] = useState(prefill?.brand ?? '');
  const [category, setCategory] = useState(prefill?.category ?? 'Food & Grocery');
  const [selectedIssues, setSelectedIssues] = useState<string[]>(prefill?.issueType ? prefill.issueType.split(', ').filter(Boolean) : []);
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [amountCharged, setAmountCharged] = useState('');
  const [mrp, setMrp] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refId, setRefId] = useState('');

  // Include the prefilled issue text as a checkbox option even if it doesn't
  // match one of the standard categories (e.g. an exact violation from a scan).
  const issueOptions = Array.from(new Set([...ISSUE_TYPE_OPTIONS, ...selectedIssues]));
  const isOvercharging = selectedIssues.some(x => x.toLowerCase().includes('overcharg'));

  const toggleIssue = (opt: string) => {
    setSelectedIssues(prev => prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIssues.length === 0) return alert('Please select at least one issue type.');
    if (isOvercharging && (!amountCharged || !mrp)) {
      return alert('Please enter both the amount you were charged and the printed MRP.');
    }
    setSubmitting(true);
    try {
      const issueType = selectedIssues.join(', ');
      const saved = await submitComplaint({
        productName, brand, category, issueType, description,
        amountCharged: isOvercharging ? parseFloat(amountCharged) : undefined,
        mrp: isOvercharging ? parseFloat(mrp) : undefined,
        scanId: prefill?.scanId
      });
      const newComp: Complaint = {
        id: 'CMP-' + saved.id.slice(0, 8).toUpperCase(),
        productName,
        brand,
        category,
        issueType,
        description,
        status: 'SUBMITTED',
        date: new Date().toLocaleDateString('en-IN')
      };
      onSubmit(newComp);
      setRefId(newComp.id);
      setSubmitted(true);
    } catch (err) {
      alert('Failed to submit complaint: ' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="formpanel">
      <span className="eyebrow">CITIZEN GRIEVANCE REGISTRATION</span>
      <h1>Report a Suspected Label Issue</h1>
      {submitted ? (
        <div className="success">
          <CheckCircle2 size={24} />
          <div>
            <h2 style={{ margin: 0, color: 'var(--status-good)' }}>Grievance Submitted Successfully</h2>
            <p style={{ margin: '4px 0 0' }}>Your reference ID is <b>{refId}</b>. Assigned to Legal Metrology Officer.</p>
          </div>
          <button className="btn outline" style={{ marginTop: '16px' }} onClick={onCancel}>Back to My Grievances</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>Product Name<input required placeholder="e.g. PureDrop Cooking Oil" value={productName} onChange={e => setProductName(e.target.value)} /></label>
          <label>Brand Name<input required placeholder="e.g. Narmada Essentials" value={brand} onChange={e => setBrand(e.target.value)} /></label>
          <label>Category
            <select value={category} onChange={e => setCategory(e.target.value)}>
              <option>Food & Grocery</option>
              <option>Edible Oils</option>
              <option>Spices & Condiments</option>
              <option>Packaged Goods</option>
              <option>Packaged food</option>
            </select>
          </label>
          <label>Suspected Issue Type(s) — select all that apply</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '8px 0 16px' }}>
            {issueOptions.map(opt => (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 400, margin: 0 }}>
                <input type="checkbox" checked={selectedIssues.includes(opt)} onChange={() => toggleIssue(opt)} style={{ width: 'auto' }} />
                {opt}
              </label>
            ))}
          </div>
          {isOvercharging && (
            <div className="panel" style={{ margin: '0 0 16px', padding: '16px', background: 'var(--status-bad-bg)', border: '1px solid var(--status-bad-border)' }}>
              <strong style={{ display: 'block', marginBottom: '10px', color: 'var(--status-bad)' }}>
                Overcharging details — this strengthens your case significantly
              </strong>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ margin: 0 }}>Amount you were actually charged (₹)
                  <input required type="number" step="0.01" min="0" placeholder="e.g. 380" value={amountCharged} onChange={e => setAmountCharged(e.target.value)} />
                </label>
                <label style={{ margin: 0 }}>Printed MRP on the package (₹)
                  <input required type="number" step="0.01" min="0" placeholder="e.g. 340" value={mrp} onChange={e => setMrp(e.target.value)} />
                </label>
              </div>
              {amountCharged && mrp && parseFloat(amountCharged) > parseFloat(mrp) && (
                <p style={{ margin: '10px 0 0', fontSize: '13px', color: 'var(--status-bad)', fontWeight: 600 }}>
                  Overcharged by ₹{(parseFloat(amountCharged) - parseFloat(mrp)).toFixed(2)} — this is an offence under the Legal Metrology Act, 2009.
                </p>
              )}
            </div>
          )}
          <label>Description of Violation
            <textarea required placeholder="Explain what you observed on the package label..." value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn outline" onClick={onCancel}>Cancel</button>
            <button className="btn primary wide" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Grievance to Legal Metrology'}
            </button>
          </div>
        </form>
      )}
      <NchCard />
    </section>
  );
}

function HistoryPage({ role }: { role: Role }) {
  const [q, setQ] = useState('');
  const nav = useNavigate();

  const [realScans, setRealScans] = useState<Awaited<ReturnType<typeof listRealScans>>>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingReportId, setLoadingReportId] = useState<string>();

  React.useEffect(() => {
    listRealScans()
      .then(setRealScans)
      .catch(e => alert('Failed to load history: ' + (e as Error).message))
      .finally(() => setLoadingHistory(false));
  }, []);

  const openRealReport = async (scanId: string) => {
    setLoadingReportId(scanId);
    try {
      const backendResult = await getScanResult(scanId);
      const uiResult = mapToUiResult(backendResult);
      nav('/app/report', { state: uiResult });
    } catch (e) {
      alert('Failed to load report: ' + (e as Error).message);
    } finally {
      setLoadingReportId(undefined);
    }
  };

  const filtered = realScans.filter(r => r.productName.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">{labels[role].toUpperCase()} AUDIT REGISTER</span>
          <h1>{role === 'officer' ? 'Inspection History' : 'Analysis Records'}</h1>
          <p>Real scans stored in your database, most recent first.</p>
        </div>
      </div>
      <div className="filters">
        <Search size={16} />
        <input placeholder="Search by product name..." value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <section className="panel">
        {loadingHistory ? (
          <p style={{ padding: '20px' }}>Loading history...</p>
        ) : filtered.length === 0 ? (
          <p style={{ padding: '20px' }}>No scans yet. Run a compliance scan to see it appear here.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Audit ID</th><th>Product</th><th>Manufacturer</th><th>Score</th><th>Status</th><th>Violations</th><th>Action</th></tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.scanId}>
                  <td className="num">{r.id}</td>
                  <td>📦 {r.productName}</td>
                  <td>{r.manufacturer}</td>
                  <td className="num">{r.score}/100</td>
                  <td><span className={'badge ' + cls(r.status as Status)}>{r.status.replace(/_/g, ' ')}</span></td>
                  <td className="num">{r.violationCount}</td>
                  <td>
                    <button className="linkbtn" onClick={() => openRealReport(r.scanId)} disabled={loadingReportId === r.scanId}>
                      {loadingReportId === r.scanId ? 'Loading...' : 'View Report'}
                    </button>
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

function ReportView() {
  const state = useLocation().state as Result | undefined;
  const r = state || makeMockResult(products[1]);

  return (
    <main className="report">
      <div className="report-top">
        <div className="brand"><ShieldCheck /> LabelGuard</div>
        <button className="btn primary" onClick={() => window.print()}><Printer size={16} /> Print / Save as PDF</button>
      </div>
      <span className="eyebrow">STATUTORY LEGAL METROLOGY ASSESSMENT REPORT</span>
      <h1>{r.product.name}</h1>
      <p>Inspection Audit ID: <b className="num">{r.id}</b> · Date: <span className="num">{r.date}</span></p>

      <div className={'report-score ' + cls(r.status)}>
        Audit Score: {r.score}/100 · Status: {r.status.replace(/_/g, ' ')}
      </div>

      <h2>Principal Display Panel Declarations</h2>
      <div className="fields report-fields">
        {Object.entries(r.product.fields).map(([k, val]) => (
          <div key={k}><span>{k}</span><strong>{val}</strong></div>
        ))}
      </div>

      <h2>Statutory Rule Violations & Required Actions</h2>
      {r.violations.length > 0 ? (
        r.violations.map((v, i) => (
          <div key={i} style={{ marginBottom: '14px', padding: '12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
            <strong>{v.requirement} ({v.section})</strong>
            <p style={{ margin: '4px 0', fontSize: '13px' }}>Detected: <em>"{v.detectedValue}"</em> | Expected: {v.expectedValue}</p>
            <p style={{ margin: '4px 0', fontSize: '13px', color: 'var(--status-bad)' }}><b>Legal Issue:</b> {v.explanation}</p>
          </div>
        ))
      ) : (
        <p>No declaration issues identified under Legal Metrology (PCR) Rules, 2011.</p>
      )}

      {r.review && (
        <div style={{ marginTop: '20px', padding: '14px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)' }}>
          <h3>Authorized Enforcement Signature</h3>
          <p style={{ margin: '2px 0' }}><b>Inspector:</b> {r.review.inspector}</p>
          <p style={{ margin: '2px 0' }}><b>Decision Timestamp:</b> {r.review.confirmedAt}</p>
        </div>
      )}

      <p className="disclaimer">Official Assessment generated by LabelGuard AI enforcement framework in accordance with Legal Metrology (Packaged Commodities) Rules, 2011.</p>
    </main>
  );
}

function Landing() {
  return (
    <main className="landing">
      <nav>
        <div className="brand"><ShieldCheck /> LabelGuard</div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Link className="btn ghost" to="/rules"><BookOpen size={16} /> Official Rules</Link>
          <Link className="btn primary" to="/login">Sign In</Link>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="hero-pill">
          <Sparkles size={15} /> Next-Gen Legal Metrology Verification (SIH 2026)
        </div>
        <h1>Smart Label Compliance for Every <em>Packaged Commodity</em></h1>
        <p>AI-assisted declaration extraction and real-time rule verification designed for Metrology Officers, FMCG manufacturers, and e-commerce sellers.</p>

        <div className="hero-cta">
          <Link className="btn primary lg" to="/login">Start Compliance Check <ArrowRight size={18} /></Link>
          <Link className="btn outline lg" to="/rules">Browse Statutory Rules</Link>
        </div>

        <div className="hero-metrics-bar">
          <div className="metric-item"><b className="num">99.4%</b><span>OCR Extraction Accuracy</span></div>
          <div className="metric-item"><b className="num">&lt; 2.5s</b><span>Average Verification Speed</span></div>
          <div className="metric-item"><b className="num">100%</b><span>LMPC Rule Alignment</span></div>
        </div>
      </section>

      <section className="landing-section">
        <div className="section-head">
          <span className="eyebrow">A SIMPLE, AUDITABLE PROCESS</span>
          <h2>From label upload to inspection insight in seconds</h2>
        </div>
        <div className="steps">
          {[['01', 'Upload / Scan', 'Capture image of product packaging or display panel.'],
          ['02', 'Extract Declarations', 'Precision OCR extracts Net Qty, MRP, Packer, and Origin.'],
          ['03', 'Apply Legal Rules', 'Instant evaluation against Legal Metrology (PCR) Rules, 2011.'],
          ['04', 'Act with Confidence', 'Export official reports, flag violations, or request re-inspections.']].map(x => (
            <article key={x[0]}>
              <b className="num">{x[0]}</b>
              <h3>{x[1]}</h3>
              <p>{x[2]}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function PublicRulesPage() {
  return (
    <div className="landing" style={{ minHeight: '100vh', background: 'var(--bg-app)' }}>
      <nav>
        <Link className="brand" to="/"><ShieldCheck /> LabelGuard</Link>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link className="btn outline" to="/">Home</Link>
          <Link className="btn primary" to="/login">Sign In</Link>
        </div>
      </nav>
      <main style={{ maxWidth: '1040px', margin: '0 auto', padding: '40px 24px' }}>
        <div className="page-title" style={{ padding: '0 0 24px' }}>
          <div>
            <span className="eyebrow">STATUTORY LEGAL FRAMEWORK</span>
            <h1>Official Rules & Packaging Acts</h1>
            <p>Plain-language statutory summaries and links to official documentation.</p>
          </div>
        </div>
        <section className="rules-list">
          {ruleSummaries.map(r => (
            <article className="panel" key={r.id} style={{ margin: '18px 0', padding: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span className="badge good">{r.subtitle}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r.source}</span>
              </div>
              <h2 style={{ fontSize: '22px', margin: '6px 0 10px' }}>{r.title}</h2>
              <div style={{ background: 'var(--bg-subtle)', padding: '14px 18px', borderRadius: 'var(--radius-sm)', borderLeft: '4px solid var(--brand-primary)', marginBottom: '18px' }}>
                <strong style={{ display: 'block', color: 'var(--text-main)', marginBottom: '4px' }}>Statutory Purpose:</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{r.simpleTakeaway}</span>
              </div>
              <h3 style={{ fontSize: '15px', color: 'var(--text-main)', marginBottom: '10px' }}>Mandatory Compliance Points:</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px' }}>
                {r.keyPoints.map((pt, idx) => (
                  <li key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '5px 0', fontSize: '14px', color: 'var(--text-muted)' }}>
                    <Check size={16} color="var(--status-good)" style={{ flexShrink: 0, marginTop: '3px' }} />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                <a className="btn outline" href={r.url} target="_blank" rel="noopener noreferrer">
                  Open Official Reference Portal <ExternalLink size={13} />
                </a>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

function Login() {
  const nav = useNavigate();
  const [role, setRole] = useState<Role>('officer');
  const [email, setEmail] = useState(creds.officer.email);
  const [password, setPassword] = useState(creds.officer.password);

  const choose = (r: Role) => {
    setRole(r);
    setEmail(creds[r].email);
    setPassword(creds[r].password);
  };

  return (
    <main className="login">
      <Link className="brand" to="/"><ShieldCheck /> LabelGuard</Link>
      <form onSubmit={async e => {
        e.preventDefault();

        const { data, error } = await supabase.auth.signInWithPassword({
          email: creds[role].email,
          password: creds[role].password
        });
        if (error || !data.user) {
          alert('Login failed: ' + (error?.message ?? 'Unknown error'));
          return;
        }

        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('id, full_name, role, organization_id')
          .eq('id', data.user.id)
          .single();
        if (profileErr || !profile) {
          alert('Could not load profile: ' + (profileErr?.message ?? 'Unknown error'));
          return;
        }

        localStorage.setItem('lg-user', JSON.stringify({
          role,
          name: profile.full_name,
          userId: profile.id,
          organizationId: profile.organization_id
        }));
        nav('/app');
      }}>
        <span className="eyebrow">DEMO ACCESS (SIH PROTOTYPE)</span>
        <h1>Select Role to Log In</h1>
        <div className="roles">
          {(Object.keys(labels) as Role[]).map(r => (
            <button type="button" onClick={() => choose(r)} className={role === r ? 'selected' : ''} key={r}>
              {labels[r]}
            </button>
          ))}
        </div>
        <label>Email<input value={email} onChange={e => setEmail(e.target.value)} type="email" /></label>
        <label>Password<input value={password} onChange={e => setPassword(e.target.value)} type="password" /></label>
        <button className="btn primary wide">Sign in as {labels[role]}</button>
        <small>Demo Password: {creds[role].password}</small>
      </form>
    </main>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Awaited<ReturnType<typeof listNotifications>>>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([listNotifications(), getUnreadNotificationCount()])
      .then(([n, c]) => { setItems(n); setUnread(c); })
      .catch(e => console.error('Failed to load notifications:', e))
      .finally(() => setLoading(false));
  };

  React.useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const toggle = () => {
    setOpen(x => !x);
    if (!open) load();
  };

  const handleItemClick = async (id: string, isRead: boolean) => {
    if (!isRead) {
      await markNotificationRead(id).catch(() => { });
      load();
    }
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead().catch(() => { });
    load();
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={toggle}
        style={{ background: 'none', border: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', font: 'inherit', color: 'inherit' }}
      >
        🔔 {unread > 0 && <b className="num" style={{ color: 'var(--status-bad)' }}>{unread}</b>}
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '28px', width: '340px', maxHeight: '420px', overflowY: 'auto',
          background: '#fff', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-hover)', zIndex: 9999
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '13px' }}>Notifications</strong>
            {unread > 0 && <button className="linkbtn" style={{ fontSize: '12px' }} onClick={handleMarkAllRead}>Mark all read</button>}
          </div>
          {loading ? (
            <p style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>Loading...</p>
          ) : items.length === 0 ? (
            <p style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>No notifications yet.</p>
          ) : (
            items.map(n => (
              <div
                key={n.id}
                onClick={() => handleItemClick(n.id, n.read)}
                style={{
                  padding: '12px 16px', borderBottom: '1px solid var(--border-light)', cursor: 'pointer',
                  background: n.read ? '#fff' : 'var(--brand-soft)'
                }}
              >
                <strong style={{ display: 'block', fontSize: '13px', marginBottom: '2px' }}>{n.title}</strong>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>{n.message}</p>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{n.createdAt}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ManufacturerRoutes({ scanResult, setScanResult, nav }: {
  scanResult: Result | undefined;
  setScanResult: (r: Result | undefined) => void;
  nav: ReturnType<typeof useNavigate>;
}) {
  const location = useLocation();
  const navState = location.state as {
    productGroup?: string;
    lockedProductName?: string;
    previousVersion?: { label: string; score: number; issues: number };
  } | null;
  const [versionLabel, setVersionLabel] = useState<string>();

  React.useEffect(() => {
    setVersionLabel(undefined);

    if (navState?.productGroup) {
      nextVersionLabel(navState.productGroup)
        .then(setVersionLabel)
        .catch(() => setVersionLabel(undefined));
    }
  }, [
    location.key,
    navState?.productGroup,
    navState?.previousVersion?.label
  ]);
  return (
    <Routes>
      <Route index element={<ManufacturerDashboard onNewScan={() => { setScanResult(undefined); nav('/app/scan'); }} />} />
      <Route path="products" element={<ProductsArtwork setScanResult={setScanResult} />} />
      <Route path="recommendations" element={<Recommendations setScanResult={setScanResult} />} />
      <Route path="version-comparison" element={<VersionComparison />} />
      <Route path="scan" element={scanResult ? (
        <ManufacturerResultView result={scanResult} previousVersion={navState?.previousVersion} nav={nav} setScanResult={setScanResult} />
      ) : (
        <>
          <div className="page-title">
            <div>
              <span className="eyebrow">PREVENTIVE VERIFICATION</span>
              <h1>
                {navState?.previousVersion
                  ? `Submit Revised Packaging — ${navState.lockedProductName}`
                  : navState?.productGroup
                    ? `Upload New Version — ${navState.lockedProductName}`
                    : 'Upload Package Artwork Draft'}
              </h1>
              <p>Run real AI analysis to ensure zero statutory violations before sending to print.</p>
            </div>
          </div>
          {navState?.previousVersion && (
            <div className="panel" style={{ margin: '0 32px 20px', padding: '16px', background: 'var(--bg-subtle)', border: '1px solid var(--border-light)' }}>
              <span className="eyebrow">PREVIOUS VERSION</span>
              <p style={{ margin: '6px 0 0' }}>
                <b>{navState.previousVersion.label}</b> · Score: <b>{navState.previousVersion.score}/100</b> · Issues: <b>{navState.previousVersion.issues}</b>
                {versionLabel && <> — this upload will become <b>{versionLabel}</b></>}
              </p>
            </div>
          )}
          <Scanner
            done={setScanResult}
            role="manufacturer"
            productGroup={navState?.productGroup}
            versionLabel={versionLabel}
            lockedProductName={navState?.lockedProductName}
          />
        </>
      )} />
      <Route path="history" element={<HistoryPage role="manufacturer" />} />
      <Route path="label-generator" element={<LabelGenerator />} />
    </Routes>
  );
}
function AppShell() {
  const nav = useNavigate();
  const user = JSON.parse(localStorage.getItem('lg-user') || 'null') as { role: Role; name: string; userId?: string; organizationId?: string | null } | null;
  if (!user) return <Navigate to="/login" />;

  const [scanResult, setScanResult] = useState<Result>();
  const [isConsumerScanning, setIsConsumerScanning] = useState(false);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [complaintsLoading, setComplaintsLoading] = useState(true);

  const loadComplaints = () => {
    listComplaintsReal()
      .then(setComplaints)
      .catch(e => console.error('Failed to load complaints:', e))
      .finally(() => setComplaintsLoading(false));
  };

  React.useEffect(() => { loadComplaints(); }, []);

  const navConfig: Record<Role, { label: string; path: string; icon: React.ReactNode; badge?: number; action?: () => void }[]> = {
    officer: [
      { label: 'Dashboard', path: '', icon: <LayoutDashboard size={17} /> },
      { label: 'New Inspection', path: 'scan', icon: <Camera size={17} /> },
      { label: 'Inspection History', path: 'history', icon: <HistoryIcon size={17} /> },
      { label: 'Complaints', path: 'complaints', icon: <MessageSquare size={17} />, badge: complaints.filter(c => c.status !== 'RESOLVED').length },
    ],
    manufacturer: [
      { label: 'Dashboard', path: '', icon: <LayoutDashboard size={17} /> },
      { label: 'Products & Artwork', path: 'products', icon: <ClipboardCheck size={17} /> },
      { label: 'Package Check', path: 'scan', icon: <Camera size={17} /> },
      { label: 'Correction Recommendations', path: 'recommendations', icon: <AlertTriangle size={17} /> },
      { label: 'Version Comparison', path: 'version-comparison', icon: <ArrowLeftRight size={17} /> },
      { label: 'Label Generator', path: 'label-generator', icon: <Sparkles size={17} /> },
      { label: 'Analysis History', path: 'history', icon: <HistoryIcon size={17} /> },
    ],
    seller: [
      { label: 'Dashboard', path: '', icon: <LayoutDashboard size={17} /> },
      { label: 'Listing Check', path: 'scan', icon: <Camera size={17} /> },
      { label: 'Bulk Check', path: 'bulk-check', icon: <ClipboardCheck size={17} /> },
      { label: 'Listing History', path: 'history', icon: <HistoryIcon size={17} /> },
    ],
    consumer: [
      {
        label: 'Product Check',
        path: '',
        icon: <Camera size={17} />,
        action: () => {
          setScanResult(undefined);
          setIsConsumerScanning(false);
        }
      },
      { label: 'My Grievances', path: 'complaint', icon: <MessageSquare size={17} /> },
    ],
  };

  const handleStatusUpdate = async (newStatus: Status) => {
    if (!scanResult) return;
    try {
      if (scanResult.dbScanId && (newStatus === 'INSPECTOR_CONFIRMED_NON_COMPLIANT' || newStatus === 'UNDER_REINSPECTION')) {
        await updateScanStatus(scanResult.dbScanId, newStatus);
      }
      const updatedResult: Result = {
        ...scanResult,
        status: newStatus,
        review: {
          inspector: user.name,
          confirmedAt: new Date().toLocaleString('en-IN')
        }
      };
      setScanResult(updatedResult);
      alert(`Status updated to: ${newStatus.replace(/_/g, ' ')}`);
      setScanResult(undefined);
      nav('/app');
    } catch (e) {
      alert('Failed to update status: ' + (e as Error).message);
    }
  };

  const currentNav = navConfig[user.role];

  return (
    <div className="shell">
      <aside>
        <Link className="brand" to="/app"><ShieldCheck /> LabelGuard</Link>
        <span className="rolelabel">{labels[user.role]}</span>

        {currentNav.map(item => (
          <NavLink
            key={item.label}
            to={'/app/' + item.path}
            end={item.path === ''}
            onClick={() => {
              if (item.action) item.action();
              if (item.path === 'scan') setScanResult(undefined);
            }}
          >
            {item.icon}
            {item.label}
            {item.badge ? <span className="navbadge">{item.badge}</span> : null}
          </NavLink>
        ))}

        <button className="logout" onClick={async () => { await supabase.auth.signOut(); localStorage.removeItem('lg-user'); nav('/'); }}>
          <LogOut size={17} /> Logout
        </button>
      </aside>

      <div className="content">
        <header>
          <span>ACTIVE USER: <strong>{user.name}</strong> ({labels[user.role]})</span>
          <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span className="badge good">ONLINE</span>
            <NotificationBell />
          </span>
        </header>

        <Routes>
          {user.role === 'officer' && (
            <>
              <Route index element={<OfficerDashboard onNewScan={() => { setScanResult(undefined); nav('/app/scan'); }} />} />
              <Route path="scan" element={scanResult ? (
                <OfficerInspectionResult result={scanResult} onUpdateStatus={handleStatusUpdate} />
              ) : (
                <>
                  <div className="page-title">
                    <div>
                      <span className="eyebrow">FIELD ENFORCEMENT AUDIT</span>
                      <h1>Start New Product Inspection</h1>
                      <p>Capture label display panel to extract declarations and verify statutory compliance.</p>
                    </div>
                  </div>
                  <Scanner done={setScanResult} role="officer" />
                </>
              )} />
              <Route path="complaints" element={<OfficerComplaintsView complaints={complaints} loading={complaintsLoading} onRefresh={loadComplaints} />} />
              <Route path="history" element={<HistoryPage role="officer" />} />
            </>
          )}

          {user.role === 'manufacturer' && (
            <Route
              path="*"
              element={
                <ManufacturerRoutes
                  scanResult={scanResult}
                  setScanResult={setScanResult}
                  nav={nav}
                />
              }
            />
          )}

          {user.role === 'seller' && (
            <>
              <Route index element={<SellerDashboard onNewScan={() => { setScanResult(undefined); nav('/app/scan'); }} />} />
              <Route path="scan" element={scanResult ? (
                <div className="result">
                  <div className="result-head">
                    <div className="product-art">{scanResult.product.image}</div>
                    <div>
                      <span className="eyebrow">CATALOGUE LISTING AUDIT</span>
                      <h1>{scanResult.product.name}</h1>
                      <p>Listing Status: {scanResult.status}</p>
                    </div>
                    <Seal score={scanResult.score} statusLabel={scanResult.status} tone={cls(scanResult.status) as 'good' | 'warn' | 'bad'} />
                  </div>
                  <section className="panel" style={{ margin: '18px 0' }}>
                    <h2>Marketplace PDP Checklist</h2>
                    <div className="fields">
                      {Object.entries(scanResult.product.fields).map(([k, val]) => (
                        <div key={k}><span>{k}</span><strong>{val}</strong></div>
                      ))}
                    </div>
                  </section>
                  <button className="btn primary" onClick={() => setScanResult(undefined)}>Check Next Catalogue Item</button>
                </div>
              ) : (
                <>
                  <div className="page-title">
                    <div>
                      <span className="eyebrow">SELLER CATALOGUE CHECK</span>
                      <h1>Scan Listing Image</h1>
                      <p>Check if online product photos have all mandatory packaging declarations.</p>
                    </div>
                  </div>
                  <Scanner done={setScanResult} role="seller" />
                </>
              )} />
              <Route path="history" element={<HistoryPage role="seller" />} />
              <Route path="bulk-check" element={<SellerBulkScan />} />
            </>
          )}

          {user.role === 'consumer' && (
            <>
              <Route index element={
                scanResult ? (
                  <div className="result">
                    <div className="result-head">
                      <div className="product-art">{scanResult.product.image}</div>
                      <div>
                        <span className="eyebrow">CITIZEN COMPLIANCE CHECK</span>
                        <h1>{scanResult.product.name}</h1>
                        <p>{scanResult.product.manufacturer}</p>
                      </div>
                      <Seal score={scanResult.score} statusLabel={scanResult.status === 'COMPLIANT' ? 'COMPLIANT' : 'NON COMPLIANT'} tone={cls(scanResult.status) as 'good' | 'warn' | 'bad'} />
                    </div>

                    <div
                      className="panel"
                      style={{
                        margin: '18px 0',
                        background: scanResult.status === 'COMPLIANT' ? 'var(--status-good-bg)' : 'var(--status-bad-bg)',
                        border: '2px solid ' + (scanResult.status === 'COMPLIANT' ? 'var(--status-good)' : 'var(--status-bad)'),
                        borderRadius: 'var(--radius-md)',
                        padding: '20px'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        {scanResult.status === 'COMPLIANT'
                          ? <CheckCircle2 size={24} color="var(--status-good)" style={{ flexShrink: 0, marginTop: '2px' }} />
                          : <AlertCircle size={24} color="var(--status-bad)" style={{ flexShrink: 0, marginTop: '2px' }} />
                        }
                        <div>
                          <h2 style={{ margin: '0 0 6px', color: scanResult.status === 'COMPLIANT' ? 'var(--status-good)' : 'var(--status-bad)', fontSize: '18px' }}>
                            {scanResult.status === 'COMPLIANT' ? 'This product looks compliant' : "This product isn't fully compliant"}
                          </h2>
                          <p style={{ margin: 0, color: '#334155', fontSize: '14px' }}>
                            {scanResult.status === 'COMPLIANT'
                              ? 'All the mandatory information — like price, quantity, manufacturer, and origin — is clearly printed on this package.'
                              : `This package is missing or unclear on ${scanResult.violations.length} required detail${scanResult.violations.length === 1 ? '' : 's'}: ${scanResult.violations.map(v => v.requirement).join(', ')}. That's why it's marked non-compliant.`
                            }
                          </p>
                        </div>
                      </div>
                    </div>

                    <section className="panel" style={{ margin: '18px 0' }}>
                      <h2>Essential Label Checklist</h2>
                      <div className="checklist">
                        {Object.entries(scanResult.product.fields).map(([k, val]) => {
                          const isMissing = val === 'Not detected';
                          return (
                            <p key={k}>
                              {isMissing ? <XCircle className="red" size={16} /> : <CheckCircle2 className="green" size={16} />}
                              <span>{k}</span>
                              <b>{isMissing ? 'MISSING' : val}</b>
                            </p>
                          );
                        })}
                      </div>
                    </section>

                    <div className="result-actions" style={{ justifyContent: 'flex-start', gap: '10px' }}>
                      {scanResult.status !== 'COMPLIANT' && (
                        <button
                          className="btn primary"
                          onClick={() => nav('/app/complaint', {
                            state: {
                              productName: scanResult.product.name,
                              brand: scanResult.product.manufacturer,
                              category: scanResult.product.category,
                              issueType: scanResult.violations.map(v => RULE_CODE_TO_ISSUE_LABEL[v.section] ?? v.requirement).join(', '),
                              description: `The following required details were missing or unclear on the packaging: ${scanResult.violations.map(v => v.requirement).join(', ')}.`,
                              scanId: scanResult.dbScanId
                            }
                          })}
                        >
                          Report This Violation to Officer
                        </button>
                      )}
                      <button className="btn outline" onClick={() => { setScanResult(undefined); setIsConsumerScanning(true); }}>
                        Scan Another Product
                      </button>
                    </div>

                    <NchCard />
                  </div>
                ) : isConsumerScanning ? (
                  <>
                    <div className="page-title">
                      <div>
                        <span className="eyebrow">CITIZEN SCANNER</span>
                        <h1>Check a Product Label</h1>
                        <p>Upload or take a photo of the product front or back label.</p>
                      </div>
                      <button className="btn outline" onClick={() => setIsConsumerScanning(false)}>Back to Portal</button>
                    </div>
                    <Scanner
                      done={(res) => {
                        setScanResult(res);
                        setIsConsumerScanning(false);
                      }}
                      role="consumer"
                    />
                  </>
                ) : (
                  <ConsumerDashboard onNewScan={() => setIsConsumerScanning(true)} />
                )
              } />
              <Route path="complaint" element={<ConsumerGrievancesPage onGlobalComplaintAdd={c => setComplaints(prev => [c, ...prev])} />} />
            </>
          )}

          <Route path="report" element={<ReportView />} />
          {user.role !== 'manufacturer' && <Route path="*" element={<Navigate to="/app" />} />}
        </Routes>
      </div>
    </div>
  );
}

function Root() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/rules" element={<PublicRulesPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/app/*" element={<AppShell />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
createRoot(document.getElementById('root')!).render(<Root />);
