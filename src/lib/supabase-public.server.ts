import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/**
 * 공개 키 기반 서버 클라이언트.
 * 서비스 역할 키가 없는 실행 환경에서도 최소 권한 RPC(SECURITY DEFINER)를 호출할 수 있게 한다.
 * 사용자 데이터 조회에는 사용하지 않는다.
 */
export function createPublicServerClient(accessToken?: string) {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
        else if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}
