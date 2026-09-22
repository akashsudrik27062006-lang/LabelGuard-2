import { supabase } from './supabase';

// ============================================================
// SCAN PIPELINE
// ============================================================
function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export async function startScan(opts: {
  imageFile?: File; // backward-compatible single-image path (e.g. bulk scan)
  images?: { file: File; type: 'FRONT' | 'BACK' | 'STRIP' }[]; // new multi-image path
  productName: string;
  category: string;
  manufacturer?: string;
  scanType: 'MANUFACTURER' | 'SELLER' | 'OFFICER' | 'CONSUMER';
  isImported?: boolean;
  productGroup?: string;
  versionLabel?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const imageList = opts.images ?? (opts.imageFile ? [{ file: opts.imageFile, type: 'FRONT' as const }] : []);
  if (imageList.length === 0) throw new Error('At least one image is required');

  const { data: product, error: productErr } = await supabase
    .from('products')
    .insert({
      name: opts.productName, category: opts.category, manufacturer: opts.manufacturer,
      created_by: user.id, is_imported: opts.isImported ?? false,
      product_group: opts.productGroup ?? (opts.scanType === 'MANUFACTURER' ? slugify(opts.productName) : undefined),
      version_label: opts.versionLabel ?? (opts.scanType === 'MANUFACTURER' ? 'v1' : undefined),
    })
    .select().single();
  if (productErr) throw productErr;

  for (const img of imageList) {
    const path = `${user.id}/${product.id}/${img.type}-${Date.now()}-${img.file.name}`;
    const { error: uploadErr } = await supabase.storage
      .from('product-images').upload(path, img.file);
    if (uploadErr) throw uploadErr;

    await supabase.from('product_images').insert({
      product_id: product.id, storage_path: path, image_type: img.type, uploaded_by: user.id
    });
  }

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
      try { details = await fnErr.context.text(); } catch { }
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
export const FIELD_LABELS: Record<string, string> = {
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
  const isImported = Boolean(scan.products?.is_imported);

  const fields: Record<string, string> = {};
  for (const d of declarations) {
    const label = FIELD_LABELS[d.field];
    if (!label) continue;
    fields[label] = d.present && d.value
      ? d.value
      : d.field === 'country_of_origin' && !isImported
        ? 'Not required (domestic product)'
        : 'Not detected';
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
    productGroup: scan.products?.product_group as string | undefined,
    versionLabel: scan.products?.version_label as string | undefined,
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

  // Notify every officer that a new complaint needs attention
  const { data: officers } = await supabase.from('profiles').select('id').eq('role', 'OFFICER');
  if (officers && officers.length > 0) {
    await supabase.from('notifications').insert(
      officers.map(o => ({
        user_id: o.id,
        title: 'New consumer complaint filed',
        message: `A grievance was filed for "${c.productName}" — ${c.issueType}.`,
        type: 'INFO',
        read: false
      }))
    );
  }

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
  const { data: complaint, error } = await supabase.from('complaints').update({
    status: 'UNDER_INVESTIGATION',
    assigned_officer: user?.id,
    investigated_at: new Date().toISOString()
  }).eq('id', complaintId).select('consumer_id, products(name)').single();
  if (error) throw error;

  if (complaint?.consumer_id) {
    await supabase.from('notifications').insert({
      user_id: complaint.consumer_id,
      title: 'Your grievance is under review',
      message: `A Legal Metrology Officer has started investigating your complaint about "${(complaint as any).products?.name ?? 'your product'}".`,
      type: 'INFO',
      read: false
    });
  }
}

// Officer closes a complaint with a verdict (-> RESOLVED, with CONFIRMED or REJECTED outcome)
export async function resolveComplaint(complaintId: string, outcome: 'CONFIRMED' | 'REJECTED', remarks: string) {
  const { data: complaint, error } = await supabase.from('complaints').update({
    status: 'RESOLVED',
    outcome,
    officer_remarks: remarks,
    resolved_at: new Date().toISOString()
  }).eq('id', complaintId).select('consumer_id, products(name)').single();
  if (error) throw error;

  if (complaint?.consumer_id) {
    await supabase.from('notifications').insert({
      user_id: complaint.consumer_id,
      title: outcome === 'CONFIRMED' ? 'Grievance accepted' : 'Grievance rejected',
      message: outcome === 'CONFIRMED'
        ? `Your complaint about "${(complaint as any).products?.name ?? 'your product'}" was confirmed. Officer's note: ${remarks}`
        : `Your complaint about "${(complaint as any).products?.name ?? 'your product'}" was reviewed and rejected. Officer's note: ${remarks}`,
      type: outcome === 'CONFIRMED' ? 'SUCCESS' : 'WARNING',
      read: false
    });
  }
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
    .select('storage_path, image_type')
    .eq('product_id', productId)
    .order('created_at', { ascending: true });
  if (!images || images.length === 0) return null;

  const image = images.find(i => i.image_type === 'FRONT') ?? images[0];

  const { data: signed } = await supabase.storage
    .from('product-images')
    .createSignedUrl(image.storage_path, 600);
  return signed?.signedUrl ?? null;
}

// Fetch ALL evidence images for a product (front/back/strip), each with its
// panel label, so the officer can review every angle that was scanned.
export async function getAllEvidenceImages(productId: string): Promise<{ url: string; type: string }[]> {
  const { data: images } = await supabase
    .from('product_images')
    .select('storage_path, image_type')
    .eq('product_id', productId)
    .order('created_at', { ascending: true });
  if (!images || images.length === 0) return [];

  const results: { url: string; type: string }[] = [];
  for (const image of images) {
    const { data: signed } = await supabase.storage
      .from('product-images')
      .createSignedUrl(image.storage_path, 600);
    if (signed?.signedUrl) {
      results.push({ url: signed.signedUrl, type: image.image_type ?? 'LABEL' });
    }
  }
  return results;
}

// ============================================================
// NOTIFICATIONS — real bell icon data
// ============================================================
export async function listNotifications() {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((n: any) => ({
    id: n.id as string,
    title: n.title as string,
    message: n.message as string,
    type: n.type as string,
    read: n.read as boolean,
    createdAt: new Date(n.created_at).toLocaleString('en-IN'),
  }));
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('read', false);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
  if (error) throw error;
}

// ============================================================
// SELLER BULK SCAN — scan several catalogue images in one batch
// ============================================================
export async function startBulkScan(
  items: { imageFile: File; productName: string }[],
  category: string,
  onProgress?: (done: number, total: number) => void
) {
  const results: { productName: string; success: boolean; status?: string; score?: number; error?: string; scanId?: string }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const { scanId, status, score } = await startScan({
        imageFile: item.imageFile,
        productName: item.productName,
        category,
        scanType: 'SELLER'
      });
      results.push({ productName: item.productName, success: true, status, score, scanId });
    } catch (e) {
      results.push({ productName: item.productName, success: false, error: (e as Error).message });
    }
    onProgress?.(i + 1, items.length);
  }

  return results;
}

// ============================================================
// MANUFACTURER ARTWORK VERSIONING
// ============================================================
export async function nextVersionLabel(productGroup: string): Promise<string> {
  const { data, error } = await supabase.from('products').select('version_label').eq('product_group', productGroup);
  if (error) throw error;
  const nums = (data ?? []).map(p => parseInt((p.version_label ?? 'v1').replace(/^v/i, ''), 10)).filter(n => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return 'v' + (max + 1);
}

// One row per distinct product line (product_group), showing its most
// recent artwork version's scan result — for the Products & Artwork page.
export async function listProductGroups() {
  const { data: allProducts, error } = await supabase
    .from('products')
    .select('id, name, category, manufacturer, product_group, version_label, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!allProducts || allProducts.length === 0) return [];

  const productIds = allProducts.map(p => p.id);
  const { data: scans } = await supabase
    .from('scans')
    .select('id, product_id, status, score, started_at, completed_at, violations(id)')
    .in('product_id', productIds)
    .not('status', 'in', '("UPLOADED","PROCESSING")')
    .order('started_at', { ascending: false });

  const latestScanByProduct = new Map<string, any>();
  for (const scan of scans ?? []) if (!latestScanByProduct.has(scan.product_id)) latestScanByProduct.set(scan.product_id, scan);

  const groups = new Map<string, { productGroup: string; name: string; category: string; manufacturer: string; versions: typeof allProducts }>();
  for (const p of allProducts) {
    const key = p.product_group ?? p.id;
    if (!groups.has(key)) groups.set(key, { productGroup: key, name: p.name, category: p.category, manufacturer: p.manufacturer, versions: [] as any });
    groups.get(key)!.versions.push(p);
  }

  return Array.from(groups.values()).map(g => {
    const latestVersion = g.versions[0];
    const latestScan = latestScanByProduct.get(latestVersion.id);
    const issues = latestScan ? (latestScan.violations ?? []).length : 0;
    const status = !latestScan ? 'NOT CHECKED'
      : latestScan.status === 'COMPLIANT' ? 'COMPLIANT'
        : latestScan.status === 'NON_COMPLIANT' ? 'ISSUES FOUND'
          : 'REVIEW REQUIRED';
    return {
      productGroup: g.productGroup,
      name: g.name,
      category: g.category,
      manufacturer: g.manufacturer,
      currentVersionLabel: latestVersion.version_label ?? 'v1',
      currentProductId: latestVersion.id,
      versionCount: g.versions.length,
      score: latestScan?.score ?? null,
      status,
      issues,
    };
  });
}

// All artwork versions for one product line, each with its latest scan.
export async function listVersionsForGroup(productGroup: string) {
  const { data: versionProducts, error } = await supabase
    .from('products')
    .select('id, name, version_label, created_at')
    .eq('product_group', productGroup)
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!versionProducts || versionProducts.length === 0) return [];

  const ids = versionProducts.map(p => p.id);
  const { data: scans } = await supabase
    .from('scans')
    .select('id, product_id, status, score, started_at, completed_at')
    .in('product_id', ids)
    .not('status', 'in', '("UPLOADED","PROCESSING")')
    .order('started_at', { ascending: false });

  const latestScanByProduct = new Map<string, any>();
  for (const scan of scans ?? []) if (!latestScanByProduct.has(scan.product_id)) latestScanByProduct.set(scan.product_id, scan);

  return versionProducts.map(p => {
    const scan = latestScanByProduct.get(p.id);
    return {
      productId: p.id,
      versionLabel: p.version_label ?? 'v1',
      scanId: scan?.id ?? null,
      score: scan?.score ?? null,
      status: scan?.status ?? 'NOT CHECKED',
      date: scan ? new Date(scan.completed_at ?? scan.started_at).toLocaleDateString('en-IN') : null,
    };
  });
}

// Full declaration+violation data for two specific artwork versions.
export async function compareVersions(productIdA: string, productIdB: string) {
  const fetchLatest = async (productId: string) => {
    const { data: scan } = await supabase
      .from('scans').select('*, products(*)').eq('product_id', productId)
      .not('status', 'in', '("UPLOADED","PROCESSING")')
      .order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (!scan) return null;
    const { data: violations } = await supabase.from('violations').select('*, rules(*)').eq('scan_id', scan.id);
    return { scan, violations: violations ?? [] };
  };
  const [a, b] = await Promise.all([fetchLatest(productIdA), fetchLatest(productIdB)]);
  return { a, b };
}

// Full comparison data: score, status, violations, declarations AND
// the front-panel evidence image for each of two artwork versions.
export async function compareVersionsDetailed(productIdA: string, productIdB: string) {
  const fetchFull = async (productId: string) => {
    const { data: scan } = await supabase
      .from('scans').select('*, products(*)').eq('product_id', productId)
      .not('status', 'in', '("UPLOADED","PROCESSING")')
      .order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (!scan) return null;
    const { data: violations } = await supabase.from('violations').select('*, rules(*)').eq('scan_id', scan.id);
    const { data: declarations } = await supabase.from('declarations').select('*').eq('scan_id', scan.id);
    const images = await getAllEvidenceImages(productId);
    const frontImage = images.find(i => i.type === 'FRONT') ?? images[0];
    return {
      scan,
      violations: violations ?? [],
      declarations: declarations ?? [],
      imageUrl: frontImage?.url ?? null,
    };
  };
  const [a, b] = await Promise.all([fetchFull(productIdA), fetchFull(productIdB)]);
  return { a, b };
}

// ============================================================
// MANUFACTURER CORRECTION RECOMMENDATIONS
// ============================================================
export async function listRecommendations(productGroup?: string) {
  let productQuery = supabase.from('products').select('id, name, product_group, version_label');
  if (productGroup) productQuery = productQuery.eq('product_group', productGroup);
  const { data: myProducts, error: prodErr } = await productQuery;
  if (prodErr) throw prodErr;
  if (!myProducts || myProducts.length === 0) return [];

  const productMap = new Map(myProducts.map(p => [p.id, p]));
  const productIds = myProducts.map(p => p.id);

  const { data: scans, error: scanErr } = await supabase
    .from('scans').select('id, product_id, status').in('product_id', productIds)
    .not('status', 'in', '("UPLOADED","PROCESSING")');
  if (scanErr) throw scanErr;
  if (!scans || scans.length === 0) return [];

  const scanMap = new Map(scans.map(s => [s.id, s]));
  const scanIds = scans.map(s => s.id);

  const { data: violations, error: violErr } = await supabase
    .from('violations').select('*, rules(*)').in('scan_id', scanIds);
  if (violErr) throw violErr;

  return (violations ?? [])
    .filter((v: any) => v.manufacturer_action !== 'CORRECTED')
    .map((v: any) => {
      const scan = scanMap.get(v.scan_id);
      const product = scan ? productMap.get(scan.product_id) : undefined;
      return {
        violationId: v.id as string,
        scanId: v.scan_id as string,
        productId: scan?.product_id as string,
        productName: product?.name ?? 'Unknown Product',
        productGroup: product?.product_group ?? '',
        versionLabel: product?.version_label ?? 'v1',
        issue: (v.rules?.rule_name ?? v.field) as string,
        ruleCode: (v.rules?.rule_code ?? '') as string,
        severity: (v.severity ?? 'MEDIUM') as string,
        currentValue: (v.detected_value ?? 'Not detected') as string,
        requiredValue: (v.expected_value ?? '') as string,
        recommendation: `Correct the "${v.rules?.rule_name ?? v.field}" declaration to meet statutory requirements.`,
        manufacturerAction: (v.manufacturer_action ?? null) as 'REVIEWED' | 'CORRECTED' | null,
      };
    });
}

export async function setManufacturerAction(violationId: string, action: 'REVIEWED' | 'CORRECTED') {
  const { error } = await supabase.from('violations').update({
    manufacturer_action: action,
    manufacturer_action_at: new Date().toISOString(),
  }).eq('id', violationId);
  if (error) throw error;
}

export async function listManufacturerChecks() {
  const { data: scans, error } = await supabase
    .from('scans')
    .select('id, product_id, status, score, started_at, completed_at, violations(id), products(name, version_label, product_group)')
    .not('status', 'in', '("UPLOADED","PROCESSING")')
    .order('started_at', { ascending: false });
  if (error) throw error;
  return (scans ?? []).map((s: any) => ({
    scanId: s.id,
    productId: s.product_id,
    productName: s.products?.name ?? 'Unknown Product',
    versionLabel: s.products?.version_label ?? 'v1',
    productGroup: s.products?.product_group ?? '',
    score: s.score ?? 0,
    status: s.status as string,
    issues: (s.violations ?? []).length,
    date: new Date(s.completed_at ?? s.started_at).toLocaleDateString('en-IN'),
  }));
}