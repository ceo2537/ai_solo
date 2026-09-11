import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { requireAdmin } from "@/lib/admin-auth.functions";
import {
  getAdminDashboardMetrics,
  type AdminDashboardMetrics,
} from "@/lib/operation-logs.functions";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "관리화면_버전1 — 영양나침반" },
      {
        name: "description",
        content: "읽기 전용 운영현황 대시보드 예시 화면입니다.",
      },
      { property: "og:title", content: "관리화면_버전1 — 영양나침반" },
      {
        property: "og:description",
        content: "읽기 전용 운영현황 대시보드 예시 화면입니다.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminDashboardPage,
});

const IDLE_LIMIT_MS = 30 * 60 * 1000;
/** 로그인 시각 기준 최대 세션 유지 시간 */
const ABSOLUTE_SESSION_MS = 8 * 60 * 60 * 1000;

function AdminDashboardPage() {
  const navigate = useNavigate();
  const checkAdmin = useServerFn(requireAdmin);
  const [allowed, setAllowed] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signOutAndRedirect = useCallback(async () => {
    await supabase.auth.signOut();
    await navigate({ to: "/admin/login", replace: true });
  }, [navigate]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    await navigate({ to: "/", replace: true });
  }, [navigate]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        // 미리보기 환경의 비동기 세션 저장소는 첫 조회가 잠시 비어 있을 수 있어 짧게 재확인한다.
        let session = null as Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"];
        for (let i = 0; i < 5; i += 1) {
          const { data } = await supabase.auth.getSession();
          if (!active) return;
          if (data.session) {
            session = data.session;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        if (!active) return;
        if (!session) {
          await navigate({ to: "/admin/login", replace: true });
          return;
        }
        const signedInAt = Date.parse(session.user.last_sign_in_at ?? "");

        if (Number.isFinite(signedInAt) && Date.now() - signedInAt >= ABSOLUTE_SESSION_MS) {
          await signOutAndRedirect();
          return;
        }
        const result = await checkAdmin({ data: undefined });
        if (!active) return;
        if (result.isAdmin) setAllowed(true);
        else await signOutAndRedirect();
      } catch {
        if (active) await signOutAndRedirect();
      }
    })();
    return () => {
      active = false;
    };
  }, [checkAdmin, navigate, signOutAndRedirect]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void (async () => {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        const signedInAt = Date.parse(data.session?.user.last_sign_in_at ?? "");
        if (!data.session || (Number.isFinite(signedInAt) && Date.now() - signedInAt >= ABSOLUTE_SESSION_MS)) {
          await signOutAndRedirect();
        }
      })();
    }, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [allowed, signOutAndRedirect]);

  useEffect(() => {
    if (!allowed) return;
    const reset = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        void signOutAndRedirect();
      }, IDLE_LIMIT_MS);
    };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"] as const;
    events.forEach((name) => window.addEventListener(name, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((name) => window.removeEventListener(name, reset));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [allowed, signOutAndRedirect]);

  if (!allowed) return <div className="min-h-screen bg-background" />;

  return <AdminDashboard onSignOut={handleLogout} />;
}


function formatKstDateTime(iso: string | null): string {
  if (!iso) return "-";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "-";
  return new Date(time + 9 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
}

function AdminDashboard({ onSignOut }: { onSignOut: () => void | Promise<void> }) {
  const loadMetrics = useServerFn(getAdminDashboardMetrics);
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const result = await loadMetrics({ data: undefined });
      if (result.ok) setMetrics(result);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [loadMetrics]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = useMemo(
    () => [
      {
        label: "요청 수",
        value: metrics ? String(metrics.totalRequests) : "-",
        icon: Activity,
        color: "text-primary",
      },
      {
        label: "성공률",
        value: metrics
          ? metrics.successRate === null
            ? "데이터 없음"
            : `${metrics.successRate.toFixed(1)}%`
          : "-",
        icon: CheckCircle2,
        color: "text-sage",
      },
      {
        label: "실패 수",
        value: metrics ? String(metrics.failed) : "-",
        icon: AlertCircle,
        color: "text-destructive",
      },
      {
        label: "평균 처리시간",
        value: metrics
          ? metrics.averageDurationMs === null
            ? "데이터 없음"
            : `${metrics.averageDurationMs}ms`
          : "-",
        icon: Clock,
        color: "text-ocean",
      },
    ],
    [metrics],
  );

  const trend = metrics?.trend ?? [];
  const maxTrend = Math.max(1, ...trend.map((day) => day.value));
  const criteria = metrics
    ? [
        { label: "모델 버전", value: metrics.criteria.aiModelVersion },
        { label: "프롬프트 버전", value: metrics.criteria.promptVersion },
        { label: "영양기준 버전", value: metrics.criteria.nutritionStandardVersion },
        {
          label: "기준 출처",
          value: metrics.criteria.fromLiveData ? "최신 운영 요청" : "앱 기본값",
        },
      ]
    : [];

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* 상단 */}
        <header className="mb-6 flex flex-col items-start justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
                관리화면_버전1
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                마지막 갱신 시각: {metrics ? formatKstDateTime(metrics.generatedAt) : "-"} (KST)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={loading}
              onClick={() => {
                void refresh();
              }}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
              새로고침
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                void onSignOut();
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              로그아웃
            </Button>
          </div>
        </header>

        {/* 안내 문구 */}
        <section className="mb-6 rounded-xl border border-border bg-muted p-4">
          <p className="text-center text-base font-medium text-foreground" role="status">
            {failed
              ? "운영 데이터를 불러오지 못했습니다."
              : loading
                ? "운영 데이터를 불러오는 중입니다."
                : `실제 운영 데이터 (기준일: ${metrics?.periodLabel ?? "-"}, 한국시간)`}
          </p>
        </section>

        {/* 요약 */}
        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summary.map((item) => (
            <Card key={item.label}>
              <CardContent className="flex items-center gap-4 p-6">
                <div
                  className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted",
                    item.color,
                  )}
                >
                  <item.icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">
                    {item.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* 최근 7일 생성 추이 */}
        <section className="mb-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-ocean" aria-hidden="true" />
                <CardTitle>최근 7일 생성 추이</CardTitle>
              </div>
              <CardDescription>오늘 포함 최근 7일간의 일별 요청 수입니다.</CardDescription>
            </CardHeader>
            <CardContent>
              {trend.length === 0 ? (
                <p className="text-sm text-muted-foreground">표시할 데이터가 없습니다.</p>
              ) : (
                <div className="flex h-56 gap-2 sm:gap-4">
                  {trend.map((day) => (
                    <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                      <div className="flex w-full flex-1 items-end justify-center">
                        <div
                          className="w-full rounded-t-lg bg-primary transition-all"
                          style={{ height: `${(day.value / maxTrend) * 100}%`, minHeight: "8px" }}
                          aria-hidden="true"
                        />
                      </div>
                      <div className="text-center text-sm font-semibold text-foreground">
                        {day.value}
                      </div>
                      <div className="text-xs text-muted-foreground">{day.date}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* 하단: 최근 오류 */}
        <section className="mb-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
                <CardTitle>최근 오류</CardTitle>
              </div>
              <CardDescription>최근 실패한 요청의 유형과 코드입니다.</CardDescription>
            </CardHeader>
            <CardContent>
              {(metrics?.recentErrors.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">최근 오류가 없습니다.</p>
              ) : (
                <ul className="space-y-3">
                  {metrics?.recentErrors.map((error, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-3 rounded-lg border border-border bg-muted p-3"
                    >
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">
                        {formatKstDateTime(error.completedAt)}
                      </span>
                      <span className="text-sm text-foreground">
                        {error.errorType}
                        {error.errorCode ? ` / ${error.errorCode}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* 최하단: 현재 적용 기준 */}
        <section>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-ocean" aria-hidden="true" />
                <CardTitle>현재 적용 기준</CardTitle>
              </div>
              <CardDescription>가장 최신 요청에 적용된 기준 정보입니다.</CardDescription>
            </CardHeader>
            <CardContent>
              {criteria.length === 0 ? (
                <p className="text-sm text-muted-foreground">표시할 데이터가 없습니다.</p>
              ) : (
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {criteria.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl border border-border bg-muted p-4 text-center"
                    >
                      <dt className="text-sm font-medium text-muted-foreground">{item.label}</dt>
                      <dd className="mt-1 text-base font-semibold text-foreground">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
