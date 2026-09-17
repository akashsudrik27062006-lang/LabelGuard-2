import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://lyglyyfpuimjpvyxhvjl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_wiVdYQWDjAqmxTL948tf1g_Ciz_O7bj';
const IMAGE_PATH = './ghee.jpg';

// ⚠️ REPLACE "YOUR_GMAIL_HERE" below with your actual gmail username
const GMAIL_USERNAME = 'thombreomkar098';

// Simulates what a real signup form would collect
const COMPANY_NAME = `Test Foods Pvt Ltd ${Date.now()}`;
const COMPANY_TYPE = 'MANUFACTURER'; // must match org_type enum: MANUFACTURER | IMPORTER | SELLER | LEGAL_METROLOGY_DEPARTMENT

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log('1. Signing up test user...');
  const testEmail = `${GMAIL_USERNAME}+test${Date.now()}@gmail.com`;
  const testPassword = 'TestPassword123!';

  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword
  });
  if (signUpErr) throw signUpErr;
  console.log('   User created:', signUpData.user.id);

  console.log('2. Creating profile row...');
  const { error: profileErr } = await supabase.from('profiles').insert({
    id: signUpData.user.id,
    email: testEmail,
    full_name: 'Test User',
    role: 'MANUFACTURER'
  });
  if (profileErr) throw profileErr;
  console.log('   Profile created.');

  console.log('2b. Creating organization for this signup...');
  const { data: newOrg, error: orgCreateErr } = await supabase
    .from('organizations')
    .insert({ name: COMPANY_NAME, type: COMPANY_TYPE, created_by: signUpData.user.id })
    .select('id')
    .single();
  if (orgCreateErr) throw orgCreateErr;
  const organizationId = newOrg.id;
  console.log('   Organization created:', COMPANY_NAME, `(${organizationId})`);

  console.log('2c. Assigning profile to organization...');
  const { error: profileUpdateErr } = await supabase
    .from('profiles')
    .update({ organization_id: organizationId })
    .eq('id', signUpData.user.id);
  if (profileUpdateErr) throw profileUpdateErr;
  console.log('   Profile assigned to org:', organizationId);

  console.log('3. Creating product row...');
  const { data: product, error: productErr } = await supabase
    .from('products')
    .insert({
      name: 'Test Chips Packet',
      category: 'Packaged food',
      created_by: signUpData.user.id,
      organization_id: organizationId
    })
    .select().single();
  if (productErr) throw productErr;
  console.log('   Product created:', product.id);

  console.log('4. Uploading image...');
  const fileBuffer = fs.readFileSync(IMAGE_PATH);
  const storagePath = `${signUpData.user.id}/${product.id}/test-chips.jpg`;
  const { error: uploadErr } = await supabase.storage
    .from('product-images')
    .upload(storagePath, fileBuffer, { contentType: 'image/jpeg' });
  if (uploadErr) throw uploadErr;
  console.log('   Image uploaded to:', storagePath);

  const { error: imgRowErr } = await supabase.from('product_images').insert({
    product_id: product.id,
    storage_path: storagePath,
    image_type: 'LABEL',
    uploaded_by: signUpData.user.id
  });
  if (imgRowErr) throw imgRowErr;

  console.log('5. Creating scan row...');
  const { data: scan, error: scanErr } = await supabase
    .from('scans')
    .insert({ product_id: product.id, user_id: signUpData.user.id, scan_type: 'MANUFACTURER', status: 'UPLOADED' })
    .select().single();
  if (scanErr) throw scanErr;
  console.log('   Scan created:', scan.id);

  console.log('6. Invoking process-scan Edge Function (calls Gemini, may take 5-15 seconds)...');
  const startTime = Date.now();
  const { data: result, error: fnErr } = await supabase.functions.invoke('process-scan', {
    body: { scanId: scan.id }
  });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (fnErr) {
    console.error('   ❌ Function error:', fnErr);
    if (fnErr.context) {
      const text = await fnErr.context.text();
      console.error('   Details:', text);
    }
    return;
  }

  console.log(`   ✅ Function completed in ${elapsed}s\n`);
  console.log('========================================');
  console.log('RESULT');
  console.log('========================================');
  console.log('Status:', result.status);
  console.log('Score:', result.score);
  console.log('\nDeclarations extracted:');
  result.declarations.forEach(d => {
    console.log(`  ${d.field}: ${d.present ? d.value : '(not found)'} [confidence: ${d.confidence}]`);
  });
  console.log('\nViolations found:', result.violations.length);
  result.violations.forEach(v => {
    console.log(`  ⚠️  [${v.severity}] ${v.rule_code}: ${v.explanation}`);
  });
}

main().catch(err => {
  console.error('\n❌ TEST FAILED:', err.message || err);
  process.exit(1);
});