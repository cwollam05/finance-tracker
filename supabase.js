// ── SUPABASE CLIENT ────────────────────────────────────────────
// Replace these two values with your own from:
// Supabase Dashboard → Project Settings → API
const SUPABASE_URL  = 'https://ibxnrxpwilggjcarloao.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlieG5yeHB3aWxnZ2pjYXJsb2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMTU4NDQsImV4cCI6MjA4OTc5MTg0NH0.mtXwIiwxjb-H72uQ26s6ePuDZ__nC9OLYFkNOPGsxPI';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);
