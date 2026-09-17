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

// When a manufacturer/packer/importer field is missing, check whether the
// package instead declared only a "marketed_by" entity — legally distinct
// under the Legal Metrology (Packaged Commodities) Rules — and produce a
// more precise explanation than a generic "not found".
function explainMissingResponsibleEntity(rule: Rule, declarations: Declaration[]): string {
  const generic = `The package lacks a visible, unambiguous declaration for "${rule.rule_name}".`;

  if (rule.field !== 'manufacturer' && rule.field !== 'packer' && rule.field !== 'importer') {
    return generic;
  }

  const marketedBy = findDeclaration(declarations, 'marketed_by');
  if (marketedBy?.present && marketedBy.value) {
    return `The package declares "${marketedBy.value}" as the marketer/distributor, but does not separately identify the actual ${rule.field}. Under the Legal Metrology (Packaged Commodities) Rules, a "Marketed by" / "Distributed by" declaration alone does not satisfy the requirement to identify the manufacturer, packer, or importer — these are legally distinct roles.`;
  }

  return generic;
}

export function runRuleEngine(declarations: Declaration[], rules: Rule[]): Violation[] {
  const violations: Violation[] = [];

  for (const rule of rules) {
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
          explanation: explainMissingResponsibleEntity(rule, declarations)
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