import { BODY_PART_INFO, DISEASE_INFO, SOURCES, type SourceRef } from "@/lib/result-constants";

/** 서버 고정 승인 출처 목록. 클라이언트 입력은 신뢰하지 않는다. */
export const APPROVED_SOURCES: Record<string, SourceRef> = SOURCES;

export type ApprovedFood = {
  food: string;
  servingSize: string;
  nutrient: string;
  amount: string;
  unit: string;
  sourceId: string;
};

/**
 * 코드에 검증된 기준량/함량이 존재하는 식품만 등록한다.
 * 값 출처: NIH ODS 비타민 A (전문가용).
 */
export const APPROVED_FOODS: Record<string, ApprovedFood[]> = {
  눈: [
    { food: "소간, 팬에 구운 것", servingSize: "3온스(약 85g)", nutrient: "비타민 A", amount: "6,582", unit: "μg RAE", sourceId: "nihVitaminAPro" },
    { food: "고구마, 껍질째 구운 것", servingSize: "1개", nutrient: "비타민 A", amount: "1,403", unit: "μg RAE", sourceId: "nihVitaminAPro" },
    { food: "시금치, 냉동 후 삶은 것", servingSize: "1/2컵", nutrient: "비타민 A", amount: "573", unit: "μg RAE", sourceId: "nihVitaminAPro" },
    { food: "당근, 생것", servingSize: "1/2컵", nutrient: "비타민 A", amount: "459", unit: "μg RAE", sourceId: "nihVitaminAPro" },
    { food: "달걀, 완숙", servingSize: "큰 것 1개", nutrient: "비타민 A", amount: "75", unit: "μg RAE", sourceId: "nihVitaminAPro" },
  ],
};

/** 구조화된 근거 데이터가 준비된 범위 */
export const SUPPORTED_DISEASES = Object.keys(DISEASE_INFO);
export const SUPPORTED_BODY_PARTS = Object.keys(BODY_PART_INFO);

const SOURCE_ID_BY_URL = new Map<string, string>(
  Object.entries(SOURCES).map(([id, source]) => [source.url as string, id]),
);

export function sourceIdOf(source: SourceRef): string | null {
  return SOURCE_ID_BY_URL.get(source.url) ?? null;
}

export type EvidenceBundle = {
  sources: { id: string; label: string; url: string }[];
  diseases: { name: string; priorities: string[]; lifestyle: string[]; sourceIds: string[] }[];
  bodyParts: { name: string; goals: string[]; role: string; symptoms: string[]; sourceIds: string[] }[];
  foods: ApprovedFood[];
};

/** 선택된 질환/관심 분야에 필요한 승인 근거만 모아 반환한다. */
export function buildEvidence(diseases: string[], bodyParts: string[], isAdult: boolean): EvidenceBundle {
  const ids = new Set<string>(["kdri", "bmiKdca", isAdult ? "bmiPortal" : "childObesity"]);

  const diseaseEntries = diseases.map((name) => {
    const info = DISEASE_INFO[name]!;
    const sourceIds = info.sources.map(sourceIdOf).filter((id): id is string => !!id);
    sourceIds.forEach((id) => ids.add(id));
    return { name, priorities: info.priorities, lifestyle: info.lifestyle, sourceIds };
  });

  const bodyPartEntries = bodyParts.map((name) => {
    const info = BODY_PART_INFO[name]!;
    const sourceIds = info.sources.map(sourceIdOf).filter((id): id is string => !!id);
    sourceIds.forEach((id) => ids.add(id));
    return { name, goals: info.goals, role: info.role, symptoms: info.symptoms ?? [], sourceIds };
  });

  const foods = bodyParts.flatMap((name) => APPROVED_FOODS[name] ?? []);
  foods.forEach((row) => ids.add(row.sourceId));

  return {
    sources: [...ids].map((id) => ({ id, label: SOURCES[id as keyof typeof SOURCES].label, url: SOURCES[id as keyof typeof SOURCES].url })),
    diseases: diseaseEntries,
    bodyParts: bodyPartEntries,
    foods,
  };
}
