import { createMiddleware } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";

/**
 * 서버 함수 호출에 Supabase 접근 토큰을 붙인다.
 *
 * 미리보기 환경의 세션 저장소는 부모 창과 postMessage 로 통신하는 비동기 브로커라
 * `getSession()` 이 지연되거나 실패할 수 있다. 그 경우에도 로그인처럼 토큰이 필요 없는
 * 서버 함수까지 함께 실패하면 안 되므로, 조회 실패·지연은 무시하고 헤더 없이 진행한다.
 * 보호가 필요한 서버 함수는 서버에서 토큰을 검증하므로 보안은 약화되지 않는다.
 */
const TOKEN_LOOKUP_TIMEOUT_MS = 3000;

async function readAccessToken(): Promise<string | undefined> {
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TOKEN_LOOKUP_TIMEOUT_MS)),
    ]);
    return result?.data?.session?.access_token ?? undefined;
  } catch {
    return undefined;
  }
}

export const attachSupabaseAuthSafely = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const token = await readAccessToken();
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);
