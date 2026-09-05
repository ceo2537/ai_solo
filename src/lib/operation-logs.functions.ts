import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiError, normalizeAuthErrors } from "@/lib/api-errors";

/** 앱 기본 버전 상수 (실제 로그 행이 없을 때 관리화면에 표시) */
export const APP_VERSIONS = {
  aiModelVersion: "v1.0.0-phase1",
  promptVersion: "prompt-2026-001",
  nutritionStandardVersion: "kdri-2025",
} as const;

export type OperationStatus = "processing" | "succeeded" | "failed" | "cancelled";
export type OperationErrorType =
  "external_ai" | "timeout" | "format_validation" | "server_internal";



const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 한국시간 기준 날짜(YYYY-MM-DD) */
function kstDateKey(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 한국시간 기준 오늘 00:00의 UTC 시각 */
function kstStartOfDayUtc(dayOffset = 0): Date {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  const midnightKst = Date.UTC(
    nowKst.getUTCFullYear(),
    nowKst.getUTCMonth(),
    nowKst.getUTCDate() + dayOffset,
  );
  return new Date(midnightKst - KST_OFFSET_MS);
}

export type AdminDashboardMetrics = {
  ok: true;
  generatedAt: string;
  periodLabel: string;
  totalRequests: number;
  succeeded: number;
  failed: number;
  successRate: number | null;
  averageDurationMs: number | null;
  trend: { date: string; value: number }[];
  recentErrors: { completedAt: string | null; errorType: string; errorCode: string | null }[];
  criteria: {
    aiModelVersion: string;
    promptVersion: string;
    nutritionStandardVersion: string;
    fromLiveData: boolean;
  };
};

/** 관리자 권한이 확인된 경우에만 집계 결과를 반환한다. */
export const getAdminDashboardMetrics = createServerFn({ method: "POST" })
  .middleware([normalizeAuthErrors, requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminDashboardMetrics | { ok: false }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError) throw apiError("SERVICE_TEMPORARILY_UNAVAILABLE");
    if (!isAdmin) throw apiError("FORBIDDEN");

    const todayStart = kstStartOfDayUtc(0);
    const tomorrowStart = kstStartOfDayUtc(1);
    const weekStart = kstStartOfDayUtc(-6);

    const [todayRes, weekRes, errorsRes, latestRes] = await Promise.all([
      supabaseAdmin
        .from("consultation_operation_logs")
        .select("status, duration_ms")
        .gte("requested_at", todayStart.toISOString())
        .lt("requested_at", tomorrowStart.toISOString()),
      supabaseAdmin
        .from("consultation_operation_logs")
        .select("requested_at")
        .gte("requested_at", weekStart.toISOString())
        .lt("requested_at", tomorrowStart.toISOString()),
      supabaseAdmin
        .from("consultation_operation_logs")
        .select("completed_at, error_type, error_code")
        .eq("status", "failed")
        .order("completed_at", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("consultation_operation_logs")
        .select("ai_model_version, prompt_version, nutrition_standard_version")
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (todayRes.error || weekRes.error || errorsRes.error) return { ok: false };

    const todayRows = todayRes.data ?? [];
    const succeeded = todayRows.filter((row) => row.status === "succeeded").length;
    const failed = todayRows.filter((row) => row.status === "failed").length;
    const completed = todayRows.filter(
      (row) => row.status === "succeeded" || row.status === "failed",
    );
    const durations = completed
      .map((row) => row.duration_ms)
      .filter((value): value is number => typeof value === "number");

    const trendMap = new Map<string, number>();
    for (let i = 6; i >= 0; i -= 1) {
      trendMap.set(kstDateKey(kstStartOfDayUtc(-i)), 0);
    }
    for (const row of weekRes.data ?? []) {
      const key = kstDateKey(new Date(row.requested_at));
      if (trendMap.has(key)) trendMap.set(key, (trendMap.get(key) ?? 0) + 1);
    }

    const latest = latestRes.data;

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      periodLabel: kstDateKey(todayStart),
      totalRequests: todayRows.length,
      succeeded,
      failed,
      successRate: completed.length > 0 ? (succeeded / completed.length) * 100 : null,
      averageDurationMs:
        durations.length > 0
          ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
          : null,
      trend: [...trendMap.entries()].map(([date, value]) => ({ date: date.slice(5), value })),
      recentErrors: (errorsRes.data ?? []).map((row) => ({
        completedAt: row.completed_at,
        errorType: row.error_type ?? "server_internal",
        errorCode: row.error_code,
      })),
      criteria: {
        aiModelVersion: latest?.ai_model_version ?? APP_VERSIONS.aiModelVersion,
        promptVersion: latest?.prompt_version ?? APP_VERSIONS.promptVersion,
        nutritionStandardVersion:
          latest?.nutrition_standard_version ?? APP_VERSIONS.nutritionStandardVersion,
        fromLiveData: Boolean(latest),
      },
    };
  });
