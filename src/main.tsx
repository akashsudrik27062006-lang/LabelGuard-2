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

type Role = 'officer' | 'manufacturer' | 'seller' | 'consumer';
type Status = 'COMPLIANT' | 'WARNING' | 'NON_COMPLIANT' | 'INSPECTOR_CONFIRMED_NON_COMPLIANT' | 'UNDER_REINSPECTION';
type Permission = 'scan' | 'detailed' | 'records' | 'officialReport' | 'complaint' | 'manageRules' | 'analytics' | 'review';
type Confidence = Record<string, number>;
type RuleRef = { law: string; section: string; url: string };

type RuleViolation = {
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
};

type Result = { 
  id: string; 
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
  productName: string;
  brand: string;
  category: string;
  issueType: string;
  description: string;
  status: 'SUBMITTED' | 'UNDER_INVESTIGATION' | 'RESOLVED';
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
  officer: { email: 'officer@labelguard.demo', password: 'officer123', name: 'Ananya Sharma (Insp. ID: LMO-441)' },
  manufacturer: { email: 'manufacturer@labelguard.demo', password: 'manufacturer123', name: 'ABC Foods Quality Desk' },
  seller: { email: 'seller@labelguard.demo', password: 'seller123', name: 'Marketplace Seller Desk' },
  consumer: { email: 'consumer@labelguard.demo', password: 'consumer123', name: 'Rahul Verma' },
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

function Scanner({ done, role }: { done: (r: Result) => void; role: Role }) {
  const [product, setProduct] = useState(products[role === 'manufacturer' ? 0 : role === 'seller' ? 1 : 1]);
  const [file, setFile] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);

  const analyze = () => {
    if (!file) return alert('Please upload a product packaging image.');
    setLoading(true); 
    setStep(0);
    let i = 0;
    const t = setInterval(() => {
      i++;
      if (i === SCAN_STEPS.length) { 
        clearInterval(t); 
        done(makeMockResult(product)); 
      } else {
        setStep(i);
      }
    }, 320);
  };

  const progress = loading ? Math.round(((step + 1) / SCAN_STEPS.length) * 100) : 0;

  return (
    <section className="scanner">
      <div className="sample-picker">
        <b>Select Demo Scenario:</b>
        {products.map(p => (
          <button key={p.id} onClick={() => setProduct(p)} className={p.id === product.id ? 'active' : ''}>
            {p.image} {p.name}
          </button>
        ))}
      </div>
      <label className="dropzone">
        <input 
          aria-label="Upload product label" 
          type="file" 
          accept="image/*" 
          onChange={e => { 
            const f = e.target.files?.[0]; 
            if (f) setFile(URL.createObjectURL(f)); 
          }} 
          disabled={loading} 
        />
        {file ? (
          <img src={file} alt="Product label preview" />
        ) : (
          <>
            <Upload size={32} />
            <b>Upload product label or Principal Display Panel</b>
            <span>Supported formats: JPG, PNG, WEBP (Simulated OCR)</span>
          </>
        )}
        {loading && (
          <div className="scan-overlay">
            <ScanGauge progress={progress} />
            <b>{SCAN_STEPS[step]}</b>
            <span>Evaluating against statutory Legal Metrology rules</span>
          </div>
        )}
      </label>
      {file && (
        <div className="scan-actions">
          <button className="btn outline" onClick={() => setFile(undefined)} disabled={loading}>Remove Image</button>
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
        <article><b className="num">142</b><span>Total Inspections</span></article>
        <article><b className="num" style={{ color: 'var(--status-bad)' }}>38</b><span>Confirmed Violations</span></article>
        <article><b className="num" style={{ color: 'var(--status-warn)' }}>12</b><span>Under Re-inspection</span></article>
        <article><b className="num" style={{ color: 'var(--brand-primary)' }}>18</b><span>Pending Complaints</span></article>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <h2>Statutory Compliance Distribution</h2>
          <div className="bars">
            <p><span>Compliant</span><i style={{ width: '64%' }}></i><b className="num">64%</b></p>
            <p><span>Non-Compliant</span><i className="redbar" style={{ width: '27%' }}></i><b className="num">27%</b></p>
            <p><span>Warnings / Re-inspect</span><i className="amberbar" style={{ width: '9%' }}></i><b className="num">9%</b></p>
          </div>
        </section>

        <section className="panel">
          <h2>Enforcement Action Queue</h2>
          <div className="alert" style={{ background: 'var(--status-bad-bg)', border: '1px solid var(--status-bad-border)' }}>
            <AlertTriangle size={18} color="var(--status-bad)" />
            <div>
              <strong style={{ color: 'var(--status-bad)', display: 'block' }}>Mandatory Review Required</strong>
              <span>Missing MRP detected on Golden Crunch Biscuits (Super Mart Noida).</span>
            </div>
          </div>
          <div className="alert">
            <CheckCircle2 size={18} color="var(--status-good)" />
            <div>
              <strong style={{ display: 'block' }}>Re-inspection Verification Completed</strong>
              <span>ABC Foods updated Net Qty symbol on Basmati Rice batch.</span>
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2>Recent Field Inspections</h2>
          <button className="linkbtn" onClick={() => nav('/app/history')}>View Complete Register <ArrowRight size={14} /></button>
        </div>
        <table>
          <thead>
            <tr><th>Inspection ID</th><th>Product</th><th>Manufacturer</th><th>Status</th><th>Violations</th></tr>
          </thead>
          <tbody>
            {products.slice(0, 3).map(p => (
              <tr key={p.id}>
                <td className="num">INSP-{(p.id === 'rice' ? '9012' : p.id === 'oil' ? '4410' : '3129')}</td>
                <td>{p.image} {p.name}</td>
                <td>{p.manufacturer}</td>
                <td><span className={'badge ' + cls(p.status)}>{p.status.replace(/_/g, ' ')}</span></td>
                <td className="num">{mockViolations(p).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function OfficerInspectionResult({ result, onUpdateStatus }: { result: Result; onUpdateStatus: (newStatus: Status) => void }) {
  const [violationsState, setViolationsState] = useState<RuleViolation[]>(result.violations);
  const nav = useNavigate();

  const handleDecision = (idx: number, decision: 'VERIFIED' | 'REJECTED') => {
    const updated = [...violationsState];
    updated[idx].officerDecision = decision;
    setViolationsState(updated);
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
                    <button className="btn outline" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleDecision(idx, 'REJECTED')}>Reject Finding</button>
                    <button className="btn primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleDecision(idx, 'VERIFIED')}>Verify Finding</button>
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

function OfficerComplaintsView({ complaints }: { complaints: Complaint[] }) {
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">CONSUMER GRIEVANCE QUEUE</span>
          <h1>Consumer Complaints Register</h1>
          <p>Audit consumer reported label violations and trigger enforcement inspections.</p>
        </div>
      </div>
      <section className="panel">
        <table>
          <thead>
            <tr><th>Complaint ID</th><th>Product</th><th>Reported Issue</th><th>Date</th><th>Status</th><th>Action</th></tr>
          </thead>
          <tbody>
            {complaints.map(c => (
              <tr key={c.id}>
                <td className="num">{c.id}</td>
                <td><strong>{c.productName}</strong> ({c.brand})</td>
                <td>{c.issueType}</td>
                <td className="num">{c.date}</td>
                <td><span className={'badge ' + (c.status === 'SUBMITTED' ? 'bad' : 'warn')}>{c.status}</span></td>
                <td>
                  <button className="linkbtn" onClick={() => alert(`Initiating field inspection for ${c.productName}...`)}>
                    Initiate Audit <ArrowRight size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function ManufacturerDashboard({ onNewScan }: { onNewScan: () => void }) {
  const [activeTab, setActiveTab] = useState<'check' | 'compare'>('check');

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">PREVENTIVE PACKAGING DESK</span>
          <h1>Pre-Market Packaging Compliance Check</h1>
          <p>Verify your packaging artwork and mandatory declarations before releasing batches into the market.</p>
        </div>
        <button className="btn primary" onClick={onNewScan}><Camera size={16} /> Check Packaging Design</button>
      </div>

      <div className="stats">
        <article><b className="num">46</b><span>Packages Checked</span></article>
        <article><b className="num" style={{ color: 'var(--status-good)' }}>34</b><span>Passed / Market Ready</span></article>
        <article><b className="num" style={{ color: 'var(--status-warn)' }}>12</b><span>Corrections Required</span></article>
        <article><b className="num" style={{ color: 'var(--brand-primary)' }}>100%</b><span>Audit Trail Saved</span></article>
      </div>

      <div className="panel" style={{ margin: '20px 32px' }}>
        <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px', marginBottom: '16px' }}>
          <button className={'btn ' + (activeTab === 'check' ? 'primary' : 'outline')} onClick={() => setActiveTab('check')}>Recent Artwork Checks</button>
          <button className={'btn ' + (activeTab === 'compare' ? 'primary' : 'outline')} onClick={() => setActiveTab('compare')}><ArrowLeftRight size={14} /> Compare Previous vs Corrected Design</button>
        </div>

        {activeTab === 'check' ? (
          <table>
            <thead>
              <tr><th>Packaging Item</th><th>Category</th><th>Score</th><th>Status</th><th>Required Correction</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>🍚 Premium Basmati Rice (5kg)</td>
                <td>Food grain</td>
                <td className="num">98/100</td>
                <td><span className="badge good">COMPLIANT</span></td>
                <td>None - Batch released</td>
              </tr>
              <tr>
                <td>🍪 Golden Crunch Biscuits (300g)</td>
                <td>Packaged Food</td>
                <td className="num">62/100</td>
                <td><span className="badge bad">CHANGES NEEDED</span></td>
                <td>Missing MRP inclusive of taxes (Rule 6(1)(e))</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div className="ba-grid" style={{ marginTop: '10px' }}>
            <div className="ba-col before">
              <h3><XCircle size={14} /> Previous Label (Draft v1.0)</h3>
              <p><b>Net Quantity:</b> 1 Litre (900 mL) <span style={{ color: 'var(--status-bad)' }}>[Malformed]</span></p>
              <p><b>MRP:</b> ₹340 (Taxes extra) <span style={{ color: 'var(--status-bad)' }}>[Invalid]</span></p>
              <span className="badge bad">FAILED PRE-MARKET AUDIT</span>
            </div>
            <div className="ba-col after">
              <h3><CheckCircle2 size={14} /> Corrected Label (Artwork v2.0)</h3>
              <p><b>Net Quantity:</b> 1 L (1000 mL) <span style={{ color: 'var(--status-good)' }}>[Verified]</span></p>
              <p><b>MRP:</b> ₹340 (incl. of all taxes) <span style={{ color: 'var(--status-good)' }}>[Compliant]</span></p>
              <span className="badge good">READY FOR PRINTING</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function SellerDashboard({ onNewScan }: { onNewScan: () => void }) {
  const [selectedBatch, setSelectedBatch] = useState<string[]>([]);
  const [bulkRan, setBulkRan] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedBatch(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">E-COMMERCE SELLER DESK</span>
          <h1>Marketplace Listing Compliance</h1>
          <p>Scan catalogue images and run bulk compliance checks to ensure all PDP declarations are visible before listing.</p>
        </div>
        <button className="btn primary" onClick={onNewScan}><Camera size={16} /> Scan Listing Label</button>
      </div>

      <div className="stats">
        <article><b className="num">82</b><span>Listings Scanned</span></article>
        <article><b className="num" style={{ color: 'var(--status-good)' }}>58</b><span>Passed Listings</span></article>
        <article><b className="num" style={{ color: 'var(--status-warn)' }}>18</b><span>Needs Review</span></article>
        <article><b className="num" style={{ color: 'var(--status-bad)' }}>6</b><span>Potential High Risk</span></article>
      </div>

      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h2>Bulk Marketplace Checker (Demo)</h2>
            <p style={{ margin: 0 }}>Select catalogue inventory items to run simulated batch rule validation.</p>
          </div>
          <button 
            className="btn primary" 
            disabled={selectedBatch.length === 0} 
            onClick={() => setBulkRan(true)}
          >
            <ClipboardCheck size={16} /> Run Bulk Check ({selectedBatch.length})
          </button>
        </div>

        <table>
          <thead>
            <tr><th>Select</th><th>Catalogue SKU</th><th>Declared MRP</th><th>Origin</th><th>Status</th></tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id}>
                <td>
                  <input 
                    type="checkbox" 
                    checked={selectedBatch.includes(p.id)} 
                    onChange={() => toggleSelect(p.id)} 
                  />
                </td>
                <td>{p.image} <strong>{p.name}</strong></td>
                <td>{p.fields['MRP'] || 'N/A'}</td>
                <td>{p.fields['Country of Origin'] || 'India'}</td>
                <td><span className={'badge ' + cls(p.status)}>{p.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>

        {bulkRan && (
          <div style={{ marginTop: '18px', padding: '16px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
            <h3 style={{ color: 'var(--brand-primary)', margin: '0 0 6px' }}>Bulk Verification Summary</h3>
            <p style={{ margin: 0 }}>Verified {selectedBatch.length} product listings: 1 fully compliant, {selectedBatch.length - 1} requires PDP updates before publishing to marketplace.</p>
          </div>
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

function ConsumerComplaintForm({ onSubmit }: { onSubmit: (c: Complaint) => void }) {
  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('Food & Grocery');
  const [issueType, setIssueType] = useState('Missing MRP');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newComp: Complaint = {
      id: 'CMP-' + Math.floor(1000 + Math.random() * 9000),
      productName,
      brand,
      category,
      issueType,
      description,
      status: 'SUBMITTED',
      date: new Date().toLocaleDateString('en-IN')
    };
    onSubmit(newComp);
    setSubmitted(true);
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
            <p style={{ margin: '4px 0 0' }}>Your mock reference ID is <b>CR-LG-2026-9921</b>. Assigned to Legal Metrology Officer.</p>
          </div>
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
            </select>
          </label>
          <label>Suspected Issue Type
            <select value={issueType} onChange={e => setIssueType(e.target.value)}>
              <option>Missing Maximum Retail Price (MRP)</option>
              <option>Contradictory / Incorrect Net Quantity</option>
              <option>Missing Manufacturer / Packer Address</option>
              <option>Overcharging Above Printed MRP</option>
            </select>
          </label>
          <label>Description of Violation
            <textarea required placeholder="Explain what you observed on the package label..." value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </label>
          <button className="btn primary wide">Submit Grievance to Legal Metrology</button>
        </form>
      )}
      <NchCard />
    </section>
  );
}

function HistoryPage({ role }: { role: Role }) {
  const [q, setQ] = useState('');
  const allResults = products.map(makeMockResult);
  const filtered = allResults.filter(r => r.product.name.toLowerCase().includes(q.toLowerCase()));
  const nav = useNavigate();

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">{labels[role].toUpperCase()} AUDIT REGISTER</span>
          <h1>{role === 'officer' ? 'Inspection History' : 'Analysis Records'}</h1>
          <p>Search and review historical label assessments.</p>
        </div>
      </div>
      <div className="filters">
        <Search size={16} />
        <input placeholder="Search by product name..." value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <section className="panel">
        <table>
          <thead>
            <tr><th>Audit ID</th><th>Product</th><th>Manufacturer</th><th>Score</th><th>Status</th><th>Violations</th><th>Action</th></tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id}>
                <td className="num">{r.id}</td>
                <td>{r.product.image} {r.product.name}</td>
                <td>{r.product.manufacturer}</td>
                <td className="num">{r.score}/100</td>
                <td><span className={'badge ' + cls(r.status)}>{r.status.replace(/_/g, ' ')}</span></td>
                <td className="num">{r.violations.length}</td>
                <td>
                  <button className="linkbtn" onClick={() => nav('/app/report', { state: r })}>View Report</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <form onSubmit={e => { 
        e.preventDefault(); 
        if (email === creds[role].email && password === creds[role].password) { 
          localStorage.setItem('lg-user', JSON.stringify({ role, name: creds[role].name })); 
          nav('/app'); 
        } else {
          alert('Use the displayed demo credentials.'); 
        }
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

function AppShell() {
  const nav = useNavigate();
  const user = JSON.parse(localStorage.getItem('lg-user') || 'null') as { role: Role; name: string } | null;
  if (!user) return <Navigate to="/login" />;

  const [scanResult, setScanResult] = useState<Result>();
  const [isConsumerScanning, setIsConsumerScanning] = useState(false);
  const [complaints, setComplaints] = useState<Complaint[]>(initialComplaints);

  const navConfig: Record<Role, { label: string; path: string; icon: React.ReactNode; badge?: number; action?: () => void }[]> = {
    officer: [
      { label: 'Dashboard', path: '', icon: <LayoutDashboard size={17} /> },
      { label: 'New Inspection', path: 'scan', icon: <Camera size={17} /> },
      { label: 'Inspection History', path: 'history', icon: <HistoryIcon size={17} /> },
      { label: 'Complaints', path: 'complaints', icon: <MessageSquare size={17} />, badge: complaints.length },
    ],
    manufacturer: [
      { label: 'Dashboard', path: '', icon: <LayoutDashboard size={17} /> },
      { label: 'Package Check', path: 'scan', icon: <Camera size={17} /> },
      { label: 'Analysis History', path: 'history', icon: <HistoryIcon size={17} /> },
    ],
    seller: [
      { label: 'Dashboard', path: '', icon: <LayoutDashboard size={17} /> },
      { label: 'Listing Check', path: 'scan', icon: <Camera size={17} /> },
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

  const handleStatusUpdate = (newStatus: Status) => {
    if (!scanResult) return;
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

        <button className="logout" onClick={() => { localStorage.removeItem('lg-user'); nav('/'); }}>
          <LogOut size={17} /> Logout
        </button>
      </aside>

      <div className="content">
        <header>
          <span>ACTIVE USER: <strong>{user.name}</strong> ({labels[user.role]})</span>
          <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span className="badge good">ONLINE</span>
            <span>🔔 <b className="num">2</b></span>
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
              <Route path="complaints" element={<OfficerComplaintsView complaints={complaints} />} />
              <Route path="history" element={<HistoryPage role="officer" />} />
            </>
          )}

          {user.role === 'manufacturer' && (
            <>
              <Route index element={<ManufacturerDashboard onNewScan={() => { setScanResult(undefined); nav('/app/scan'); }} />} />
              <Route path="scan" element={scanResult ? (
                <div className="result">
                  <div className="result-head">
                    <div className="product-art">{scanResult.product.image}</div>
                    <div>
                      <span className="eyebrow">PRE-MARKET PACKAGING AUDIT</span>
                      <h1>{scanResult.product.name}</h1>
                      <p>{scanResult.product.category} · Artwork Design Check</p>
                    </div>
                    <Seal score={scanResult.score} statusLabel={scanResult.status} tone={cls(scanResult.status) as 'good' | 'warn' | 'bad'} />
                  </div>
                  <section className="panel" style={{ margin: '18px 0' }}>
                    <h2>Packaging Corrections Checklist</h2>
                    {scanResult.violations.length > 0 ? scanResult.violations.map((v, i) => (
                      <div key={i} style={{ padding: '12px', background: 'var(--status-bad-bg)', borderRadius: 'var(--radius-sm)', marginBottom: '10px' }}>
                        <strong style={{ color: 'var(--status-bad)' }}>{v.requirement} ({v.section})</strong>
                        <p style={{ margin: '4px 0', fontSize: '13px' }}><b>Correction Needed:</b> {v.recommendation}</p>
                      </div>
                    )) : <p>Packaging artwork is 100% compliant with Legal Metrology (PCR) Rules, 2011.</p>}
                  </section>
                  <button className="btn primary" onClick={() => setScanResult(undefined)}>Test Another Packaging Version</button>
                </div>
              ) : (
                <>
                  <div className="page-title">
                    <div>
                      <span className="eyebrow">PREVENTIVE VERIFICATION</span>
                      <h1>Upload Package Artwork Draft</h1>
                      <p>Run simulated OCR to ensure zero statutory violations before sending to print.</p>
                    </div>
                  </div>
                  <Scanner done={setScanResult} role="manufacturer" />
                </>
              )} />
              <Route path="history" element={<HistoryPage role="manufacturer" />} />
            </>
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

                    {scanResult.status !== 'COMPLIANT' && (
                      <div 
                        className="panel" 
                        style={{ 
                          margin: '18px 0', 
                          background: 'var(--status-bad-bg)', 
                          border: '2px solid var(--status-bad)', 
                          borderRadius: 'var(--radius-md)', 
                          padding: '20px' 
                        }}
                      >
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <AlertCircle size={24} color="var(--status-bad)" style={{ flexShrink: 0, marginTop: '2px' }} />
                          <div>
                            <h2 style={{ margin: '0 0 6px', color: 'var(--status-bad)', fontSize: '18px' }}>
                              Non-Compliance Alert Detected!
                            </h2>
                            <p style={{ margin: '0 0 12px', color: '#7f1d1d', fontSize: '14px', fontWeight: 600 }}>
                              This product packaging violates mandatory Indian Legal Metrology (Packaged Commodities) Rules:
                            </p>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {scanResult.violations.map((v, i) => (
                                <div key={i} style={{ background: '#ffffff', padding: '10px 14px', borderRadius: 'var(--radius-sm)', borderLeft: '4px solid var(--status-bad)' }}>
                                  <strong style={{ color: 'var(--status-bad)', display: 'block', fontSize: '13px' }}>
                                    ⚠️ {v.requirement} ({v.section})
                                  </strong>
                                  <span style={{ fontSize: '13px', color: '#334155' }}>
                                    {v.explanation}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

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
                        <button className="btn primary" onClick={() => nav('/app/complaint')}>
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
              <Route path="complaint" element={<ConsumerComplaintForm onSubmit={c => setComplaints(prev => [c, ...prev])} />} />
            </>
          )}

          <Route path="report" element={<ReportView />} />
          <Route path="*" element={<Navigate to="/app" />} />
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