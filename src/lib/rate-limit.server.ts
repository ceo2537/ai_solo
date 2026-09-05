import { createHmac } from "crypto";
import { getRequest } from "@tanstack/react-start/server";

/**
 * 서버 전용 남용 방지 유틸리티.
 * - 원시 IP·이메일·문진 원문은 절대 저장하지 않는다.
 * - 식별이 필요한 값은 서버 비밀값(RATE_LIMIT_HMAC_SECRET)으로 HMAC 처리한 토큰만 사용한다.
 * - 저장된 토큰은 최대 1시간 TTL로 DB 함수에서 자동 정리된다.
 */

function hmacSecret(): string {
  return (
    process.env["RATE_LIMIT_HMAC_SECRET"] ??
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
    "fallback-dev-secret"
  );
}

/** HMAC 비밀값이 실제로 설정되어 있는지 확인한다(없으면 호출부는 fail-closed 처리). */
export function hasHmacSecret(): boolean {
  return Boolean(
    process.env["RATE_LIMIT_HMAC_SECRET"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"],
  );
}

/** 값을 되돌릴 수 없는 짧은 토큰으로 변환한다(운영 대시보드에는 노출하지 않는다). */
export function hmacToken(scope: string, value: string): string {
  return createHmac("sha256", hmacSecret()).update(`${scope}:${value}`).digest("hex").slice(0, 32);
}


/** 요청 출처 식별자(IP 계열 헤더)를 HMAC 토큰으로만 반환한다. */
export function requestOriginToken(scope: string): string {
  let raw = "unknown";
  try {
    const request = getRequest();
    const headers = request?.headers;
    const candidate =
      headers?.get("cf-connecting-ip") ??
      headers?.get("x-real-ip") ??
      headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "";
    if (candidate) raw = candidate;
    else if (headers?.get("user-agent")) raw = `ua:${headers.get("user-agent")}`;
  } catch {
    /* 요청 컨텍스트가 없으면 기본값을 사용한다 */
  }
  return hmacToken(scope, raw);
}

/**
 * 속도 제한 결과.
 * - `infrastructureError`가 true 이면 제한 인프라 자체가 실패한 것이며,
 *   호출부는 요청을 진행시키지 말고 503 계열로 종료해야 한다(fail-closed).
 */
export type RateLimitOutcome = {
  allowed: boolean;
  retryAfterSeconds: number;
  infrastructureError: boolean;
};

const FAIL_CLOSED: RateLimitOutcome = {
  allowed: false,
  retryAfterSeconds: 0,
  infrastructureError: true,
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** 내부 장애 로그는 식별자·비밀값 없이 코드만 남긴다. */
function logInfraFailure(operation: string) {
  console.error(`[rate-limit] infrastructure_unavailable op=${operation}`);
}

/** 카운터를 원자적으로 증가시키고 허용 여부를 반환한다. 실패 시 차단(fail-closed). */
export async function rateLimitHit(
  bucketKey: string,
  limit: number,
  windowSeconds: number,
  blockSeconds = 0,
): Promise<RateLimitOutcome> {
  try {
    const supabaseAdmin = await admin();
    const { data, error } = await supabaseAdmin.rpc("rate_limit_hit", {
      _bucket_key: bucketKey,
      _limit: limit,
      _window_seconds: windowSeconds,
      _block_seconds: blockSeconds,
    });
    if (error) {
      logInfraFailure("hit");
      return FAIL_CLOSED;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      logInfraFailure("hit");
      return FAIL_CLOSED;
    }
    return {
      allowed: Boolean((row as { allowed: boolean }).allowed),
      retryAfterSeconds: Number((row as { retry_after_seconds: number }).retry_after_seconds ?? 0),
      infrastructureError: false,
    };
  } catch {
    logInfraFailure("hit");
    return FAIL_CLOSED;
  }
}

export type RateLimitPeek = { blockedForSeconds: number; infrastructureError: boolean };

/** 차단 상태만 확인한다(카운터는 증가시키지 않는다). 실패 시 차단(fail-closed). */
export async function rateLimitPeek(bucketKey: string): Promise<RateLimitPeek> {
  try {
    const supabaseAdmin = await admin();
    const { data, error } = await supabaseAdmin.rpc("rate_limit_peek", { _bucket_key: bucketKey });
    if (error) {
      logInfraFailure("peek");
      return { blockedForSeconds: 0, infrastructureError: true };
    }
    return { blockedForSeconds: Number(data ?? 0), infrastructureError: false };
  } catch {
    logInfraFailure("peek");
    return { blockedForSeconds: 0, infrastructureError: true };
  }
}

/** 성공한 로그인 등에서 실패 카운터를 초기화한다. */
export async function rateLimitReset(bucketKey: string): Promise<void> {
  try {
    const supabaseAdmin = await admin();
    await supabaseAdmin.rpc("rate_limit_reset", { _bucket_key: bucketKey });
  } catch {
    /* 초기화 실패는 사용자 흐름을 막지 않는다 */
  }
}

export type LockClaim = { claimed: boolean; infrastructureError: boolean };

/** 동일 요청의 동시·반복 실행을 막는 잠금을 확보한다. 실패 시 확보 실패로 처리(fail-closed). */
export async function claimRequestLock(lockKey: string, ttlSeconds: number): Promise<LockClaim> {
  try {
    const supabaseAdmin = await admin();
    const { data, error } = await supabaseAdmin.rpc("claim_request_lock", {
      _lock_key: lockKey,
      _ttl_seconds: ttlSeconds,
    });
    if (error) {
      logInfraFailure("lock_claim");
      return { claimed: false, infrastructureError: true };
    }
    return { claimed: Boolean(data), infrastructureError: false };
  } catch {
    logInfraFailure("lock_claim");
    return { claimed: false, infrastructureError: true };
  }
}

/** 잠금을 즉시 해제한다(재시도 허용 경로). */
export async function releaseRequestLock(lockKey: string): Promise<void> {
  try {
    const supabaseAdmin = await admin();
    await supabaseAdmin.rpc("release_request_lock", { _lock_key: lockKey });
  } catch {
    /* 정리는 TTL로도 처리된다 */
  }
}

/**
 * 성공적으로 완료된 요청의 잠금을 짧은 "완료 표시"로 전환한다.
 * 응답 직전 재전송이 유료 호출을 중복 발생시키지 않도록 짧게 유지된다.
 */
export async function finishRequestLock(lockKey: string, ttlSeconds = 15): Promise<void> {
  try {
    const supabaseAdmin = await admin();
    await supabaseAdmin.rpc("finish_request_lock", {
      _lock_key: lockKey,
      _ttl_seconds: ttlSeconds,
    });
  } catch {
    /* 실패해도 원래 TTL 로 자동 만료된다 */
  }
}
