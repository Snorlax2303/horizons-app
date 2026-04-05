import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://acmpfccutihuppfraita.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjbXBmY2N1dGlodXBwZnJhaXRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMTc3ODAsImV4cCI6MjA4MTU5Mzc4MH0.6EDqVoBFOs0a8UieGmz2XQZuHjUyYDWSJ74B0b_91TQ';

const customSupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export default customSupabaseClient;

export { 
    customSupabaseClient,
    customSupabaseClient as supabase,
};
