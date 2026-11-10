import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { Database } from "@/integrations/supabase/types";

export function createClient(request: Request) {
  const headers = new Headers();
  const url =
    (typeof process !== "undefined"
      ? process.env["VITE_SUPABASE_URL"] || process.env["SUPABASE_URL"]
      : undefined) ??
    import.meta.env["VITE_SUPABASE_URL"] ??
    "";
  const key =
    (typeof process !== "undefined"
      ? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || process.env["SUPABASE_PUBLISHABLE_KEY"]
      : undefined) ??
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
    "";

  if (!url || !key) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.");
  }

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("Cookie") ?? "").map((c) => ({
          name: c.name,
          value: c.value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          headers.append("Set-Cookie", serializeCookieHeader(name, value, options)),
        );
      },
    },
  });

  return { supabase, headers };
}
