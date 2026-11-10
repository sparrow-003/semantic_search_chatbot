import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/integrations/supabase/types";

export function createClient() {
  const url =
    import.meta.env["VITE_SUPABASE_URL"] ??
    (typeof process !== "undefined" ? process.env["VITE_SUPABASE_URL"] : undefined) ??
    "";
  const key =
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
    (typeof process !== "undefined" ? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] : undefined) ??
    "";

  if (!url || !key) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.");
  }

  return createBrowserClient<Database>(url, key);
}
