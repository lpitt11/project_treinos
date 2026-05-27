// ===== CONFIGURAÇÃO DO SUPABASE =====
// Substitua pelas suas chaves do Supabase (Project Settings > API)
const SUPABASE_URL = 'https://vsdccvhljvszsmraqljh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HXkmZdhM4RmQKefpBaVHWw_cqMFs1t5';

// Criamos a variável como supaClient para não dar conflito com a biblioteca oficial
const supaClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);