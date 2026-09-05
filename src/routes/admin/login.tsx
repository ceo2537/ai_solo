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
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });
      if (sessionError) {
        setError(MESSAGES["server_error"]!);
        return;
      }
      await navigate({ to: "/admin", replace: true });
    } catch {
      setError(MESSAGES["server_error"]!);
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
