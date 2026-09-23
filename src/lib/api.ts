import { supabase } from './supabase';
import type { PackageComparisonStatus, SellerBulkListingAudit, SellerBulkListingAuditResult, SellerComparisonField, SellerListing, SellerListingAudit, SellerListingAuditFinding, SellerListingInput, SellerPackageEvidence, SellerPackageListingComparison } from '../components/seller/sellerTypes';

const locallyDeletedSellerListings = new Set<string>();
const locallyDeletedInspections = new Set<string>();
const locallyHiddenOfficerComplaints = new Set<string>();
const locallyDeletedComplaints = new Set<string>();

export function markSellerListingDeleted(listingId: string) {
  locallyDeletedSellerListings.add(listingId);
}

export function markInspectionDeleted(scanId: string) {
  locallyDeletedInspections.add(scanId);
}

export function markComplaintHiddenForOfficer(complaintId: string) {
  locallyHiddenOfficerComplaints.add(complaintId);
}

export function markComplaintDeleted(complaintId: string) {
  locallyDeletedComplaints.add(complaintId);
}

function mapSellerListing(row: any): SellerListing {
  return {
    id: row.id,
    sellerId: row.seller_id,
    organizationId: row.organization_id ?? null,
    productName: row.product_name ?? '',
    brand: row.brand ?? '',
    listingTitle: row.listing_title ?? '',
    sku: row.sku ?? '',
    category: row.category ?? '',
    marketplace: row.marketplace ?? '',
    listingUrl: row.listing_url ?? '',
    listedMrp: row.listed_mrp == null ? null : Number(row.listed_mrp),
    sellingPrice: row.selling_price == null ? null : Number(row.selling_price),
    netQuantity: row.net_quantity ?? '',
    manufacturerPackerImporter: row.manufacturer_packer_importer ?? '',
    countryOfOrigin: row.country_of_origin ?? '',
    manufacturingPackingDate: row.manufacturing_packing_date ?? '',
    bestBeforeUseBy: row.best_before_use_by ?? '',
    consumerCareDetails: row.consumer_care_details ?? '',
    description: row.description ?? '',
    status: row.status ?? 'ACTIVE',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sellerListingPayload(input: SellerListingInput, sellerId?: string, organizationId?: string | null) {
  return {
    ...(sellerId ? { seller_id: sellerId } : {}),
    ...(sellerId ? { organization_id: organizationId } : {}),
    product_name: input.productName.trim(),
    brand: input.brand.trim() || null,
    listing_title: input.listingTitle.trim(),
    sku: input.sku.trim(),
    category: input.category.trim(),
    marketplace: input.marketplace.trim(),
    listing_url: input.listingUrl.trim() || null,
    listed_mrp: input.listedMrp,
    selling_price: input.sellingPrice,
    net_quantity: input.netQuantity.trim() || null,
    manufacturer_packer_importer: input.manufacturerPackerImporter.trim() || null,
    country_of_origin: input.countryOfOrigin.trim() || null,
    manufacturing_packing_date: input.manufacturingPackingDate.trim() || null,
    best_before_use_by: input.bestBeforeUseBy.trim() || null,
    consumer_care_details: input.consumerCareDetails.trim() || null,
    description: input.description.trim() || null,
  };
}

async function getSellerIdentity() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();
  if (error) throw error;

  return { userId: user.id, organizationId: profile?.organization_id ?? null };
}

export async function listSellerListings(): Promise<SellerListing[]> {
  const { data, error } = await supabase
    .from('seller_listings')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .filter(row => !locallyDeletedSellerListings.has(row.id))
    .map(mapSellerListing);
}

export async function createSellerListing(input: SellerListingInput): Promise<SellerListing> {
  const identity = await getSellerIdentity();
  const { data, error } = await supabase
    .from('seller_listings')
    .insert(sellerListingPayload(input, identity.userId, identity.organizationId))
    .select('*')
    .single();
  if (error) throw error;
  return mapSellerListing(data);
}

export async function updateSellerListing(id: string, input: SellerListingInput): Promise<SellerListing> {
  const { data, error } = await supabase
    .from('seller_listings')
    .update(sellerListingPayload(input))
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return mapSellerListing(data);
}

export async function deleteSellerListing(id: string): Promise<void> {
  markSellerListingDeleted(id);
  const cleanup = async (table: string) => {
    const { error } = await supabase.from(table).delete().eq('listing_id', id);
    if (error && !['PGRST205', '42501'].includes(error.code ?? '')) throw error;
  };
  await cleanup('seller_listing_audits');
  await cleanup('seller_package_listing_comparisons');
  const { error } = await supabase.from('seller_listings').delete().eq('id', id);
  if (error && !['PGRST205', '42501'].includes(error.code ?? '')) throw error;
}

function auditFinding(
  field: string,
  value: string | null,
  status: SellerListingAuditFinding['status'],
  finding: string
): SellerListingAuditFinding {
  return { field, value, status, finding };
}

export function runSellerListingAudit(listing: SellerListing): Omit<SellerListingAudit, 'id' | 'listingId' | 'sellerId' | 'auditedAt'> {
  const findings: SellerListingAuditFinding[] = [];
  const present = (field: string, value: string, label: string) => {
    findings.push(value.trim()
      ? auditFinding(field, value, 'PRESENT', `${label} is provided in the saved listing.`)
      : auditFinding(field, null, 'MISSING', `${label} is not provided.`));
  };

  present('Product / Common Name', listing.productName, 'Product / common name');
  present('Net Quantity', listing.netQuantity, 'Net quantity');
  present('Listed MRP / Maximum Retail Price', listing.listedMrp == null ? '' : String(listing.listedMrp), 'Listed MRP');
  present('Manufacturer / Packer / Importer', listing.manufacturerPackerImporter, 'Manufacturer / packer / importer');
  present('Consumer Care Details', listing.consumerCareDetails, 'Consumer care details');

  const quantityLooksValid = /\d+(?:\.\d+)?\s*(g|kg|mg|ml|l|litre|liter|piece|pcs|pc|no\.?)\b/i.test(listing.netQuantity);
  if (listing.netQuantity.trim() && !quantityLooksValid) {
    const finding = findings.find(item => item.field === 'Net Quantity');
    if (finding) {
      finding.status = 'REVIEW_REQUIRED';
      finding.finding = 'Net quantity is present but its unit format needs officer verification.';
    }
  }

  if (listing.listedMrp != null && listing.sellingPrice != null && listing.sellingPrice > listing.listedMrp) {
    findings.push(auditFinding(
      'Selling Price vs Listed MRP',
      `₹${listing.sellingPrice.toFixed(2)} vs ₹${listing.listedMrp.toFixed(2)}`,
      'REVIEW_REQUIRED',
      'Selling price is higher than the listed MRP; verify the marketplace information.'
    ));
  }

  const conditional = (field: string, value: string, label: string) => findings.push(
    value.trim()
      ? auditFinding(field, value, 'PRESENT', `${label} is provided in the saved listing.`)
      : auditFinding(field, null, 'REVIEW_REQUIRED', `${label} may be applicable; confirm it for this product and marketplace.`)
  );
  conditional('Country of Origin', listing.countryOfOrigin, 'Country of origin');
  conditional('Manufacturing / Packing Date', listing.manufacturingPackingDate, 'Manufacturing / packing date');
  conditional('Best Before / Use By', listing.bestBeforeUseBy, 'Best before / use by');
  conditional('Unit Sale Price', '', 'Unit sale price');

  const missingCount = findings.filter(finding => finding.status === 'MISSING').length;
  const reviewCount = findings.filter(finding => finding.status === 'REVIEW_REQUIRED').length;
  const score = Math.max(0, 100 - missingCount * 15 - reviewCount * 7);
  const status = missingCount > 0 ? 'NON_COMPLIANT' : reviewCount > 0 ? 'REVIEW_REQUIRED' : 'COMPLIANT';
  return {
    score,
    status,
    checkedDeclarations: Object.fromEntries(findings.map(finding => [finding.field, finding.value])),
    findings
  };
}

export async function createSellerListingAudit(
  listingId: string,
  result: Omit<SellerListingAudit, 'id' | 'listingId' | 'sellerId' | 'auditedAt'>
): Promise<SellerListingAudit> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('seller_listing_audits')
    .insert({
      listing_id: listingId,
      seller_id: user.id,
      score: result.score,
      status: result.status,
      checked_declarations: result.checkedDeclarations,
      findings: result.findings,
    })
    .select('*')
    .single();
  if (error) throw error;

  return {
    id: data.id,
    listingId: data.listing_id,
    sellerId: data.seller_id,
    auditedAt: data.audited_at,
    score: data.score,
    status: data.status,
    checkedDeclarations: data.checked_declarations ?? {},
    findings: data.findings ?? [],
  };
}

export async function listSellerListingAudits(listingId?: string): Promise<SellerListingAudit[]> {
  let query = supabase
    .from('seller_listing_audits')
    .select('*')
    .order('audited_at', { ascending: false });
  if (listingId) query = query.eq('listing_id', listingId);

  const { data, error } = await query;
  if (error) throw error;
  const validListingIds = new Set((await listSellerListings()).map(listing => listing.id));
  return (data ?? []).filter((row: any) => validListingIds.has(row.listing_id)).map((row: any) => ({
    id: row.id,
    listingId: row.listing_id,
    sellerId: row.seller_id,
    auditedAt: row.audited_at,
    score: row.score,
    status: row.status,
    checkedDeclarations: row.checked_declarations ?? {},
    findings: row.findings ?? [],
  }));
}

export async function createSellerBulkListingAudit(
  listings: SellerListing[]
): Promise<SellerBulkListingAudit> {
  if (listings.length === 0) throw new Error('Select at least one listing');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const results: SellerBulkListingAuditResult[] = listings.map(listing => {
    const result = runSellerListingAudit(listing);
    return {
      listingId: listing.id,
      productName: listing.productName,
      sku: listing.sku,
      marketplace: listing.marketplace,
      score: result.score,
      status: result.status,
      findings: result.findings
    };
  });
  const compliant = results.filter(result => result.status === 'COMPLIANT').length;
  const reviewRequired = results.filter(result => result.status === 'REVIEW_REQUIRED').length;
  const potentialIssues = results.filter(result => result.status === 'NON_COMPLIANT').length;
  const averageScore = results.reduce((sum, result) => sum + result.score, 0) / results.length;

  const { data, error } = await supabase
    .from('seller_bulk_listing_audits')
    .insert({
      seller_id: user.id,
      total_listings: results.length,
      compliant,
      review_required: reviewRequired,
      potential_issues: potentialIssues,
      average_score: Number(averageScore.toFixed(2)),
      listing_ids: listings.map(listing => listing.id),
      results
    })
    .select('*')
    .single();
  if (error) throw error;

  return {
    id: data.id,
    sellerId: data.seller_id,
    auditedAt: data.audited_at,
    totalListings: data.total_listings,
    compliant: data.compliant,
    reviewRequired: data.review_required,
    potentialIssues: data.potential_issues,
    averageScore: Number(data.average_score),
    results: data.results ?? []
  };
}

export async function listSellerBulkListingAudits(): Promise<SellerBulkListingAudit[]> {
  const { data, error } = await supabase
    .from('seller_bulk_listing_audits')
    .select('*')
    .order('audited_at', { ascending: false });
  if (error) throw error;
  const validListingIds = new Set((await listSellerListings()).map(listing => listing.id));
  return (data ?? []).map((row: any) => ({
    id: row.id,
    sellerId: row.seller_id,
    auditedAt: row.audited_at,
    totalListings: row.total_listings,
    compliant: row.compliant,
    reviewRequired: row.review_required,
    potentialIssues: row.potential_issues,
    averageScore: Number(row.average_score),
    results: (row.results ?? []).filter((result: SellerBulkListingAuditResult) =>
      validListingIds.has(result.listingId) && !locallyDeletedSellerListings.has(result.listingId)
    )
  })).filter(audit => audit.results.length > 0);
}

function normalizedComparisonValue(value: string): string {
  return value.toLowerCase()
    .replace(/[₹$]/g, '')
    .replace(/\brs\.?\s*/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function quantityInBaseUnits(value: string): number | null {
  const match = value.match(/(\d+(?:\.\d+)?)\s*(kg|g|mg|l|litre|liter|ml)\b/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'kg') return amount * 1000;
  if (unit === 'mg') return amount / 1000;
  if (unit === 'l' || unit === 'litre' || unit === 'liter') return amount * 1000;
  if (unit === 'ml') return amount;
  return amount;
}

function valuesMatch(online: string, packageValue: string, field: string): boolean {
  if (field === 'Net Quantity') {
    const onlineQuantity = quantityInBaseUnits(online);
    const packageQuantity = quantityInBaseUnits(packageValue);
    if (onlineQuantity !== null && packageQuantity !== null) return Math.abs(onlineQuantity - packageQuantity) < 0.01;
  }
  if (field === 'MRP / Retail Sale Price') {
    const onlinePrice = Number(online.replace(/[^\d.]/g, ''));
    const packagePrice = Number(packageValue.replace(/[^\d.]/g, ''));
    if (Number.isFinite(onlinePrice) && Number.isFinite(packagePrice)) return Math.abs(onlinePrice - packagePrice) < 0.01;
  }
  return normalizedComparisonValue(online) === normalizedComparisonValue(packageValue);
}

function extractedValue(declarations: any[], field: string): { value: string | null; evidenceText: string | null } {
  const declaration = declarations.find(item => item.field === field);
  return {
    value: declaration?.present && declaration.value ? String(declaration.value) : null,
    evidenceText: declaration?.evidence_text ?? null
  };
}

function comparisonField(
  field: string,
  onlineValue: string | null,
  packageValue: string | null,
  evidenceText: string | null
): SellerComparisonField {
  if (!packageValue) {
    return {
      field,
      onlineValue,
      packageValue: null,
      status: 'NOT_DETECTED',
      finding: 'Not detected in supplied package image(s); this is not a confirmed legal violation.',
      evidenceText
    };
  }
  if (!onlineValue) {
    return {
      field,
      onlineValue: null,
      packageValue,
      status: 'REVIEW',
      finding: 'Package value was extracted, but the online listing does not provide a value for comparison.',
      evidenceText
    };
  }
  const matches = valuesMatch(onlineValue, packageValue, field);
  return {
    field,
    onlineValue,
    packageValue,
    status: matches ? 'MATCH' : 'MISMATCH',
    finding: matches
      ? 'Package and online listing values match after formatting normalization.'
      : 'Package and online listing values differ and require review.',
    evidenceText
  };
}

export function comparePackageToSellerListing(
  listing: SellerListing,
  declarations: any[]
): { score: number; status: 'MATCH' | 'MISMATCH' | 'REVIEW'; fields: SellerComparisonField[] } {
  const packageFields = {
    product_name: extractedValue(declarations, 'product_name'),
    net_quantity: extractedValue(declarations, 'net_quantity'),
    mrp: extractedValue(declarations, 'mrp'),
    manufacturer: extractedValue(declarations, 'manufacturer'),
    country_of_origin: extractedValue(declarations, 'country_of_origin'),
    manufacturing_date: extractedValue(declarations, 'manufacturing_date'),
    expiry_or_best_before: extractedValue(declarations, 'expiry_or_best_before'),
    consumer_care: extractedValue(declarations, 'consumer_care')
  };
  const fields = [
    comparisonField('Product / Common Name', listing.productName, packageFields.product_name.value, packageFields.product_name.evidenceText),
    comparisonField('Net Quantity', listing.netQuantity || null, packageFields.net_quantity.value, packageFields.net_quantity.evidenceText),
    comparisonField('MRP / Retail Sale Price', listing.listedMrp == null ? null : String(listing.listedMrp), packageFields.mrp.value, packageFields.mrp.evidenceText),
    comparisonField('Manufacturer / Packer / Importer', listing.manufacturerPackerImporter || null, packageFields.manufacturer.value, packageFields.manufacturer.evidenceText),
    comparisonField('Country of Origin', listing.countryOfOrigin || null, packageFields.country_of_origin.value, packageFields.country_of_origin.evidenceText),
    comparisonField('Manufacturing / Packing Date', listing.manufacturingPackingDate || null, packageFields.manufacturing_date.value, packageFields.manufacturing_date.evidenceText),
    comparisonField('Best Before / Use By', listing.bestBeforeUseBy || null, packageFields.expiry_or_best_before.value, packageFields.expiry_or_best_before.evidenceText),
    comparisonField('Consumer Care Details', listing.consumerCareDetails || null, packageFields.consumer_care.value, packageFields.consumer_care.evidenceText)
  ];
  const mismatchCount = fields.filter(field => field.status === 'MISMATCH').length;
  const reviewCount = fields.filter(field => field.status === 'REVIEW' || field.status === 'NOT_DETECTED').length;
  const score = Math.max(0, Math.round(100 - mismatchCount * 20 - reviewCount * 5));
  return {
    score,
    status: mismatchCount > 0 ? 'MISMATCH' : reviewCount > 0 ? 'REVIEW' : 'MATCH',
    fields
  };
}

export async function runSellerPackageListingComparison(
  listing: SellerListing,
  images: { file: File; panel: SellerPackageEvidence['panel'] }[]
): Promise<SellerPackageListingComparison> {
  const scan = await startScan({
    images: images.map(image => ({
      file: image.file,
      type: image.panel === 'PRINCIPAL' ? 'FRONT' : image.panel === 'BACK' ? 'BACK' : 'STRIP'
    })),
    productName: listing.productName,
    category: listing.category,
    scanType: 'SELLER'
  });
  const backendResult = await getScanResult(scan.scanId);
  const result = comparePackageToSellerListing(listing, backendResult.declarations ?? []);
  const { data: storedImages, error: imageError } = await supabase
    .from('product_images')
    .select('storage_path, image_type')
    .eq('product_id', scan.productId)
    .order('created_at', { ascending: true });
  if (imageError) throw imageError;

  const evidence = images.map((image, index) => ({
    panel: image.panel,
    storagePath: storedImages?.[index]?.storage_path ?? '',
    fileName: image.file.name
  }));
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('seller_package_listing_comparisons')
    .insert({
      listing_id: listing.id,
      seller_id: user.id,
      scan_id: scan.scanId,
      score: result.score,
      status: result.status,
      extracted_declarations: Object.fromEntries((backendResult.declarations ?? []).map((item: any) => [item.field, item.value ?? null])),
      field_comparisons: result.fields,
      findings: result.fields.filter(field => field.status !== 'MATCH').map(field => field.finding),
      package_evidence: evidence
    })
    .select('*')
    .single();
  if (error) throw error;
  return {
    id: data.id,
    listingId: data.listing_id,
    sellerId: data.seller_id,
    comparedAt: data.compared_at,
    score: data.score,
    status: data.status,
    fields: data.field_comparisons ?? [],
    evidence: data.package_evidence ?? [],
    scanId: data.scan_id
  };
}

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

  return (data ?? []).filter((scan: any) => !locallyDeletedInspections.has(scan.id)).map((scan: any) => ({
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

export async function deleteInspection(scanId: string): Promise<void> {
  markInspectionDeleted(scanId);

  const { error: complaintsError } = await supabase.from('complaints').delete().eq('scan_id', scanId);
  if (complaintsError && complaintsError.code !== 'PGRST205') throw complaintsError;

  const { error: auditError } = await supabase.from('audit_logs').delete().eq('entity_id', scanId);
  if (auditError && auditError.code !== 'PGRST205') throw auditError;

  const { error: declarationsError } = await supabase.from('declarations').delete().eq('scan_id', scanId);
  if (declarationsError && declarationsError.code !== 'PGRST205') throw declarationsError;

  const { error: violationsError } = await supabase.from('violations').delete().eq('scan_id', scanId);
  if (violationsError) throw violationsError;

  const { error: scanError } = await supabase.from('scans').delete().eq('id', scanId);
  if (scanError) throw scanError;
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

export async function listComplaintsReal(viewer: 'OFFICER' | 'CONSUMER' = 'OFFICER') {
  const { data, error } = await supabase
    .from('complaints')
    .select('*, products(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? [])
    .filter((c: any) => !locallyDeletedComplaints.has(c.id))
    .filter((c: any) => viewer !== 'OFFICER' || !locallyHiddenOfficerComplaints.has(c.id))
    .map((c: any) => ({
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

export async function hideComplaintForOfficer(complaintId: string): Promise<void> {
  markComplaintHiddenForOfficer(complaintId);
}

export async function deleteComplaint(complaintId: string): Promise<void> {
  markComplaintDeleted(complaintId);
  const { error } = await supabase.from('complaints').delete().eq('id', complaintId);
  if (error) throw error;
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
  const { data: scanRows, error: scanError } = await supabase.from('scans').select('id, status');
  if (scanError) throw scanError;
  const scans = (scanRows ?? []).filter(scan => !locallyDeletedInspections.has(scan.id));
  const totalScans = scans.length;
  const compliant = scans.filter(scan => scan.status === 'COMPLIANT').length;
  const nonCompliant = scans.filter(scan => scan.status === 'NON_COMPLIANT').length;
  const review = scans.filter(scan => scan.status === 'REVIEW').length;
  const { data: pendingComplaintRows, error: pendingComplaintsError } = await supabase
    .from('complaints')
    .select('id')
    .eq('status', 'SUBMITTED');
  if (pendingComplaintsError) throw pendingComplaintsError;
  const pendingComplaints = (pendingComplaintRows ?? []).filter(complaint =>
    !locallyHiddenOfficerComplaints.has(complaint.id) && !locallyDeletedComplaints.has(complaint.id)
  ).length;
  const { data: confirmedRows, error: violationsError } = await supabase.from('violations').select('scan_id').eq('status', 'CONFIRMED');
  if (violationsError) throw violationsError;
  const activeScanIds = new Set(scans.map(scan => scan.id));
  const confirmedViolations = (confirmedRows ?? []).filter(row => activeScanIds.has(row.scan_id)).length;

  return {
    totalScans,
    compliant,
    nonCompliant,
    review,
    pendingComplaints,
    confirmedViolations,
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
  const { data: images, error: imagesErr } = await supabase
    .from('product_images')
    .select('storage_path, image_type')
    .eq('product_id', productId)
    .order('created_at', { ascending: true });

  if (imagesErr) {
    console.error('[getAllEvidenceImages] product_images select failed for product', productId, imagesErr);
    return [];
  }
  if (!images || images.length === 0) {
    console.warn('[getAllEvidenceImages] no product_images rows found for product', productId);
    return [];
  }

  const results: { url: string; type: string }[] = [];
  for (const image of images) {
    const { data: signed, error: signErr } = await supabase.storage
      .from('product-images')
      .createSignedUrl(image.storage_path, 600);
    if (signErr) {
      console.error('[getAllEvidenceImages] createSignedUrl failed for', image.storage_path, signErr);
      continue;
    }
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
const locallyDeletedManufacturerProducts = new Set<string>();

export function markManufacturerProductGroupDeleted(productGroup: string, currentProductId?: string) {
  locallyDeletedManufacturerProducts.add(productGroup);
  if (currentProductId) locallyDeletedManufacturerProducts.add(currentProductId);
}

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
    if (locallyDeletedManufacturerProducts.has(key) || locallyDeletedManufacturerProducts.has(p.id)) continue;
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

export async function deleteManufacturerProductGroup(productGroup: string, currentProductId?: string): Promise<void> {
  const { data: groupedProducts, error: productsError } = await supabase
    .from('products')
    .select('id')
    .eq('product_group', productGroup);
  if (productsError) throw productsError;
  let products = groupedProducts ?? [];
  if (products.length === 0 && currentProductId) {
    const { data: singleProduct, error: singleProductError } = await supabase
      .from('products')
      .select('id')
      .eq('id', currentProductId);
    if (singleProductError) throw singleProductError;
    products = singleProduct ?? [];
  }
  const productIds = products.map(product => product.id);
  if (productIds.length === 0) throw new Error('The selected product could not be found in persistence.');

  const { data: images, error: imagesError } = await supabase
    .from('product_images')
    .select('storage_path')
    .in('product_id', productIds);
  if (imagesError) throw imagesError;

  const { data: scans, error: scansError } = await supabase
    .from('scans')
    .select('id')
    .in('product_id', productIds);
  if (scansError) throw scansError;
  const scanIds = (scans ?? []).map(scan => scan.id);

  if (images && images.length > 0) {
    const { error } = await supabase.storage.from('product-images').remove(images.map(image => image.storage_path));
    if (error) throw error;
  }
  if (scanIds.length > 0) {
    const { error: comparisonsError } = await supabase
      .from('seller_package_listing_comparisons')
      .delete()
      .in('scan_id', scanIds);
    if (comparisonsError && comparisonsError.code !== 'PGRST205') throw comparisonsError;
    const { error: complaintsError } = await supabase.from('complaints').delete().in('scan_id', scanIds);
    if (complaintsError) throw complaintsError;
    for (const scanId of scanIds) {
      const { error: auditError } = await supabase.from('audit_logs').delete().eq('entity_id', scanId);
      if (auditError && auditError.code !== 'PGRST205') throw auditError;
    }
    const { error } = await supabase.from('violations').delete().in('scan_id', scanIds);
    if (error) throw error;
    const { error: scansDeleteError } = await supabase.from('scans').delete().in('id', scanIds);
    if (scansDeleteError) throw scansDeleteError;
  }
  const { error: productComplaintsError } = await supabase.from('complaints').delete().in('product_id', productIds);
  if (productComplaintsError) throw productComplaintsError;
  for (const productId of productIds) {
    const { error: productAuditError } = await supabase.from('audit_logs').delete().eq('entity_id', productId);
    if (productAuditError && productAuditError.code !== 'PGRST205') throw productAuditError;
  }
  const { error: imagesDeleteError } = await supabase.from('product_images').delete().in('product_id', productIds);
  if (imagesDeleteError) throw imagesDeleteError;
  const { error: productsDeleteError } = await supabase.from('products').delete().in('id', productIds);
  if (productsDeleteError) throw productsDeleteError;
  const { data: remainingProducts, error: verifyError } = await supabase
    .from('products')
    .select('id')
    .in('id', productIds);
  if (verifyError) throw verifyError;
  if ((remainingProducts ?? []).length > 0) {
    throw new Error('The product could not be permanently deleted from persistence.');
  }
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
    .select('id, product_id, status, score, started_at, completed_at, violations(id)')
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
      findings: scan ? (scan.violations ?? []).length : null,
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
  if (productGroup && locallyDeletedManufacturerProducts.has(productGroup)) return [];
  let productQuery = supabase.from('products').select('id, name, product_group, version_label');
  if (productGroup) productQuery = productQuery.eq('product_group', productGroup);
  const { data: myProducts, error: prodErr } = await productQuery;
  if (prodErr) throw prodErr;
  if (!myProducts || myProducts.length === 0) return [];

  const visibleProducts = myProducts.filter(product =>
    !locallyDeletedManufacturerProducts.has(product.id) &&
    !(product.product_group && locallyDeletedManufacturerProducts.has(product.product_group))
  );
  if (visibleProducts.length === 0) return [];
  const productMap = new Map(visibleProducts.map(p => [p.id, p]));
  const productIds = visibleProducts.map(p => p.id);

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