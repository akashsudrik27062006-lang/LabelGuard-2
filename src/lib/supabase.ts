import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lyglyyfpuimjpvyxhvjl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_wiVdYQWDjAqmxTL948tf1g_Ciz_O7bj';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
