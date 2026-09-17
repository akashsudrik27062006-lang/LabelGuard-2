import { supabase } from './supabase';

// ============================================================
// SCAN PIPELINE
// ============================================================
export async function startScan(opts: {
  imageFile: File;
  productName: string;
  category: string;
  manufacturer?: string;
  scanType: 'MANUFACTURER' | 'SELLER' | 'OFFICER' | 'CONSUMER';
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: product, error: productErr } = await supabase
    .from('products')
    .insert({ name: opts.productName, category: opts.category, manufacturer: opts.manufacturer, created_by: user.id })
    .select().single();
  if (productErr) throw productErr;

  const path = `${user.id}/${product.id}/${Date.now()}-${opts.imageFile.name}`;
  const { error: uploadErr } = await supabase.storage
    .from('product-images').upload(path, opts.imageFile);
  if (uploadErr) throw uploadErr;

  await supabase.from('product_images').insert({
    product_id: product.id, storage_path: path, image_type: 'LABEL', uploaded_by: user.id
  });

  const { data: scan, error: scanErr } = await supabase
    .from('scans')
    .insert({ product_id: product.id, user_id: user.id, scan_type: opts.scanType, status: 'UPLOADED' })
    .select().single();
  if (scanErr) throw scanErr;

  const { data: result, error: fnErr } = await supabase.functions.invoke('process-scan', {
    body: { scanId: scan.id }
  });
  if (fnErr) {
    let details = fnErr.message;
    if (fnErr.context) {
      try { details = await fnErr.context.text(); } catch {}
    }
    throw new Error(details);
  }

  return { scanId: scan.id, productId: product.id, ...result };
}

export async function getScanResult(scanId: string) {
  const { data: scan } = await supabase.from('scans').select('*, products(*)').eq('id', scanId).single();
  const { data: declarations } = await supabase.from('declarations').select('*').eq('scan_id', scanId);
  const { data: violations } = await supabase.from('violations').select('*, rules(*)').eq('scan_id', scanId);
  return { scan, declarations: declarations ?? [], violations: violations ?? [] };
}

// ============================================================
// MAPPING: real DB data -> the exact `Result`/`Product` shape
// your existing UI components (OfficerInspectionResult, ReportView,
// dashboards, etc.) already expect. No UI component code needs to change.
// ============================================================
const FIELD_LABELS: Record<string, string> = {
  product_name: 'Generic Name',
  manufacturer: 'Manufacturer',
  net_quantity: 'Net Quantity',
  mrp: 'MRP',
  country_of_origin: 'Country of Origin',
  consumer_care: 'Consumer Care',
  manufacturing_date: 'Packing Date',
};

// Rule names in the DB include legal citations for Officer/Manufacturer views
// (e.g. "Country of Origin (Rule 6(1)(aa))"). Strip that suffix for any
// consumer-facing text so it reads as plain language.
function stripCitation(text: string): string {
  return text.replace(/\s*\(Rule[^)]*\)\s*$/i, '').trim();
}

export function mapToUiResult(backendResult: {
  scan: any;
  declarations: any[];
  violations: any[];
}) {
  const { scan, declarations, violations } = backendResult;

  const fields: Record<string, string> = {};
  for (const d of declarations) {
    const label = FIELD_LABELS[d.field];
    if (!label) continue;
    fields[label] = d.present && d.value ? d.value : 'Not detected';
  }

  const mappedViolations = violations.map((v: any) => ({
    dbId: v.id,
    requirement: stripCitation(v.rules?.rule_name ?? v.field),
    section: v.rules?.rule_code ?? '',
    status: 'MISSING' as const,
    detectedValue: v.detected_value ?? 'Not detected',
    expectedValue: v.expected_value ?? '',
    explanation: v.evidence_json?.explanation ?? '',
    ruleRef: {
      law: 'Legal Metrology (Packaged Commodities) Rules, 2011',
      section: v.rules?.rule_code ?? '',
      url: v.rules?.source_url ?? ''
    },
    recommendation: `Correct the "${v.rules?.rule_name ?? v.field}" declaration to meet statutory requirements.`
  }));

  const product = {
    id: scan.product_id,
    name: scan.products?.name ?? 'Unknown Product',
    manufacturer: fields['Manufacturer'] ?? scan.products?.manufacturer ?? 'Not detected',
    category: scan.products?.category ?? 'Packaged food',
    image: '📦',
    status: scan.status,
    fields,
  };

  return {
    id: 'INSP-' + scan.id.slice(0, 8).toUpperCase(),
    dbScanId: scan.id,
    product,
    score: scan.score ?? 0,
    status: scan.status,
    violations: mappedViolations,
    date: new Date(scan.completed_at ?? scan.started_at).toLocaleDateString('en-IN'),
  };
}

// ============================================================
// HISTORY — real past scans for the History page.
// RLS already restricts this correctly: manufacturers/sellers/consumers
// see only their own scans; officers see everyone's.
// ============================================================
export async function listRealScans() {
  const { data, error } = await supabase
    .from('scans')
    .select('*, products(*), violations(id)')
    .not('status', 'in', '("UPLOADED","PROCESSING")')
    .order('started_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((scan: any) => ({
    id: 'INSP-' + scan.id.slice(0, 8).toUpperCase(),
    scanId: scan.id,
    productName: scan.products?.name ?? 'Unknown Product',
    manufacturer: scan.products?.manufacturer ?? 'Not detected',
    score: scan.score ?? 0,
    status: scan.status as string,
    violationCount: (scan.violations ?? []).length,
    date: new Date(scan.completed_at ?? scan.started_at).toLocaleDateString('en-IN'),
  }));
}

// ============================================================
// VIOLATIONS — officer confirm/reject decisions, persisted for real
// ============================================================
export async function updateViolationDecision(violationId: string, decision: 'VERIFIED' | 'REJECTED') {
  const dbStatus = decision === 'VERIFIED' ? 'CONFIRMED' : 'REJECTED';
  const { error } = await supabase.from('violations').update({ status: dbStatus }).eq('id', violationId);
  if (error) throw error;
}

// ============================================================
// SCAN STATUS — officer "confirm non-compliant" / "send for re-inspection"
// The UI uses richer status names than the DB enum allows, so we map them.
// ============================================================
export async function updateScanStatus(
  scanId: string,
  uiStatus: 'INSPECTOR_CONFIRMED_NON_COMPLIANT' | 'UNDER_REINSPECTION' | 'COMPLIANT'
) {
  const dbStatus =
    uiStatus === 'INSPECTOR_CONFIRMED_NON_COMPLIANT' ? 'NON_COMPLIANT' :
    uiStatus === 'UNDER_REINSPECTION' ? 'REVIEW' :
    'COMPLIANT';
  const { error } = await supabase.from('scans').update({ status: dbStatus }).eq('id', scanId);
  if (error) throw error;

  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('audit_logs').insert({
    user_id: user?.id,
    action: 'OFFICER_STATUS_UPDATE',
    entity_type: 'scans',
    entity_id: scanId,
    metadata: { uiStatus, dbStatus }
  });
}

// ============================================================
// COMPLAINTS — real persistence for consumer submissions + officer view
// ============================================================
export async function submitComplaint(c: {
  productName: string;
  brand: string;
  category: string;
  issueType: string;
  description: string;
  amountCharged?: number;
  mrp?: number;
  scanId?: string; // if the consumer filed this from a real scan, link it directly
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  let productId: string;

  if (c.scanId) {
    // Reuse the exact product/photo already tied to this scan — no duplicate
    // product row, and the officer will be able to see the real evidence photo.
    const { data: scan, error: scanErr } = await supabase.from('scans').select('product_id').eq('id', c.scanId).single();
    if (scanErr || !scan) throw new Error('Could not find the original scan to attach as evidence.');
    productId = scan.product_id;
  } else {
    const { data: product, error: productErr } = await supabase
      .from('products')
      .insert({ name: c.productName, manufacturer: c.brand, category: c.category, created_by: user.id })
      .select().single();
    if (productErr) throw productErr;
    productId = product.id;
  }

  const { data, error } = await supabase.from('complaints').insert({
    consumer_id: user.id,
    product_id: productId,
    scan_id: c.scanId ?? null,
    complaint_type: c.issueType,
    description: c.description,
    amount_charged: c.amountCharged ?? null,
    mrp: c.mrp ?? null,
    status: 'SUBMITTED'
  }).select().single();
  if (error) throw error;
  return data;
}

export async function listComplaintsReal() {
  const { data, error } = await supabase
    .from('complaints')
    .select('*, products(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((c: any) => ({
    id: 'CMP-' + c.id.slice(0, 8).toUpperCase(),
    dbId: c.id,
    productId: c.product_id as string | null,
    scanId: c.scan_id as string | null,
    productName: c.products?.name ?? 'Unknown Product',
    brand: c.products?.manufacturer ?? 'Unknown',
    category: c.products?.category ?? 'Other',
    issueType: c.complaint_type,
    description: c.description,
    status: c.status as 'SUBMITTED' | 'UNDER_INVESTIGATION' | 'RESOLVED',
    outcome: c.outcome as 'CONFIRMED' | 'REJECTED' | null,
    officerRemarks: c.officer_remarks as string | null,
    amountCharged: c.amount_charged as number | null,
    mrp: c.mrp as number | null,
    date: new Date(c.created_at).toLocaleDateString('en-IN'),
  }));
}

// Officer starts looking into a complaint (SUBMITTED -> UNDER_INVESTIGATION)
export async function startComplaintInvestigation(complaintId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('complaints').update({
    status: 'UNDER_INVESTIGATION',
    assigned_officer: user?.id,
    investigated_at: new Date().toISOString()
  }).eq('id', complaintId);
  if (error) throw error;
}

// Officer closes a complaint with a verdict (-> RESOLVED, with CONFIRMED or REJECTED outcome)
export async function resolveComplaint(complaintId: string, outcome: 'CONFIRMED' | 'REJECTED', remarks: string) {
  const { error } = await supabase.from('complaints').update({
    status: 'RESOLVED',
    outcome,
    officer_remarks: remarks,
    resolved_at: new Date().toISOString()
  }).eq('id', complaintId);
  if (error) throw error;
}

// ============================================================
// DASHBOARD STATS — real counts, scoped automatically by RLS
// (officers see everyone's data, others see only their own)
// ============================================================
export async function getDashboardStats() {
  const { count: totalScans } = await supabase.from('scans').select('*', { count: 'exact', head: true });
  const { count: compliant } = await supabase.from('scans').select('*', { count: 'exact', head: true }).eq('status', 'COMPLIANT');
  const { count: nonCompliant } = await supabase.from('scans').select('*', { count: 'exact', head: true }).eq('status', 'NON_COMPLIANT');
  const { count: review } = await supabase.from('scans').select('*', { count: 'exact', head: true }).eq('status', 'REVIEW');
  const { count: pendingComplaints } = await supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('status', 'SUBMITTED');
  const { count: confirmedViolations } = await supabase.from('violations').select('*', { count: 'exact', head: true }).eq('status', 'CONFIRMED');

  return {
    totalScans: totalScans ?? 0,
    compliant: compliant ?? 0,
    nonCompliant: nonCompliant ?? 0,
    review: review ?? 0,
    pendingComplaints: pendingComplaints ?? 0,
    confirmedViolations: confirmedViolations ?? 0,
  };
}

// Fetch a signed, temporary viewing URL for a complaint's evidence photo
// (the actual product image from the scan the consumer filed this from).
export async function getEvidenceImageUrl(productId: string): Promise<string | null> {
  const { data: images } = await supabase
    .from('product_images')
    .select('storage_path')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(1);
  const image = images?.[0];
  if (!image) return null;

  const { data: signed } = await supabase.storage
    .from('product-images')
    .createSignedUrl(image.storage_path, 600);
  return signed?.signedUrl ?? null;
}
