// ============================================================
// POST /functions/v1/process-scan
// Body: { scanId: string }
//
// Gemini-only pipeline (no Google Cloud Vision — free tier, no
// billing card required):
//   image -> Gemini (reads + structures declarations in one call)
//         -> deterministic rule engine -> write results
// ============================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { runRuleEngine, computeScore, statusFromViolations, type Declaration, type Rule } from '../_shared/ruleEngine.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DECLARATION_FIELDS = [
  'product_name', 'manufacturer', 'packer', 'importer', 'country_of_origin',
  'net_quantity', 'mrp', 'manufacturing_date', 'expiry_or_best_before',
  'consumer_care', 'batch_number', 'unit_sale_price'
];

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { scanId } = await req.json();
    if (!scanId) return json({ error: 'scanId is required' }, 400, cors);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    await supabase.from('scans').update({ status: 'PROCESSING' }).eq('id', scanId);

    // ---- 1. Load scan + product image ----
    const { data: scan, error: scanErr } = await supabase
      .from('scans').select('*, products(*)').eq('id', scanId).single();
    if (scanErr || !scan) throw new Error('Scan not found: ' + scanErr?.message);

    const { data: images } = await supabase
      .from('product_images').select('*').eq('product_id', scan.product_id).order('created_at', { ascending: false }).limit(1);
    const image = images?.[0];
    if (!image) throw new Error('No product image found for this scan');

    const { data: signedUrlData } = await supabase.storage
      .from('product-images').createSignedUrl(image.storage_path, 300);
    const imageUrl = signedUrlData?.signedUrl;
    if (!imageUrl) throw new Error('Could not sign image URL');

    const imageResp = await fetch(imageUrl);
    const imageBuffer = await imageResp.arrayBuffer();
    const imageBase64 = base64Encode(imageBuffer);
    const mimeType = imageResp.headers.get('content-type') || 'image/jpeg';

    // ---- 2. Gemini: read the image AND extract structured declarations
    //          in a single multimodal call (no separate OCR step) ----
    const geminiPrompt = buildGeminiPrompt();
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: geminiPrompt },
              { inline_data: { mime_type: mimeType, data: imageBase64 } }
            ]
          }],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini API error (${geminiRes.status}): ${errText}`);
    }

    const geminiData = await geminiRes.json();
    const geminiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const parsed = safeParseJson(geminiText);
    const rawText: string = parsed.raw_text_seen ?? '';
    const fields = parsed.fields ?? parsed; // tolerate either shape

    await supabase.from('ocr_results').insert({
      scan_id: scanId,
      provider: 'gemini-3.5-flash-lite',
      raw_text: rawText,
      confidence: null,
      blocks_json: null
    });

    const declarations: Declaration[] = DECLARATION_FIELDS.map(field => {
      const entry = fields[field] ?? { value: null, present: false, confidence: 0 };
      return {
        field,
        value: entry.value ?? null,
        present: Boolean(entry.present),
        confidence: typeof entry.confidence === 'number' ? entry.confidence : 0
      };
    });

    await supabase.from('declarations').insert(
      declarations.map(d => ({
        scan_id: scanId,
        field: d.field,
        value: d.value,
        present: d.present,
        confidence: d.confidence,
        source: 'gemini-3.5-flash-lite'
      }))
    );

    // ---- 3. Deterministic rule engine (NO LLM) ----
    const { data: rulesData } = await supabase.from('rules').select('*').eq('active', true);
    const rules: Rule[] = (rulesData ?? []) as Rule[];
    const violations = runRuleEngine(declarations, rules);
    const score = computeScore(rules.length, violations);
    const status = statusFromViolations(violations);

    if (violations.length > 0) {
      await supabase.from('violations').insert(
        violations.map(v => ({
          scan_id: scanId,
          rule_id: v.rule_id,
          field: v.field,
          detected_value: v.detected_value,
          expected_value: v.expected_value,
          severity: v.severity,
          status: 'POTENTIAL',
          evidence_json: { explanation: v.explanation }
        }))
      );
    }

    // ---- 4. Finalize scan ----
    await supabase.from('scans').update({
      status,
      score,
      completed_at: new Date().toISOString()
    }).eq('id', scanId);

    await supabase.from('audit_logs').insert({
      user_id: scan.user_id,
      action: 'SCAN_COMPLETED',
      entity_type: 'scans',
      entity_id: scanId,
      metadata: { score, status, violationCount: violations.length }
    });

    return json({ scanId, status, score, violations, declarations }, 200, cors);
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message }, 500, cors);
  }
});

function buildGeminiPrompt(): string {
  return `You are a packaging information extraction system for Indian Legal Metrology compliance.

Look carefully at the provided package image and read every piece of visible text on it (this is
your own OCR step — do not skip reading small print).

Extract ONLY information that is visibly present on the package. Never invent or infer missing
declarations.

FIELD DEFINITIONS — read carefully, these fields are commonly confused:
- "manufacturer": the company name and registered address that made/packed the product. This is
  often printed as "Manufactured by:", "Marketed by:", "Packed by:", or simply appears as a company
  name + address block (e.g. "GCMMF Ltd., Anand - 388001"). IMPORTANT: if a company name and
  address also appears next to or within the consumer care / customer support text, that company
  name and address STILL COUNTS as the manufacturer field too — extract it into BOTH "manufacturer"
  and "consumer_care" if they are printed together, do not leave manufacturer empty just because
  the address happens to sit next to a helpline number.
- "consumer_care": ONLY the contact channel itself — phone number, email address, and/or helpline
  hours. If a company name/address is printed immediately before or after the phone/email as part
  of the same block, include the full block in consumer_care too, but that company name must ALSO
  be captured separately in "manufacturer".
- "net_quantity": the primary declared weight/volume of the product as sold. If the package shows
  multiple quantities for genuinely different components of a combo/multi-item pack (e.g. "1 L milk
  + 540 g ice cream" style combo), extract the value exactly as printed, do not simplify or split it.
  Preserve exact wording including any parenthetical units — do not "correct" apparent
  contradictions yourself (e.g. "1 Litre (900 mL)") — the rule engine downstream checks for those.

Return ONLY a JSON object (no markdown, no preamble, no code fences) with exactly this shape:

{
  "raw_text_seen": "<everything you could read off the package, as plain text>",
  "fields": {
    "product_name": { "value": string|null, "present": boolean, "confidence": number, "evidence_text": string },
    "manufacturer": { ... same shape ... },
    "packer": { ... },
    "importer": { ... },
    "country_of_origin": { ... },
    "net_quantity": { ... },
    "mrp": { ... },
    "manufacturing_date": { ... },
    "expiry_or_best_before": { ... },
    "consumer_care": { ... },
    "batch_number": { ... },
    "unit_sale_price": { ... }
  }
}

If a field is genuinely not visible anywhere on the package: value = null, present = false, confidence = 0.
confidence is a number between 0 and 1 representing your certainty in the extraction.`;
}

function safeParseJson(text: string): Record<string, any> {
  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {};
  }
}

function base64Encode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}
