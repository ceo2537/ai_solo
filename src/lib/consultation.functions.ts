import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { apiError, normalizeAuthErrors } from "@/lib/api-errors";

import {
  buildEvidence,
  PENDING_EVIDENCE,
  PENDING_LAB,
  SUPPORTED_BODY_PARTS,
  SUPPORTED_DISEASES,
} from "@/lib/consultation-evidence";
import { APP_VERSIONS } from "@/lib/operation-logs.functions";
import { bmiCategory, kdriAgeGroup } from "@/lib/result-constants";

/** 모델 ID는 이 상수 한 곳에서만 관리한다. */
export const CONSULTATION_MODEL_ID = "gpt-5.4-mini";
/** 기본 모델을 계정에서 사용할 수 없을 때 사용하는 Structured Outputs 지원 소형 모델 */
export const CONSULTATION_FALLBACK_MODEL_ID = "gpt-4.1-mini";
export const CONSULTATION_PROMPT_VERSION = "prompt-2026-002";

const MAX_DISPLAY_CHARS = 3000;

export type ConsultationFood = {
  food: string;
  servingSize: string;
  nutrient: string;
  amount: string;
  unit: string;
  sourceId: string;
};

export type ConsultationAiResult = {
  topSummary: { bmi: string; weightStatus: string; nutrientGoals: string; foods: string };
  personalizedSummary: string;
  bodyAnalysis: string;
  nutrientGoals: string[];
  nutrientRoles: string[];
  foods: ConsultationFood[];
  lifestyle: string[];
  consultationSymptoms: string[];
  sources: { label: string; url: string }[];
  medicalDisclaimer: string;
};

export type ConsultationErrorCode =
  | "UNSUPPORTED_SCOPE"
  | "AI_UNAVAILABLE"
  | "TIMEOUT"
  | "FORMAT_INVALID"
  | "SERVER_ERROR"
  | "RATE_LIMITED"
  | "REQUEST_TOO_LARGE"
  | "DUPLICATE_REQUEST";

export type GenerateConsultationResponse =
  | { ok: true; result: ConsultationAiResult }
  | { ok: false; errorCode: ConsultationErrorCode; retryAfterSeconds?: number };

/** OpenAI 호출 이전에 거부할 요청 본문 크기 상한(바이트) */
const MAX_REQUEST_BYTES = 4096;

const InputSchema = z
  .object({
    gender: z.enum(["남성", "여성"]),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    height: z.number().min(50).max(200),
    weight: z.number().min(30).max(150),
    diseases: z.array(z.string().max(40)).max(12),
    bodyParts: z.array(z.string().max(40)).max(12),
    consentPrivacy: z.literal(true),
    consentSensitive: z.literal(true),
    requestId: z.string().regex(/^[0-9a-f-]{16,64}$/i),
  })
  .strict();

type ValidatedInput =
  { kind: "ok"; value: z.infer<typeof InputSchema> } | { kind: "oversize" } | { kind: "invalid" };

function computeAge(birthDate: string): number | null {
  const [y, m, d] = birthDate.split("-").map(Number) as [number, number, number];
  const birth = new Date(Date.UTC(y, m - 1, d));
  if (birth.getUTCFullYear() !== y || birth.getUTCMonth() !== m - 1 || birth.getUTCDate() !== d)
    return null;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (birth > today) return null;
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const anniversary = new Date(
    Date.UTC(today.getUTCFullYear(), birth.getUTCMonth(), birth.getUTCDate()),
  );
  if (today < anniversary) age -= 1;
  return age >= 1 && age <= 100 ? age : null;
}

/** 의료행위·제품 권고 표현 금지. 고지 문구(medicalDisclaimer)에는 적용하지 않는다. */
const BANNED_PATTERNS = [
  /진단합/,
  /진단됩/,
  /처방/,
  /치료제/,
  /복용/,
  /영양제/,
  /보충제/,
  /제품/,
  /완치/,
  /특효/,
];

const stringArray = { type: "array", items: { type: "string" } };

const RESULT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "topSummary",
    "personalizedSummary",
    "bodyAnalysis",
    "nutrientGoals",
    "nutrientRoles",
    "foods",
    "lifestyle",
    "consultationSymptoms",
    "sources",
    "medicalDisclaimer",
  ],
  properties: {
    topSummary: {
      type: "object",
      additionalProperties: false,
      required: ["bmi", "weightStatus", "nutrientGoals", "foods"],
      properties: {
        bmi: { type: "string" },
        weightStatus: { type: "string" },
        nutrientGoals: { type: "string" },
        foods: { type: "string" },
      },
    },
    personalizedSummary: { type: "string" },
    bodyAnalysis: { type: "string" },
    nutrientGoals: stringArray,
    nutrientRoles: stringArray,
    foods: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["food", "servingSize", "nutrient", "amount", "unit", "sourceId"],
        properties: {
          food: { type: "string" },
          servingSize: { type: "string" },
          nutrient: { type: "string" },
          amount: { type: "string" },
          unit: { type: "string" },
          sourceId: { type: "string" },
        },
      },
    },
    lifestyle: stringArray,
    consultationSymptoms: stringArray,
    sources: { type: "array", items: { type: "string" } },
    medicalDisclaimer: { type: "string" },
  },
} as const;

function displayLength(result: ConsultationAiResult): number {
  const parts = [
    ...Object.values(result.topSummary),
    result.personalizedSummary,
    result.bodyAnalysis,
    ...result.nutrientGoals,
    ...result.nutrientRoles,
    ...result.foods.flatMap((row) => [
      row.food,
      row.servingSize,
      row.nutrient,
      row.amount,
      row.unit,
    ]),
    ...result.lifestyle,
    ...result.consultationSymptoms,
    result.medicalDisclaimer,
  ];
  return parts.join("").length;
}

export const generateConsultation = createServerFn({ method: "POST" })
  .middleware([normalizeAuthErrors])
  .inputValidator((input: unknown): ValidatedInput => {
    // 허용 필드만 파싱하고, 과도한 본문은 OpenAI 호출 전에 거부한다.
    let size = 0;
    try {
      size = new TextEncoder().encode(JSON.stringify(input ?? null)).length;
    } catch {
      return { kind: "invalid" };
    }
    if (size > MAX_REQUEST_BYTES) return { kind: "oversize" };
    const parsed = InputSchema.safeParse(input);
    return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "invalid" };
  })
  .handler(async ({ data: input }): Promise<GenerateConsultationResponse> => {
    // 입력 검증 실패는 업무 오류가 아니라 실제 HTTP 400 + INVALID_INPUT으로 정규화한다.
    if (input.kind !== "ok") throw apiError("INVALID_INPUT");
    const data = input.value;

    const {
      requestOriginToken,
      hmacToken,
      rateLimitHit,
      claimRequestLock,
      releaseRequestLock,
      finishRequestLock,
    } = await import("@/lib/rate-limit.server");

    // 제한 초과는 실제 HTTP 429 + Retry-After로 응답한다(안내 문구는 기존 유지).
    const setRetryAfter = async (seconds: number) => {
      try {
        const { setResponseStatus, setResponseHeader } =
          await import("@tanstack/react-start/server");
        setResponseStatus(429);
        setResponseHeader("Cache-Control", "no-store");
        setResponseHeader("Retry-After", String(Math.max(1, Math.ceil(seconds))));
      } catch {
        /* 헤더 설정 실패는 응답 본문의 재시도 시간으로 대체된다 */
      }
    };

    const originToken = requestOriginToken("consult");
    // 제한 인프라 장애는 OpenAI 호출 이전에 503으로 종료한다(fail-closed).
    const minute = await rateLimitHit(`consult:m:${originToken}`, 3, 60, 0);
    if (minute.infrastructureError) throw apiError("SERVICE_TEMPORARILY_UNAVAILABLE");
    if (!minute.allowed) {
      await setRetryAfter(minute.retryAfterSeconds);
      return { ok: false, errorCode: "RATE_LIMITED", retryAfterSeconds: minute.retryAfterSeconds };
    }
    const hourly = await rateLimitHit(`consult:h:${originToken}`, 10, 3600, 0);
    if (hourly.infrastructureError) throw apiError("SERVICE_TEMPORARILY_UNAVAILABLE");
    if (!hourly.allowed) {
      await setRetryAfter(hourly.retryAfterSeconds);
      return { ok: false, errorCode: "RATE_LIMITED", retryAfterSeconds: hourly.retryAfterSeconds };
    }

    // 동일 요청(idempotency 키)의 동시·반복 OpenAI 호출을 서버에서 차단한다.
    const lockKey = hmacToken("consult-lock", `${originToken}:${data.requestId}`);
    const claim = await claimRequestLock(lockKey, 120);
    if (claim.infrastructureError) throw apiError("SERVICE_TEMPORARILY_UNAVAILABLE");
    if (!claim.claimed) return { ok: false, errorCode: "DUPLICATE_REQUEST" };
    // 종료 경로에 따라 잠금을 해제(재시도 허용)하거나 짧은 완료 표시로 전환한다.
    let lockDisposition: "release" | "finish" = "release";

    try {
      const age = computeAge(data.birthDate);
      // 생년월일 범위 오류도 입력 검증 실패이므로 400으로 정규화한다.
      if (age === null) throw apiError("INVALID_INPUT");

      const diseases = data.diseases.filter((item) => item !== "없음");
      const bodyParts = data.bodyParts.filter((item) => item !== "없음");
      const unsupported = [
        ...diseases.filter((item) => !SUPPORTED_DISEASES.includes(item)),
        ...bodyParts.filter((item) => !SUPPORTED_BODY_PARTS.includes(item)),
      ];
      if (unsupported.length > 0 || (diseases.length === 0 && bodyParts.length === 0)) {
        return { ok: false, errorCode: "UNSUPPORTED_SCOPE" };
      }

      const heightM = data.height / 100;
      const bmiValue = data.weight / (heightM * heightM);
      const isAdult = age >= 19;
      const bmi = bmiValue.toFixed(1);
      const weightStatus = isAdult ? bmiCategory(bmiValue) : "2017 소아청소년 성장도표 기준 평가";
      const ageGroup = kdriAgeGroup(age);
      const evidence = buildEvidence(diseases, bodyParts, isAdult);
      const allowedSourceIds = new Set(evidence.sources.map((source) => source.id));

      const apiKey = process.env["OPENAI_API_KEY"];
      if (!apiKey) {
        return { ok: false, errorCode: "SERVER_ERROR" };
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      let operationKey: string | null = null;
      let requestedAtMs = Date.now();
      try {
        const { data: row } = await supabaseAdmin
          .from("consultation_operation_logs")
          .insert({
            requested_at: new Date(requestedAtMs).toISOString(),
            status: "processing",
            ai_model_version: CONSULTATION_MODEL_ID,
            prompt_version: CONSULTATION_PROMPT_VERSION,
            nutrition_standard_version: APP_VERSIONS.nutritionStandardVersion,
          })
          .select("operation_key, requested_at")
          .single();
        if (row?.operation_key) {
          operationKey = row.operation_key;
          requestedAtMs = Date.parse(row.requested_at);
        }
      } catch {
        operationKey = null;
      }

      const finish = async (
        status: "succeeded" | "failed",
        modelId: string,
        errorType?: "external_ai" | "timeout" | "format_validation" | "server_internal",
        errorCode?: string,
      ) => {
        if (!operationKey) return;
        const completedAtMs = Math.max(Date.now(), requestedAtMs);
        try {
          await supabaseAdmin
            .from("consultation_operation_logs")
            .update({
              status,
              completed_at: new Date(completedAtMs).toISOString(),
              duration_ms: completedAtMs - requestedAtMs,
              ai_model_version: modelId,
              error_type: errorType ?? null,
              error_code: errorCode ?? null,
            })
            .eq("operation_key", operationKey)
            .eq("status", "processing");
        } catch {
          /* 로깅 실패는 사용자 흐름을 막지 않는다 */
        }
      };

      const instructions = [
        "당신은 한국어 비의료 건강정보 안내문을 작성하는 도우미입니다.",
        "진단, 치료, 예방 효과, 복용량, 특정 제품이나 영양제 권고를 절대 하지 마세요.",
        "제공된 승인 근거(approvedEvidence)에 없는 사실, 수치, URL을 만들어내지 마세요. 근거가 없으면 해당 내용을 생략하세요.",
        "selected에 없는 질환이나 관심 건강 분야를 추정해 넣지 마세요.",
        "여러 항목이 선택된 경우 승인 근거를 합쳐 적용하되 같은 성분과 같은 출처는 한 번만 쓰세요.",
        "질환 규칙과 관심 분야 규칙이 충돌하면 질환의 안전 제한을 우선하세요.",
        "approvedEvidence.safetyHolds와 approvedEvidence.cautions의 문장은 그대로 포함하고, 해당 성분의 증감·제한을 확정하지 마세요.",
        `검사 정보가 필요해 확정할 수 없는 항목은 정확히 "${PENDING_LAB}" 문구로 표시하세요.`,
        `승인 근거가 없는 항목은 새 내용을 만들지 말고 정확히 "${PENDING_EVIDENCE}" 문구로 표시하세요.`,
        "foods 배열은 approvedFoods에 있는 행만 그대로 사용하고, 기준량이나 함량이 없는 식품은 절대 넣지 마세요.",
        "sources 배열에는 approvedEvidence.sources의 id 중 실제로 적용한 것만 넣으세요.",
        "모든 문장은 안내·정보 제공 어조의 존댓말로 쓰고, 전체 표시 문자열 합계가 2,600자를 넘지 않도록 간결하게 작성하세요.",
        "bodyAnalysis에는 BMI 계산식(체중(kg) ÷ 키(m)²)과 체격 해석만 간단히 쓰세요.",
        "medicalDisclaimer에는 이 정보가 AI가 생성한 비의료 일반 건강정보이며 진단·치료를 대신하지 않는다는 고지를 넣으세요.",

      ].join("\n");

      const payload = {
        profile: { gender: data.gender, age, bmi, weightStatus, kdriAgeGroup: ageGroup, isAdult },
        selected: { diseases, bodyParts },
        approvedEvidence: evidence,
        approvedFoods: evidence.foods,
      };

      const callModel = async (modelId: string) => {
        const { default: OpenAI } = await import("openai");
        const client = new OpenAI({ apiKey, maxRetries: 0 });
        const response = await client.responses.create(
          {
            model: modelId,
            store: false,
            instructions,
            input: [
              { role: "user", content: [{ type: "input_text", text: JSON.stringify(payload) }] },
            ],
            text: {
              format: {
                type: "json_schema",
                name: "consultation_result",
                strict: true,
                schema: RESULT_JSON_SCHEMA as unknown as Record<string, unknown>,
              },
            },
          },
          { signal: AbortSignal.timeout(90_000) },
        );
        return response.output_text;
      };

      const validate = (raw: string): ConsultationAiResult | null => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return null;
        }
        const candidate = parsed as ConsultationAiResult;
        if (
          !candidate?.topSummary ||
          typeof candidate.personalizedSummary !== "string" ||
          typeof candidate.bodyAnalysis !== "string" ||
          !Array.isArray(candidate.nutrientGoals) ||
          !Array.isArray(candidate.nutrientRoles) ||
          !Array.isArray(candidate.foods) ||
          !Array.isArray(candidate.lifestyle) ||
          !Array.isArray(candidate.consultationSymptoms) ||
          !Array.isArray(candidate.sources) ||
          typeof candidate.medicalDisclaimer !== "string"
        ) {
          return null;
        }

        const approvedFoodKeys = new Set(
          evidence.foods.map((row) => `${row.food}|${row.servingSize}|${row.amount}`),
        );
        for (const row of candidate.foods) {
          if (!row?.food || !row.servingSize || !row.nutrient || !row.amount || !row.unit)
            return null;
          if (!allowedSourceIds.has(row.sourceId)) return null;
          if (!approvedFoodKeys.has(`${row.food}|${row.servingSize}|${row.amount}`)) return null;
        }

        const sourceIds = (candidate.sources as unknown as string[]).filter(
          (id) => typeof id === "string",
        );
        if (sourceIds.some((id) => !allowedSourceIds.has(id))) return null;

        const normalized: ConsultationAiResult = {
          ...candidate,
          sources: sourceIds.map((id) => {
            const source = evidence.sources.find((item) => item.id === id)!;
            return { label: source.label, url: source.url };
          }),
        };

        const text = [
          ...Object.values(normalized.topSummary),
          normalized.personalizedSummary,
          normalized.bodyAnalysis,
          ...normalized.nutrientGoals,
          ...normalized.nutrientRoles,
          ...normalized.lifestyle,
          ...normalized.consultationSymptoms,
        ].join(" ");
        if (BANNED_PATTERNS.some((pattern) => pattern.test(text))) return null;
        if (displayLength(normalized) > MAX_DISPLAY_CHARS) return null;
        return normalized;
      };

      let modelId = CONSULTATION_MODEL_ID;
      let lastFailure: GenerateConsultationResponse = { ok: false, errorCode: "FORMAT_INVALID" };

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const raw = await callModel(modelId);
          const validated = validate(raw);
          if (validated) {
            await finish("succeeded", modelId);
            // 성공: 응답 직전 재전송으로 유료 호출이 중복되지 않도록 짧은 완료 표시만 남긴다.
            lockDisposition = "finish";
            return { ok: true, result: validated };
          }
          lastFailure = { ok: false, errorCode: "FORMAT_INVALID" };
        } catch (error) {
          const status = (error as { status?: number })?.status;
          const name = (error as { name?: string })?.name;
          if (status === 404 || status === 400) {
            if (modelId !== CONSULTATION_FALLBACK_MODEL_ID) {
              modelId = CONSULTATION_FALLBACK_MODEL_ID;
              continue;
            }
          }
          lastFailure =
            name === "TimeoutError" || name === "APIConnectionTimeoutError"
              ? { ok: false, errorCode: "TIMEOUT" }
              : { ok: false, errorCode: "AI_UNAVAILABLE" };
          if (lastFailure.errorCode === "TIMEOUT") break;
        }
      }

      const errorCode = lastFailure.ok ? "SERVER_ERROR" : lastFailure.errorCode;
      const errorType =
        errorCode === "TIMEOUT"
          ? "timeout"
          : errorCode === "FORMAT_INVALID"
            ? "format_validation"
            : "external_ai";
      await finish("failed", modelId, errorType, errorCode);
      return lastFailure;
    } finally {
      // 성공·검증 실패·AI 실패·타임아웃·예외 등 모든 종료 경로에서 잠금 상태를 정리한다.
      if (lockDisposition === "finish") await finishRequestLock(lockKey, 15);
      else await releaseRequestLock(lockKey);
    }
  });
