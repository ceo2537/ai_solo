export const SOURCES = {
  kdri: {
    label: "2025 한국인 영양소 섭취기준(KDRI) · 보건복지부·한국영양학회",
    url: "https://kns.or.kr/fileroom/fileroom_view.asp?BoardID=Kdr&idx=167",
  },
  bmiKdca: {
    label: "질병관리청 BMI 계산 기준",
    url: "https://www.kdca.go.kr/bbs/honam/143/227876/download.do",
  },
  bmiPortal: {
    label: "국가건강정보포털 비만 정보",
    url: "https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/gnrlzHealthInfoView.do?cntnts_sn=6774",
  },
  childObesity: {
    label: "국가건강정보포털 소아청소년 비만 기준(2017 성장도표)",
    url: "https://health.kdca.go.kr/healthinfo/biz/health/ntcnInfo/healthSourc/thtimtCntnts/thtimtCntntsView.do?thtimt_cntnts_sn=58",
  },
  nihVitaminAPro: {
    label: "NIH ODS 비타민 A (전문가용)",
    url: "https://ods.od.nih.gov/factsheets/VitaminA-HealthProfessional/",
  },
  nihVitaminAConsumer: {
    label: "NIH ODS 비타민 A (일반용)",
    url: "https://ods.od.nih.gov/factsheets/VitaminA-Consumer/",
  },
  nihList: {
    label: "NIH ODS 비타민·무기질 자료 목록",
    url: "https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/",
  },
  nei: {
    label: "NEI 연령관련 황반변성 정보",
    url: "https://www.nei.nih.gov/eye-health-information/eye-conditions-and-diseases/age-related-macular-degeneration",
  },
  diabetes: {
    label: "대한당뇨병학회 가이드",
    url: "https://diabetes.or.kr/bbs/?code=guide",
  },
  dyslipidemia: {
    label: "대한지질·동맥경화학회 가이드",
    url: "https://www.lipid.or.kr/reference/guideline.php?idx=1281&mode=view",
  },
  obesity: {
    label: "대한비만학회 가이드",
    url: "https://p.korscn.or.kr/main/sub.html?pageCode=38",
  },
  hypertension: {
    label: "대한고혈압학회 가이드",
    url: "https://www.koreanhypertension.org/reference/guide?idno=10446&mode=read",
  },
  fattyLiver: {
    label: "대한간학회 지방간 가이드",
    url: "https://www.kasl.org/bbs/skin/guide/pdf_inline.php?code=guide&number=17026",
  },
  musculoskeletal: {
    label: "질병관리청 관절·퇴행성 근골격질환 정보",
    url: "https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/gnrlzHealthInfoView.do?cntnts_sn=1988",
  },
  osteoporosis: {
    label: "대한골대사학회 가이드",
    url: "https://www.ksbmr.org/bbs/?code=guideline",
  },
  gerdPmc: {
    label: "PMC 위염·위식도역류질환 정보",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8521465/",
  },
  gerdKdca: {
    label: "질병관리청 위염·위식도역류질환 정보",
    url: "https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/gnrlzHealthInfoView.do?cntnts_sn=2057",
  },
  ckdKsn: {
    label: "대한신장학회 가이드",
    url: "https://ksn.or.kr/bbs/index.php?code=g_guideline&page=1",
  },
  ckdKdca: {
    label: "질병관리청 만성콩팥병 정보",
    url: "https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/gnrlzHealthInfoView.do?cntnts_sn=5457",
  },
  goutRheum: {
    label: "대한류마티스내과학회 통풍·고요산혈증 정보",
    url: "https://rheum.or.kr/m/board/view.html?code=issue&num=3009",
  },
  goutKdca: {
    label: "질병관리청 통풍·고요산혈증 정보",
    url: "https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/gnrlzHealthInfoView.do?cntnts_sn=6732",
  },
} as const;

export type SourceRef = { label: string; url: string };

export type DiseaseInfo = {
  priorities: string[];
  sources: SourceRef[];
  lifestyle: string[];
};

/** 질환별 우선 평가 항목(PRD). 링크는 등록된 공식 근거만 사용한다. */
export const DISEASE_INFO: Record<string, DiseaseInfo> = {
  당뇨병: {
    priorities: ["총에너지", "탄수화물 총량과 식사별 분배", "당류", "식이섬유", "포화지방", "식사 규칙성"],
    sources: [SOURCES.kdri, SOURCES.diabetes],
    lifestyle: ["일정한 시간에 식사하고 식사별 탄수화물 양을 고르게 나눠 보세요.", "당류가 많은 음료·간식의 빈도를 조절해 보세요."],
  },
  이상지질혈증: {
    priorities: ["총에너지", "포화지방과 트랜스지방", "콜레스테롤", "식이섬유", "당류", "알코올"],
    sources: [SOURCES.kdri, SOURCES.dyslipidemia],
    lifestyle: ["포화지방·트랜스지방이 많은 조리법 대신 삶기·굽기를 활용해 보세요.", "알코올 섭취 빈도를 줄여 보세요."],
  },
  비만: {
    priorities: ["총에너지", "에너지밀도", "단백질", "식이섬유", "식사패턴", "신체활동", "체중 변화"],
    sources: [SOURCES.kdri, SOURCES.bmiPortal, SOURCES.obesity],
    lifestyle: ["에너지밀도가 낮은 채소·통곡류 비중을 늘려 보세요.", "체중 변화를 주기적으로 기록하고 신체활동을 꾸준히 이어가 보세요."],
  },
  고혈압: {
    priorities: ["나트륨", "총에너지", "체중", "포화지방", "식이섬유", "알코올", "칼륨(조건부)"],
    sources: [SOURCES.kdri, SOURCES.hypertension],
    lifestyle: ["국물·가공식품의 나트륨 섭취 빈도를 살펴보세요.", "칼륨은 신장 기능·검사 결과에 따라 달라질 수 있어 전문가와 상의가 필요합니다."],
  },
  지방간: {
    priorities: ["총에너지", "체중과 감량 속도", "탄수화물", "당류", "포화지방", "알코올", "신체활동"],
    sources: [SOURCES.kdri, SOURCES.fattyLiver],
    lifestyle: ["급격한 체중 감량보다 완만한 변화를 목표로 해 보세요.", "알코올과 당류가 많은 음료를 줄여 보세요."],
  },
  "관절·퇴행성 근골격질환": {
    priorities: ["과체중 시 에너지 조절", "적정체중", "충분한 단백질", "균형식", "근력·신체활동"],
    sources: [SOURCES.kdri, SOURCES.musculoskeletal],
    lifestyle: ["관절 부담을 줄이도록 적정체중을 유지해 보세요.", "무리하지 않는 범위의 근력 활동을 이어가 보세요."],
  },
  "골다공증·골감소증": {
    priorities: ["칼슘", "비타민 D", "단백질", "과도한 나트륨·알코올", "체중부하운동"],
    sources: [SOURCES.kdri, SOURCES.nihList, SOURCES.osteoporosis],
    lifestyle: ["칼슘·비타민 D가 들어 있는 식품을 식사에 포함해 보세요.", "걷기 같은 체중부하운동을 규칙적으로 해 보세요."],
  },
  "위염·위식도역류질환": {
    priorities: ["한 끼 양", "식사 시간", "취침 전 음식", "지방", "카페인", "알코올", "개인별 유발음식", "체중"],
    sources: [SOURCES.kdri, SOURCES.gerdPmc, SOURCES.gerdKdca],
    lifestyle: ["한 끼 양을 조절하고 취침 직전 식사를 피해 보세요.", "본인에게 증상을 유발하는 음식을 기록해 보세요."],
  },
  만성콩팥병: {
    priorities: ["총에너지", "단백질", "나트륨", "칼륨", "인", "수분·체액 상태"],
    sources: [SOURCES.kdri, SOURCES.ckdKsn, SOURCES.ckdKdca],
    lifestyle: ["단백질·칼륨·인·수분은 검사 결과에 따라 달라지므로 임의로 늘리거나 줄이지 말고 전문가와 상의해 주세요."],
  },
  "통풍·고요산혈증": {
    priorities: ["총에너지", "체중과 감량 속도", "고퓨린 식품군", "알코올", "과당·당류", "수분"],
    sources: [SOURCES.kdri, SOURCES.goutRheum, SOURCES.goutKdca],
    lifestyle: ["알코올과 과당이 많은 음료의 빈도를 조절해 보세요.", "수분 섭취는 신장·심장 상태에 따라 달라질 수 있어 전문가와 상의해 주세요."],
  },
};

export type BodyPartInfo = {
  goals: string[];
  role: string;
  sources: SourceRef[];
  symptoms?: string[];
};

/** 관심 건강 분야별 안내. 눈만 PRD에 확정된 별도 근거를 갖는다. */
export const BODY_PART_INFO: Record<string, BodyPartInfo> = {
  눈: {
    goals: ["비타민 A", "균형 잡힌 식사 구성"],
    role: "비타민 A는 정상적인 시각 기능과 상피 조직의 유지에 관여하는 영양소입니다.",
    sources: [SOURCES.kdri, SOURCES.nihVitaminAPro, SOURCES.nihVitaminAConsumer, SOURCES.nei],
    symptoms: ["시야가 휘어 보이거나 가운데가 흐리게 보이는 변화가 있으면 안과 상담이 필요합니다."],
  },
};

export type FoodRow = { food: string; amount?: string; nutrient?: string };

/** 등록 출처에서 확인된 값만 표기한다. 확인되지 않은 함량·1회분량은 생략한다. */
export const FOOD_ROWS: Record<string, FoodRow[]> = {
  눈: [
    { food: "소간, 팬에 구운 것", amount: "3온스(약 85g)", nutrient: "비타민 A 6,582 μg RAE" },
    { food: "고구마, 껍질째 구운 것", amount: "1개", nutrient: "비타민 A 1,403 μg RAE" },
    { food: "시금치, 냉동 후 삶은 것", amount: "1/2컵", nutrient: "비타민 A 573 μg RAE" },
    { food: "당근, 생것", amount: "1/2컵", nutrient: "비타민 A 459 μg RAE" },
    { food: "달걀, 완숙", amount: "큰 것 1개", nutrient: "비타민 A 75 μg RAE" },
  ],
};

export const BMI_CATEGORIES: { max: number; label: string }[] = [
  { max: 18.5, label: "저체중" },
  { max: 23, label: "정상" },
  { max: 25, label: "비만 전 단계(과체중)" },
  { max: 30, label: "1단계 비만" },
  { max: 35, label: "2단계 비만" },
  { max: Infinity, label: "3단계 비만" },
];

export function bmiCategory(bmi: number) {
  return BMI_CATEGORIES.find((item) => bmi < item.max)?.label ?? "정상";
}

/** 2025 KDRI 연령군 표기 (숫자 권장량은 표시하지 않는다). */
export function kdriAgeGroup(age: number) {
  if (age <= 2) return "1~2세";
  if (age <= 5) return "3~5세";
  if (age <= 8) return "6~8세";
  if (age <= 11) return "9~11세";
  if (age <= 14) return "12~14세";
  if (age <= 18) return "15~18세";
  if (age <= 29) return "19~29세";
  if (age <= 49) return "30~49세";
  if (age <= 64) return "50~64세";
  if (age <= 74) return "65~74세";
  return "75세 이상";
}
