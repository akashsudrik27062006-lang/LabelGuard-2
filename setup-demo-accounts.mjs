import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lyglyyfpuimjpvyxhvjl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_wiVdYQWDjAqmxTL948tf1g_Ciz_O7bj';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function createDemoAccount({ email, password, fullName, role, companyName }) {
  console.log(`\nCreating ${role} account: ${email}`);

  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({ email, password });
  if (signUpErr) {
    console.error(`   ❌ Signup failed:`, signUpErr.message);
    return;
  }
  const userId = signUpData.user.id;
  console.log(`   User created: ${userId}`);

  const { error: profileErr } = await supabase.from('profiles').insert({
    id: userId,
    email,
    full_name: fullName,
    role
  });
  if (profileErr) {
    console.error(`   ❌ Profile creation failed:`, profileErr.message);
    return;
  }
  console.log(`   Profile created.`);

  if (companyName) {
    const { data: newOrg, error: orgErr } = await supabase
      .from('organizations')
      .insert({ name: companyName, type: role, created_by: userId })
      .select('id')
      .single();
    if (orgErr) {
      console.error(`   ❌ Org creation failed:`, orgErr.message);
      return;
    }
    const { error: linkErr } = await supabase
      .from('profiles')
      .update({ organization_id: newOrg.id })
      .eq('id', userId);
    if (linkErr) {
      console.error(`   ❌ Org linking failed:`, linkErr.message);
      return;
    }
    console.log(`   Organization created & linked: ${companyName} (${newOrg.id})`);
  }

  console.log(`   ✅ Done.`);
}

async function main() {
  await createDemoAccount({
    email: 'thombreomkar098+manufacturer@gmail.com',
    password: 'Demo@Manufacturer123',
    fullName: 'ABC Foods Quality Desk',
    role: 'MANUFACTURER',
    companyName: 'ABC Foods Pvt. Ltd.'
  });

  await createDemoAccount({
    email: 'thombreomkar098+officer@gmail.com',
    password: 'Demo@Officer123',
    fullName: 'Ananya Sharma (Insp. ID: LMO-441)',
    role: 'OFFICER',
    companyName: null
  });
}

main();