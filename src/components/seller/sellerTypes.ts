export type SellerListing = {
  id: string;
  sellerId: string;
  organizationId: string | null;
  productName: string;
  brand: string;
  listingTitle: string;
  sku: string;
  category: string;
  marketplace: string;
  listingUrl: string;
  listedMrp: number | null;
  sellingPrice: number | null;
  netQuantity: string;
  manufacturerPackerImporter: string;
  countryOfOrigin: string;
  manufacturingPackingDate: string;
  bestBeforeUseBy: string;
  consumerCareDetails: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
};

export type SellerListingInput = Omit<
  SellerListing,
  'id' | 'sellerId' | 'organizationId' | 'status' | 'createdAt' | 'updatedAt'
>;

export type SellerAuditFieldStatus = 'PRESENT' | 'MISSING' | 'REVIEW_REQUIRED';

export type SellerListingAuditFinding = {
  field: string;
  value: string | null;
  status: SellerAuditFieldStatus;
  finding: string;
};

export type SellerListingAuditStatus = 'COMPLIANT' | 'REVIEW_REQUIRED' | 'NON_COMPLIANT';

export type SellerListingAudit = {
  id: string;
  listingId: string;
  sellerId: string;
  auditedAt: string;
  score: number;
  status: SellerListingAuditStatus;
  checkedDeclarations: Record<string, string | null>;
  findings: SellerListingAuditFinding[];
};

export type PackageComparisonStatus = 'MATCH' | 'MISMATCH' | 'NOT_DETECTED' | 'REVIEW';

export type SellerComparisonField = {
  field: string;
  onlineValue: string | null;
  packageValue: string | null;
  status: PackageComparisonStatus;
  finding: string;
  evidenceText: string | null;
};

export type SellerPackageEvidence = {
  panel: 'PRINCIPAL' | 'BACK' | 'SIDE' | 'ADDITIONAL';
  storagePath: string;
  fileName: string;
};

export type SellerPackageListingComparison = {
  id: string;
  listingId: string;
  sellerId: string;
  comparedAt: string;
  score: number;
  status: 'MATCH' | 'MISMATCH' | 'REVIEW';
  fields: SellerComparisonField[];
  evidence: SellerPackageEvidence[];
  scanId: string;
};
