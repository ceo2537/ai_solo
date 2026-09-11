import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuthSafely } from "@/lib/supabase-auth-attacher";

/** 규격 밖 요청 본문(역직렬화 형식 오류)을 식별한다. 프레임워크 이름은 노출하지 않는다. */
function isMalformedPayloadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /seroval|deserializ|unexpected (end of|token)|is not valid json|malformed/i.test(message);
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    // 정규화된 오류 응답(401/403/429/503 등)은 그대로 전달한다.
    if (error instanceof Response) throw error;
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    // 규격 밖 직렬화/역직렬화 오류는 고정 400 안전 응답으로 정규화한다.
    if (isMalformedPayloadError(error)) {
      console.error("[request] invalid_payload");
      return new Response(
        JSON.stringify({ code: "INVALID_INPUT", message: "요청 값을 확인해 주세요." }),
        {
          status: 400,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        },
      );
    }

    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});


// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

const IS_PROD = import.meta.env.PROD;

/** HTML 응답에 적용할 보안 헤더 */
function applySecurityHeaders(headers: Headers) {
  const contentType = headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return;
  if (headers.has("content-security-policy")) return;

  const supabaseUrl = process.env["SUPABASE_URL"] ?? "";
  const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
  const supabaseWs = supabaseOrigin ? supabaseOrigin.replace(/^https:/, "wss:") : "";

  const connectSrc = [
    "'self'",
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
    supabaseOrigin,
    supabaseWs,
    ...(IS_PROD ? [] : ["ws:", "wss:"]),
  ]
    .filter(Boolean)
    .join(" ");

  // 인라인 하이드레이션 스크립트만 허용하고, 개발/미리보기 도구가 필요한 경우에만 eval 을 허용한다.
  const scriptSrc = IS_PROD ? "'self' 'unsafe-inline'" : "'self' 'unsafe-inline' 'unsafe-eval'";
  const frameAncestors = IS_PROD
    ? "'none'"
    : "'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app";

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src ${connectSrc}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");

  headers.set("Content-Security-Policy", csp);
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  );
}

const securityHeadersMiddleware = createMiddleware().server(async ({ request, next }) => {
  const result = await next();
  const response =
    result instanceof Response ? result : (result as { response?: Response })?.response;
  if (response instanceof Response) {
    applySecurityHeaders(response.headers);
    // 서버 함수 응답은 이벤트 헤더가 병합되지 않으므로 제한 관련 헤더를 직접 옮긴다.
    try {
      const { getResponseHeader } = await import("@tanstack/react-start/server");
      const retryAfter = getResponseHeader("Retry-After");
      if (retryAfter && !response.headers.has("Retry-After")) {
        response.headers.set("Retry-After", retryAfter);
      }
      if (response.status === 429 || response.status >= 400) {
        if (!response.headers.has("Cache-Control")) {
          response.headers.set("Cache-Control", "no-store");
        }
      }
    } catch {
      /* 이벤트 컨텍스트가 없으면 본문의 재시도 시간으로 대체된다 */
    }
    // 관리자 경로는 민감 화면이므로 HTTP 응답 헤더로 캐시 저장을 금지한다.
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      const { pathname } = new URL(request.url);
      if (pathname === "/admin" || pathname === "/admin/login") {
        response.headers.set("Cache-Control", "no-store");
        response.headers.set("Pragma", "no-cache");
        response.headers.set("Expires", "0");
      }
    }
  }
  return result;
});


export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuthSafely],
  requestMiddleware: [securityHeadersMiddleware, errorMiddleware, csrfMiddleware],
}));
