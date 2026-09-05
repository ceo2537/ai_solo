import { createMiddleware } from "@tanstack/react-start";

/**
 * 서버 함수의 오류 응답을 고정된 안전 코드와 실제 HTTP 상태로 정규화한다.
 * - 스택, 파일 경로, Supabase 원문은 절대 응답에 포함하지 않는다.
 */
export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "RATE_LIMITED"
  | "SERVICE_TEMPORARILY_UNAVAILABLE"
  | "SERVER_ERROR";

const STATUS: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_INPUT: 400,
  RATE_LIMITED: 429,
  SERVICE_TEMPORARILY_UNAVAILABLE: 503,
  SERVER_ERROR: 500,
};

const MESSAGES: Record<ApiErrorCode, string> = {
  UNAUTHENTICATED: "로그인이 필요합니다.",
  FORBIDDEN: "접근 권한이 없습니다.",
  INVALID_INPUT: "요청 값을 확인해 주세요.",
  RATE_LIMITED: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  SERVICE_TEMPORARILY_UNAVAILABLE:
    "일시적으로 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  SERVER_ERROR: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
};

/** 응답에 담기는 정보는 고정 코드와 한국어 안내뿐이다(스택·경로·원문 없음). */
export type ApiFailure = Error & {
  statusCode: number;
  code: ApiErrorCode;
  retryAfterSeconds?: number;
};

export function isApiFailure(value: unknown): value is ApiFailure {
  return (
    value instanceof Error &&
    typeof (value as ApiFailure).code === "string" &&
    typeof (value as ApiFailure).statusCode === "number"
  );
}

/** 서버 함수 내부에서 `throw apiError("FORBIDDEN")` 형태로 사용한다. */
export function apiError(code: ApiErrorCode, retryAfterSeconds?: number): ApiFailure {
  const error = new Error(MESSAGES[code]) as ApiFailure;
  error.name = "ApiFailure";
  error.statusCode = STATUS[code];
  error.code = code;
  if (retryAfterSeconds && retryAfterSeconds > 0) error.retryAfterSeconds = retryAfterSeconds;
  return error;
}

/**
 * 인증 미들웨어보다 먼저 실행되어 토큰 누락·만료·위조는 401,
 * 권한 없음은 403, 제한 인프라 장애는 503으로 정규화한다.
 */
export const normalizeAuthErrors = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      let failure: ApiFailure;
      if (isApiFailure(error)) {
        failure = error;
      } else {
        const message = error instanceof Error ? error.message : "";
        // 위조·만료 토큰은 라이브러리 내부에서 다양한 문구로 실패하므로 함께 401로 묶는다.
        const looksLikeBadToken = /unauthorized|jwt|token|claim|malformed|signature|invalid utf-8|base64|decode/i.test(message);
        if (looksLikeBadToken) failure = apiError("UNAUTHENTICATED");
        else if (message === "Forbidden") failure = apiError("FORBIDDEN");
        else if (message.startsWith("Missing Supabase environment variable")) {
          failure = apiError("SERVICE_TEMPORARILY_UNAVAILABLE");
        } else {
          console.error("[server-fn] unhandled_error");
          failure = apiError("SERVER_ERROR");
        }

      }
      try {
        // 서버 전용 모듈은 미들웨어 실행 시점에만 불러온다(클라이언트 번들 제외).
        const { setResponseStatus, setResponseHeader } =
          await import("@tanstack/react-start/server");
        setResponseStatus(failure.statusCode);
        setResponseHeader("Cache-Control", "no-store");
        if (failure.retryAfterSeconds) {
          setResponseHeader("Retry-After", String(Math.ceil(failure.retryAfterSeconds)));
        }
      } catch {
        /* 헤더 설정에 실패해도 본문의 고정 코드로 구분할 수 있다 */
      }
      // 스택·원문 없이 고정 코드와 안내 문구만 전달한다.
      throw apiError(failure.code, failure.retryAfterSeconds);
    }
  },
);
