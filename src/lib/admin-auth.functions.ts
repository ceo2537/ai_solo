import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiError, isApiFailure, normalizeAuthErrors } from "@/lib/api-errors";
import type { Database } from "@/integrations/supabase/types";

type SignInInput = { email: string; password: string };

/**
 * 클라이언트에 노출되는 실패 사유는 계정 열거를 막기 위해 통합한다.
 * - 잘못된 이메일/비밀번호, 없는 계정, 관리자 아님 → 모두 `login_failed`
 * - 제한 인프라 장애 → `service_unavailable` (503, 429로 오인시키지 않는다)
 */
export type AdminSignInResult =
  | { ok: true; accessToken: string; refreshToken: string }
  | {
      ok: false;
      reason: "login_failed" | "server_error" | "rate_limited" | "service_unavailable";
      retryAfterSeconds?: number;
    };

function createAnonServerClient() {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/**
 * Signs an administrator in entirely on the server: credentials are checked,
 * the admin role is verified against server-side role data, and the attempt is
 * recorded. Only the outcome + reason code is stored — never emails, passwords
 * or tokens.
 */
export const adminSignIn = createServerFn({ method: "POST" })
  .middleware([normalizeAuthErrors])
  .inputValidator((input: SignInInput) => {
    const email = typeof input?.email === "string" ? input.email.trim() : "";
    const password = typeof input?.password === "string" ? input.password : "";
    return { email, password };
  })
  .handler(async ({ data }): Promise<AdminSignInResult> => {
    const { requestOriginToken, hmacToken, hasHmacSecret, rateLimitPeek, rateLimitHit, rateLimitReset } =
      await import("@/lib/rate-limit.server");

    // 시도 기록은 최소 권한 기록 함수로만 남긴다(서비스 역할 키에 의존하지 않는다).
    const log = async (success: boolean, adminUserId: string | null, reason: string | null) => {
      try {
        const anon = createAnonServerClient();
        await anon.rpc("log_admin_login_event", {
          _success: success,
          _admin_user_id: adminUserId as unknown as string,
          _failure_reason: reason ?? "",
        });
      } catch {
        /* 기록 실패가 로그인 흐름을 막지 않는다 */
      }
    };

    // HMAC 비밀값이 없으면 비가역 식별을 보장할 수 없으므로 진행하지 않는다.
    if (!hasHmacSecret()) {
      await log(false, null, "rate_limit_unavailable");
      throw apiError("SERVICE_TEMPORARILY_UNAVAILABLE");
    }

    // 원시 IP·이메일은 저장하지 않고 서버 비밀값 기반 HMAC 토큰만 사용한다.
    const originBucket = `admin-login:${requestOriginToken("admin-login")}`;
    // 계정 기준 버킷: 정규화한 이메일을 저장하지 않고 비가역 토큰만 사용한다.
    // 존재하지 않는 계정도 동일하게 계산되어 계정 존재 여부가 드러나지 않는다.
    const normalizedEmail = data.email.trim().toLowerCase();
    const accountBucket = `admin-login-acct:${hmacToken("admin-login-account", normalizedEmail || "empty")}`;
    const buckets = [originBucket, accountBucket];

    /** 429 응답으로 종료한다(실제 HTTP 상태 + Retry-After 유지). */
    const blocked = async (retryAfterSeconds: number): Promise<AdminSignInResult> => {
      await log(false, null, "rate_limited");
      try {
        const { setResponseStatus, setResponseHeader } =
          await import("@tanstack/react-start/server");
        setResponseStatus(429);
        setResponseHeader("Cache-Control", "no-store");
        setResponseHeader("Retry-After", String(Math.max(1, retryAfterSeconds)));
      } catch {
        /* 응답 본문의 재시도 시간으로 대체된다 */
      }
      return { ok: false, reason: "rate_limited", retryAfterSeconds: Math.max(1, retryAfterSeconds) };
    };

    const peeks = await Promise.all(buckets.map((bucket) => rateLimitPeek(bucket)));
    if (peeks.some((peek) => peek.infrastructureError)) {
      // 제한 인프라 장애: 인증 시도 전에 종료한다(fail-closed).
      await log(false, null, "rate_limit_unavailable");
      throw apiError("SERVICE_TEMPORARILY_UNAVAILABLE");
    }
    const blockedFor = Math.max(...peeks.map((peek) => peek.blockedForSeconds));
    if (blockedFor > 0) return blocked(blockedFor);

    // 실패 5회/15분 초과 시 15분 차단. 6번째 실패 요청은 같은 요청에서 즉시 차단된다.
    // 실패 경로는 내부 사유만 구분해 기록하고, 외부 응답은 항상 동일하다.
    const failSame = async (internalReason: string): Promise<AdminSignInResult> => {
      const outcomes = await Promise.all(
        buckets.map((bucket) => rateLimitHit(bucket, 5, 900, 900)),
      );
      if (outcomes.some((outcome) => outcome.infrastructureError)) {
        await log(false, null, internalReason);
        throw apiError("SERVICE_TEMPORARILY_UNAVAILABLE");
      }
      const denied = outcomes.filter((outcome) => !outcome.allowed);
      if (denied.length > 0) {
        return blocked(Math.max(...denied.map((outcome) => outcome.retryAfterSeconds)));
      }
      await log(false, null, internalReason);
      return { ok: false, reason: "login_failed" };
    };

    if (!data.email || !data.password) {
      return failSame("invalid_credentials");
    }


    try {
      const anon = createAnonServerClient();
      const { data: signIn, error } = await anon.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error || !signIn.session || !signIn.user) {
        return failSame("invalid_credentials");
      }

      const userId = signIn.user.id;
      // 방금 발급된 사용자 토큰으로 역할을 확인한다(서비스 역할 키에 의존하지 않는다).
      const { createPublicServerClient } = await import("@/lib/supabase-public.server");
      const asUser = createPublicServerClient(signIn.session.access_token);
      const { data: isAdmin, error: roleError } = await asUser.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });

      if (roleError) {
        await anon.auth.signOut();
        await log(false, null, "server_error");
        return { ok: false, reason: "server_error" };
      }

      if (!isAdmin) {
        await anon.auth.signOut();
        return failSame("not_admin");
      }

      // 성공 시 실패 카운터 초기화(로그인한 사용자 권한으로만 허용된다).
      await Promise.all(
        buckets.map(async (bucket) => {
          try {
            await asUser.rpc("rate_limit_reset", { _bucket_key: bucket });
          } catch {
            await rateLimitReset(bucket);
          }
        }),
      );
      await log(true, userId, null);
      return {
        ok: true,
        accessToken: signIn.session.access_token,
        refreshToken: signIn.session.refresh_token,
      };
    } catch (error) {
      // 정규화된 오류(503 등)는 그대로 전달한다.
      if (error instanceof Response || isApiFailure(error)) throw error;
      await log(false, null, "server_error");
      return { ok: false, reason: "server_error" };
    }
  });

/** Server-side admin check for the protected dashboard and any admin-only data. */
export const requireAdmin = createServerFn({ method: "POST" })
  .middleware([normalizeAuthErrors, requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ isAdmin: boolean }> => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    // 역할 조회 인프라 장애는 503, 권한 없음은 403으로 구분한다.
    if (error) throw apiError("SERVICE_TEMPORARILY_UNAVAILABLE");
    if (!data) throw apiError("FORBIDDEN");
    return { isAdmin: true };
  });
