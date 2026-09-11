import { useEffect, useState } from "react";

import {
  APPROVED_FOODS,
  buildEvidence,
  PENDING_EVIDENCE as PENDING_EVIDENCE_TEXT,
  PENDING_LAB as PENDING_LAB_TEXT,
} from "@/lib/consultation-evidence";
import type { ConsultationAiResult } from "@/lib/consultation.functions";
import { bmiCategory, kdriAgeGroup } from "@/lib/result-constants";

/**
 * 내부 테스트 모드 판별은 이 파일 한 곳에서만 관리한다.
 * - 판별 근거는 브라우저의 호스트명뿐이며, 쿼리스트링·입력값·저장소로는 켤 수 없다.
 * - 정식 배포 도메인에서는 항상 false 이므로 기존 서버 함수/OpenAI 흐름이 그대로 사용된다.
 */
export function isInternalTestHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost")) return true;
  if (!host.endsWith(".lovable.app")) return false;
  const label = host.slice(0, host.length - ".lovable.app".length);
  return /^id-preview(-[a-z0-9]+)?--/.test(label) || /^project--/.test(label);
}

/** 하이드레이션 불일치 없이 내부 테스트 모드 여부를 읽는다. */
export function useInternalTestMode(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(isInternalTestHost());
  }, []);
  return enabled;
}

/** 승인된 근거가 없는 선택 항목에 사용하는 고정 문구 */
export const PENDING_EVIDENCE = PENDING_EVIDENCE_TEXT;
/** 검사 정보가 필요한 항목에 사용하는 고정 문구 */
export const PENDING_LAB = PENDING_LAB_TEXT;

/** 내부 테스트 경로에서 사용하는 결과 부제 */
export const EVIDENCE_SUBTITLE = "승인된 출처를 바탕으로 정리한 비의료 건강정보입니다.";

const BASE_GOALS = ["균형 잡힌 식사 구성", "총에너지", "식이섬유", "나트륨과 당류 살피기"];
const BASE_LIFESTYLE = ["일정한 시간에 규칙적으로 식사해 보세요."];

export type InternalTestInput = {
  gender: string;
  age: number;
  height: number;
  weight: number;
  diseases: string[];
  bodyParts: string[];
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

/**
 * 외부 API·서버 함수·DB 없이 승인된 근거 데이터만으로 결과를 구성한다.
 * 같은 입력에는 항상 같은 결과를 반환한다(순수 함수).
 */
export function buildInternalTestResult(input: InternalTestInput): ConsultationAiResult {
  const conditions = input.diseases.filter((item) => item !== "없음");
  const selectedParts = input.bodyParts.filter((item) => item !== "없음");

  const heightM = input.height / 100;
  const bmiValue = heightM > 0 ? input.weight / (heightM * heightM) : NaN;
  const bmi = Number.isFinite(bmiValue) ? bmiValue.toFixed(1) : "-";
  const isAdult = input.age >= 19;
  const weightStatus = Number.isFinite(bmiValue) && isAdult ? bmiCategory(bmiValue) : "2017 소아청소년 성장도표 기준 평가";
  const ageGroup = kdriAgeGroup(input.age);

  const evidence = buildEvidence(conditions, selectedParts, isAdult);
  const supportedParts = evidence.bodyParts.map((item) => item.name);
  const unsupported = evidence.unsupported;

  const nutrientGoals = unique([
    ...BASE_GOALS,
    ...evidence.bodyParts.flatMap((item) => item.goals),
    ...evidence.diseases.flatMap((item) => item.priorities),
    ...evidence.safetyHolds.map((item) => item.text),
    ...(unsupported.length ? [PENDING_EVIDENCE] : []),
  ]);

  const nutrientRoles = unique([
    ...evidence.bodyParts.map((item) => item.role),
    ...evidence.cautions.map((item) => item.text),
    ...evidence.safetyHolds.map((item) => item.text),
    ...unsupported.map(() => PENDING_EVIDENCE),
  ]);

  const foods = supportedParts.flatMap((item) => APPROVED_FOODS[item] ?? []);

  const lifestyle = unique([
    ...evidence.diseases.flatMap((item) => item.lifestyle),
    ...evidence.safetyHolds.map((item) => item.text),
    ...BASE_LIFESTYLE,
  ]);

  const consultationSymptoms = unique([
    ...evidence.bodyParts.flatMap((item) => item.symptoms),
    ...(conditions.length ? ["현재 질환이 있는 경우 식사 변경 전 담당 전문가와 상의해 주세요."] : []),
    ...unsupported.map(() => PENDING_EVIDENCE),
  ]);

  const summaryParts = [
    `${input.gender} · 만 ${input.age}세 · 키 ${input.height}cm · 몸무게 ${input.weight}kg 입력을 기준으로 정리했습니다.`,
    `2025 KDRI ${ageGroup} 연령군 기준을 적용했습니다.`,
    selectedParts.length ? `선택하신 관심 건강 분야: ${selectedParts.join(", ")}.` : "선택하신 관심 건강 분야가 없습니다.",
    conditions.length ? `선택하신 질환: ${conditions.join(", ")}.` : "선택하신 질환이 없습니다.",
    unsupported.length ? `${unsupported.join(", ")} 항목은 ${PENDING_EVIDENCE}` : "",
  ];

  return {
    topSummary: {
      bmi,
      weightStatus,
      nutrientGoals: nutrientGoals.join(" · "),
      foods: foods.length ? foods.map((row) => row.food).join(" · ") : "식품군을 고르게 구성해 보세요",
    },
    personalizedSummary: summaryParts.filter(Boolean).join(" "),
    bodyAnalysis: `BMI는 체중(kg) ÷ 키(m)² 로 계산합니다. 입력값 기준 BMI는 ${bmi}이며 체중 상태는 ${weightStatus}입니다.${isAdult ? "" : " 만 19세 미만은 성인 기준을 적용하지 않고 성장도표 기준의 별도 평가가 필요합니다."}`,
    nutrientGoals,
    nutrientRoles: nutrientRoles.length ? nutrientRoles : [PENDING_EVIDENCE],
    foods,
    lifestyle,
    consultationSymptoms: consultationSymptoms.length
      ? consultationSymptoms
      : ["평소와 다른 증상이 이어지면 의료 전문가와 상의해 주세요."],
    sources: evidence.sources.map((source) => ({ label: source.label, url: source.url })),
    medicalDisclaimer:
      "이 내용은 승인된 공공·학회 출처를 바탕으로 정리한 일반 건강정보이며 진단·치료를 대신하지 않습니다. 건강 상태에 대한 판단과 조치는 의료 전문가와 상담해 주세요.",
  };
}
