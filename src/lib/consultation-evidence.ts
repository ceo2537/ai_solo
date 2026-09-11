import { BODY_PART_INFO, DISEASE_INFO, SOURCES, type SourceRef } from "@/lib/result-constants";

/** 서버 고정 승인 출처 목록. 클라이언트 입력은 신뢰하지 않는다. */
export const APPROVED_SOURCES: Record<string, SourceRef> = SOURCES;

/** 승인된 근거 자료 자체가 없는 항목에 사용하는 고정 문구 */
export const PENDING_EVIDENCE = "판단 보류: 승인된 근거 자료가 준비되지 않았습니다.";
/** 검사 정보가 있어야 증감·제한을 확정할 수 있는 항목에 사용하는 고정 문구 */
export const PENDING_LAB = "판단 보류: 필요한 검사 정보가 없습니다.";

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

/**
 * 질환의 안전 제한이 관심 분야 규칙보다 우선한다.
 * 여기 등록된 조합에서는 해당 성분의 증감·제한을 확정하지 않는다.
 */
const SAFETY_GATES: {
  nutrients: string[];
  diseases: string[];
  bodyParts: string[];
  reason: string;
  sourceIds: string[];
}[] = [
  {
    nutrients: ["칼륨", "인", "단백질", "수분"],
    diseases: ["만성콩팥병"],
    bodyParts: ["신장·요로"],
    reason: "신장 기능과 검사 결과가 확인되지 않아 칼륨·인·단백질·수분의 증감이나 제한량을 확정하지 않습니다.",
    sourceIds: ["ckdKsn", "ckdKdca", "niddkCkdDiet"],
  },
];

export type EvidenceItem = { text: string; sourceIds: string[] };

export type EvidenceBundle = {
  sources: { id: string; label: string; url: string }[];
  diseases: { name: string; priorities: string[]; lifestyle: string[]; sourceIds: string[] }[];
  bodyParts: {
    name: string;
    goals: string[];
    role: string;
    symptoms: string[];
    cautions: string[];
    sourceIds: string[];
  }[];
  foods: ApprovedFood[];
  /** 안전 제한이 우선 적용되어 확정하지 않은 항목 */
  safetyHolds: EvidenceItem[];
  /** 검사 정보·진단 확인이 필요해 확정하지 않는 안내 */
  cautions: EvidenceItem[];
  /** 승인 근거가 없는 선택 항목 */
  unsupported: string[];
};

/** 선택된 질환/관심 분야에 필요한 승인 근거만 모아 반환한다. */
export function buildEvidence(diseases: string[], bodyParts: string[], isAdult: boolean): EvidenceBundle {
  const ids = new Set<string>(["kdri", "bmiKdca", isAdult ? "bmiPortal" : "childObesity"]);

  const known = (list: string[], table: Record<string, unknown>) => list.filter((name) => !!table[name]);
  const supportedDiseases = known(diseases, DISEASE_INFO);
  const supportedParts = known(bodyParts, BODY_PART_INFO);
  const unsupported = [
    ...diseases.filter((name) => !DISEASE_INFO[name]),
    ...bodyParts.filter((name) => !BODY_PART_INFO[name]),
  ];

  const diseaseEntries = supportedDiseases.map((name) => {
    const info = DISEASE_INFO[name]!;
    const sourceIds = info.sources.map(sourceIdOf).filter((id): id is string => !!id);
    sourceIds.forEach((id) => ids.add(id));
    return { name, priorities: info.priorities, lifestyle: info.lifestyle, sourceIds };
  });

  // 안전 제한 판정: 선택된 질환/관심 분야 조합에서 확정하지 않을 성분을 먼저 정한다.
  const gatedNutrients = new Set<string>();
  const safetyHolds: EvidenceItem[] = [];
  for (const gate of SAFETY_GATES) {
    const hit =
      gate.diseases.some((name) => supportedDiseases.includes(name)) ||
      gate.bodyParts.some((name) => supportedParts.includes(name));
    if (!hit) continue;
    gate.nutrients.forEach((nutrient) => gatedNutrients.add(nutrient));
    const sourceIds = gate.sourceIds.filter((id) => id in SOURCES);
    sourceIds.forEach((id) => ids.add(id));
    safetyHolds.push({ text: `${PENDING_LAB} ${gate.reason}`, sourceIds });
  }
  const isGated = (text: string) => [...gatedNutrients].some((nutrient) => text.includes(nutrient));

  const cautions: EvidenceItem[] = [];
  const bodyPartEntries = supportedParts.map((name) => {
    const info = BODY_PART_INFO[name]!;
    const sourceIds = info.sources.map(sourceIdOf).filter((id): id is string => !!id);
    sourceIds.forEach((id) => ids.add(id));
    // 질환 안전 제한에 걸린 성분은 관심 분야 목표에서 제외한다.
    const goals = info.goals.filter((goal) => !isGated(goal));
    (info.cautions ?? []).forEach((text) => cautions.push({ text: `${PENDING_LAB} ${text}`, sourceIds }));
    return { name, goals, role: info.role, symptoms: info.symptoms ?? [], cautions: info.cautions ?? [], sourceIds };
  });

  const foods = supportedParts.flatMap((name) => APPROVED_FOODS[name] ?? []);
  foods.forEach((row) => ids.add(row.sourceId));

  return {
    sources: [...ids].map((id) => ({ id, label: SOURCES[id as keyof typeof SOURCES].label, url: SOURCES[id as keyof typeof SOURCES].url })),
    diseases: diseaseEntries,
    bodyParts: bodyPartEntries,
    foods,
    safetyHolds,
    cautions,
    unsupported,
  };
}
