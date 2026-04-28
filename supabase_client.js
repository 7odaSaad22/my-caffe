
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://zshgeecukrvyjlrajwez.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzaGdlZWN1a3J2eWpscmFqd2V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MjMyNjgsImV4cCI6MjA4NjM5OTI2OH0._umKrHo7ZbUe--rpdjsLvNc0hFlOv-GcU-cvaXIoT24';

window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log('Supabase successfully initialized via ESM!');
