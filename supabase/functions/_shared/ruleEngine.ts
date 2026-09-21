// ============================================================
// Deterministic Legal Metrology Rule Engine
// NO LLM involved here — pure rule evaluation over structured
// declarations that Gemini already extracted.
// ============================================================

export type Declaration = {
  field: string;
  value: string | null;
  present: boolean;
  confidence: number;
};

export type Rule = {
  id: string;
  rule_code: string;
  rule_name: string;
  field: string;
  validation_type: 'REQUIRED_FIELD' | 'FORMAT_MATCH' | 'TEXT_PRESENT' | 'MIN_FONT_SIZE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  source_url: string | null;
};

export type Violation = {
  rule_id: string;
  rule_code: string;
  field: string;
  detected_value: string;
  expected_value: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'POTENTIAL';
  explanation: string;
};

function findDeclaration(declarations: Declaration[], field: string): Declaration | undefined {
  return declarations.find(d => d.field === field);
}

// Net quantity specific check: catches "1 Litre (900 mL)" style contradictions,
// mirroring the exact scenario your prototype hardcodes for the cooking-oil demo.
function checkNetQuantityConsistency(value: string): { ok: boolean; explanation?: string } {
  const litreMatch = value.match(/(\d+(?:\.\d+)?)\s*(l|litre|liter)/i);
  const mlMatch = value.match(/\(?\s*(\d+(?:\.\d+)?)\s*ml\s*\)?/i);
  if (litreMatch && mlMatch) {
    const litres = parseFloat(litreMatch[1]);
    const ml = parseFloat(mlMatch[1]);
    const expectedMl = litres * 1000;
    if (Math.abs(expectedMl - ml) > 0.01) {
      return {
        ok: false,
        explanation: `Contradictory volume declared: ${litres} Litre mathematically equals ${expectedMl} mL, not ${ml} mL. This misleads the buyer on true packaged content.`
      };
    }
  }
  return { ok: true };
}

// ============================================================
// FORMAT / COMPLETENESS VALIDATORS
// These run on fields that ARE present, to catch declarations that exist
// but are invalid or incomplete — e.g. an address with no PIN code, a
// consumer care line with no real phone/email, an unparseable MRP.
// ============================================================

function hasPincode(address: string): boolean {
  // Indian PIN codes are exactly 6 digits, not part of a longer number run
  return /(?<!\d)\d{6}(?!\d)/.test(address);
}

function hasValidContact(text: string): boolean {
  const phonePattern = /(\+?91[-\s]?)?(1800[-\s]?\d{2,3}[-\s]?\d{3,4}|[6-9]\d{9})/;
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  return phonePattern.test(text) || emailPattern.test(text);
}

function hasValidMrp(text: string): boolean {
  // Must contain a real numeric amount, not just currency symbols or stray text
  return /\d+(\.\d{1,2})?/.test(text);
}

function hasValidDateFormat(text: string): boolean {
  const numericPattern = /\b(0?[1-9]|1[0-2])[\/\-\s.](\d{2}|\d{4})\b/; // MM/YYYY, MM-YY etc
  const monthNamePattern = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s.,-]+\d{2,4}\b/i;
  return numericPattern.test(text) || monthNamePattern.test(text);
}

function hasValidQuantityFormat(text: string): boolean {
  // A number followed by a recognized unit
  return /\d+(\.\d+)?\s*(g|kg|mg|ml|l|litre|liter|gm|gram|grams|kilogram|piece|pcs|pc|no\.?)\b/i.test(text);
}

const FIELD_VALIDATORS: Record<string, { check: (v: string) => boolean; expected: string; issue: string }> = {
  manufacturer: {
    check: hasPincode,
    expected: 'Full address including a 6-digit PIN code',
    issue: 'a 6-digit PIN code'
  },
  consumer_care: {
    check: hasValidContact,
    expected: 'A valid phone number or email address',
    issue: 'a recognizable phone number or email address'
  },
  mrp: {
    check: hasValidMrp,
    expected: 'A clear numeric price (e.g. ₹120)',
    issue: 'a clear, readable numeric price'
  },
  manufacturing_date: {
    check: hasValidDateFormat,
    expected: 'A clear month and year (e.g. 09/2026 or Sep 2026)',
    issue: 'a clear month/year format'
  },
  net_quantity: {
    check: hasValidQuantityFormat,
    expected: 'A number followed by a standard unit (e.g. 500 g, 1 L)',
    issue: 'a number with a recognized unit of measure'
  },
};

export function runRuleEngine(declarations: Declaration[], rules: Rule[], isImported: boolean): Violation[] {
  const violations: Violation[] = [];

  for (const rule of rules) {
    // Country of Origin (Rule 6(1)(aa)) is only legally required for imported
    // products — skip it entirely for domestic products.
    if (rule.field === 'country_of_origin' && !isImported) continue;

    const decl = findDeclaration(declarations, rule.field);

    if (rule.validation_type === 'REQUIRED_FIELD') {
      if (!decl || !decl.present || !decl.value) {
        violations.push({
          rule_id: rule.id,
          rule_code: rule.rule_code,
          field: rule.field,
          detected_value: 'Not detected on display panel',
          expected_value: `${rule.rule_name} must be clearly declared`,
          severity: rule.severity,
          status: 'POTENTIAL',
          explanation: `The package lacks a visible, unambiguous declaration for "${rule.rule_name}".`
        });
        continue;
      }

      // Field IS present — check it's actually valid/complete, not just non-empty
      const validator = FIELD_VALIDATORS[rule.field];
      if (validator && !validator.check(decl.value)) {
        violations.push({
          rule_id: rule.id,
          rule_code: rule.rule_code,
          field: rule.field,
          detected_value: decl.value,
          expected_value: validator.expected,
          severity: 'LOW',
          status: 'POTENTIAL',
          explanation: `"${decl.value}" is printed for ${rule.rule_name}, but it does not appear to include ${validator.issue}.`
        });
      }
      continue;
    }

    if (rule.validation_type === 'FORMAT_MATCH' && rule.field === 'net_quantity') {
      if (decl && decl.present && decl.value) {
        const check = checkNetQuantityConsistency(decl.value);
        if (!check.ok) {
          violations.push({
            rule_id: rule.id,
            rule_code: rule.rule_code,
            field: rule.field,
            detected_value: decl.value,
            expected_value: 'Consistent SI unit (e.g. 1 L = 1000 mL)',
            severity: rule.severity,
            status: 'POTENTIAL',
            explanation: check.explanation!
          });
        }
      }
      continue;
    }

    // TEXT_PRESENT / MIN_FONT_SIZE placeholders — extend when you wire in
    // OpenCV bounding-box font-height analysis (Day 7-8 per the plan doc).
  }

  return violations;
}

export function computeScore(totalRulesChecked: number, violations: Violation[]): number {
  if (totalRulesChecked === 0) return 100;
  const weight = { HIGH: 20, MEDIUM: 10, LOW: 5 };
  const penalty = violations.reduce((sum, v) => sum + weight[v.severity], 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function statusFromViolations(violations: Violation[]): 'COMPLIANT' | 'NON_COMPLIANT' {
  return violations.length === 0 ? 'COMPLIANT' : 'NON_COMPLIANT';
}
