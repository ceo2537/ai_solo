import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";

import { adminSignIn } from "@/lib/admin-auth.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "관리자 로그인 — 영양나침반" },
      { name: "description", content: "관리자 전용 로그인 화면입니다." },
      { property: "og:title", content: "관리자 로그인 — 영양나침반" },
      { property: "og:description", content: "관리자 전용 로그인 화면입니다." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLogin,
});

const MESSAGES: Record<string, string> = {
  login_failed: "이메일 또는 비밀번호가 올바르지 않습니다.",
  service_unavailable: "일시적으로 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  server_error: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  rate_limited: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
};

function AdminLogin() {
  const navigate = useNavigate();
  const signIn = useServerFn(adminSignIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * 세션 저장소가 미리보기 브로커(비동기 postMessage)일 때는 setSession 직후에도
   * 세션 조회가 잠깐 비어 있을 수 있으므로 짧게 재확인한다.
   */
  async function waitForSession(attempts = 5): Promise<boolean> {
    for (let i = 0; i < attempts; i += 1) {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) return true;
      } catch {
        /* 다음 시도에서 재확인한다 */
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return false;
  }

  /** 민감정보 없이 단계 코드만 남긴다(진단용). */
  function failWithCode(code: string) {
    console.error(`[admin-login] ${code}`);
    setError(`${MESSAGES["server_error"]!} (코드: ${code})`);
  }

  /**
   * 요청 자체가 실패한 경우 원인 범주만 안전한 코드로 구분한다.
   * 원문 오류 메시지는 절대 화면에 노출하지 않는다.
   */
  function reportRequestFailure(error: unknown) {
    const status =
      error instanceof Response
        ? error.status
        : typeof (error as { status?: unknown })?.status === "number"
          ? ((error as { status: number }).status)
          : undefined;

    if (status === 429) {
      setError("로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (status === 503) {
      setError(MESSAGES["service_unavailable"]!);
      return;
    }
    if (typeof status === "number") {
      failWithCode(`E-HTTP-${status}`);
      return;
    }
    const message = error instanceof Error ? error.message : "";
    if (/network|fetch|load failed|timeout/i.test(message)) {
      failWithCode("E-NETWORK");
      return;
    }
    failWithCode("E-SIGNIN");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await signIn({ data: { email, password } });
      if (!result.ok) {
        if (result.reason === "rate_limited") {
          const minutes = Math.ceil((result.retryAfterSeconds ?? 900) / 60);
          setError(`로그인 시도가 너무 많습니다. 약 ${minutes}분 후에 다시 시도해 주세요.`);
          return;
        }
        setError(MESSAGES[result.reason] ?? MESSAGES["server_error"]!);
        return;
      }

      let established = false;
      try {
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token: result.accessToken,
          refresh_token: result.refreshToken,
        });
        established = !sessionError && Boolean(data.session?.access_token);
      } catch {
        established = false;
      }

      if (!established) established = await waitForSession();
      if (!established) {
        failWithCode("E-SESSION");
        return;
      }

      try {
        await navigate({ to: "/admin", replace: true });
      } catch {
        // 라우터 이동이 실패해도 세션은 이미 설정됐으므로 전체 이동으로 복구한다.
        window.location.replace("/admin");
      }
    } catch (error) {
      reportRequestFailure(error);
    } finally {
      setPending(false);
    }
  }


  return (
    <main className="flex min-h-screen items-center justify-center bg-[#ffffff] px-5 py-12">
      <div className="w-full max-w-[420px] rounded-2xl border border-[#e6e8ec] bg-[#f8f9fa] p-6 sm:p-8">
        <h1 className="text-[24px] font-extrabold leading-[1.3] text-[#1f6f8b]">관리자 로그인</h1>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="admin-email" className="block text-lg font-semibold text-[#111827]">
              이메일
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-[#e6e8ec] bg-white px-4 text-lg text-[#111827] outline-none focus:border-[#7DCCBA]"
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="block text-lg font-semibold text-[#111827]">
              비밀번호
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-[#e6e8ec] bg-white px-4 text-lg text-[#111827] outline-none focus:border-[#7DCCBA]"
            />
          </div>

          {error ? (
            <p role="alert" className="text-lg font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 h-14 w-full rounded-xl bg-[#7DCCBA] text-[20px] font-bold text-[#0f3b33] transition-colors hover:bg-[#6cc0ad] disabled:opacity-60 sm:text-[24px]"
          >
            로그인
          </button>
        </form>
      </div>
    </main>
  );
}
