import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables. Please check your environment configuration.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);

// Custom fetch functions with better error handling
export const fetchWithErrorHandling = async (
  table: string, 
  query: any
) => {
  try {
    const response = await query;
    
    if (response.error) {
      console.error(`Supabase ${table} query error:`, {
        code: response.error.code,
        message: response.error.message,
        details: response.error.details,
        hint: response.error.hint
      });
      return { data: null, error: response.error };
    }
    
    return response;
  } catch (err) {
    console.error(`Unexpected error in Supabase ${table} query:`, err);
    return { data: null, error: err };
  }
};