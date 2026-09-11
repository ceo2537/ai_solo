import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useState } from "react";

import logoAsset from "@/assets/logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { clearConsultation, getConsultation, type ConsultationData } from "@/lib/consultation-memory";
import { EVIDENCE_SUBTITLE, useInternalTestMode } from "@/lib/internal-test-mode";
import { BODY_PART_INFO, DISEASE_INFO, FOOD_ROWS, SOURCES, bmiCategory, kdriAgeGroup, type FoodRow, type SourceRef } from "@/lib/result-constants";


export const Route = createFileRoute("/result")({
  head: () => ({
    meta: [
      { title: "맞춤 영양 안내 — 영양나침반" },
      { name: "description", content: "입력한 내용을 바탕으로 근거가 있는 영양·생활 정보를 안내합니다." },
      { property: "og:title", content: "맞춤 영양 안내 — 영양나침반" },
      { property: "og:description", content: "입력한 내용을 바탕으로 근거가 있는 영양·생활 정보를 안내합니다." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResultPage,
});

const BASE_GOALS = ["균형 잡힌 식사 구성", "총에너지", "식이섬유", "나트륨과 당류 살피기"];
const BASE_LIFESTYLE = [
  "일정한 시간에 규칙적으로 식사해 보세요.",
];

function ResultPage() {
  const navigate = useNavigate();
  const [data] = useState<ConsultationData | null>(() => getConsultation());
  const isInternalTest = useInternalTestMode();
  if (!data) return <ExpiredResult />;


  const conditions = data.diseases.filter((item) => item !== "없음");
  const interests = data.bodyParts.filter((item) => item !== "없음");
  const age = Number(data.age);
  const heightM = Number(data.height) / 100;
  const weightKg = Number(data.weight);
  const bmiValue = heightM > 0 ? weightKg / (heightM * heightM) : NaN;
  const bmi = Number.isFinite(bmiValue) ? bmiValue.toFixed(1) : "-";
  const isAdult = age >= 19;
  const weightStatus = Number.isFinite(bmiValue) && isAdult ? bmiCategory(bmiValue) : "2017 소아청소년 성장도표 기준 평가";
  const ageGroup = kdriAgeGroup(age);

  const ai = data.ai;
  const goals = ai?.nutrientGoals?.length
    ? unique(ai.nutrientGoals)
    : unique([
        ...BASE_GOALS,
        ...interests.flatMap((item) => BODY_PART_INFO[item]?.goals ?? []),
        ...conditions.flatMap((item) => DISEASE_INFO[item]?.priorities ?? []),
      ]);
  const roles = ai?.nutrientRoles?.length
    ? ai.nutrientRoles
    : interests.map((item) => BODY_PART_INFO[item]?.role).filter((item): item is string => !!item);
  const foods: FoodRow[] = ai
    ? ai.foods.map((row) => ({ food: row.food, amount: row.servingSize, nutrient: `${row.nutrient} ${row.amount} ${row.unit}` }))
    : unique(interests.flatMap((item) => FOOD_ROWS[item] ?? []).map((row) => JSON.stringify(row))).map((row) => JSON.parse(row) as FoodRow);
  const lifestyle = ai?.lifestyle?.length
    ? unique(ai.lifestyle)
    : unique([...conditions.flatMap((item) => DISEASE_INFO[item]?.lifestyle ?? []), ...BASE_LIFESTYLE]);
  const symptoms = ai?.consultationSymptoms?.length
    ? unique(ai.consultationSymptoms)
    : unique(interests.flatMap((item) => BODY_PART_INFO[item]?.symptoms ?? []));
  const sources = uniqueSources(
    ai?.sources?.length
      ? ai.sources
      : [
          SOURCES.kdri,
          SOURCES.bmiKdca,
          isAdult ? SOURCES.bmiPortal : SOURCES.childObesity,
          ...interests.flatMap((item) => BODY_PART_INFO[item]?.sources ?? []),
          ...conditions.flatMap((item) => DISEASE_INFO[item]?.sources ?? []),
        ],
  );

  const finish = () => {
    clearConsultation();
    void navigate({ to: "/" });
  };

  return (
    <main className="min-h-screen bg-[#ffffff]">
      <SiteHeader />
      <div className="mx-auto max-w-[960px] px-5 py-10 sm:px-8 sm:py-14">
        <h1 className="text-[31px] font-extrabold leading-[1.2] text-[#111827] sm:text-[39px]">맞춤 영양 안내</h1>
        <p className="mt-3 text-lg font-semibold text-[#1F7A86] sm:text-base">{isInternalTest ? EVIDENCE_SUBTITLE : "AI가 생성한 비의료 건강정보입니다."}</p>

        <div className="mt-2 flex flex-wrap gap-2">
          {conditions.length > 0 && <Badge>전문가 확인 필요</Badge>}
          {age <= 18 && <Badge>보호자와 의료전문가 확인이 필요합니다</Badge>}
        </div>

        <section className="mt-7 grid gap-3 sm:grid-cols-3" aria-label="요약 패널">
          <Panel title="BMI · 체중 상태" value={bmi}>{weightStatus}</Panel>
          <Panel title="주요 영양 목표">{goals.join(" · ")}</Panel>
          <Panel title="추천 식품">{foods.length ? foods.map((row) => row.food).join(" · ") : "식품군을 고르게 구성해 보세요"}</Panel>
        </section>

        <Section index={1} title="맞춤 결과 요약">
          <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-2 text-lg text-[#111827]">
            <dt className="text-[#6b7280]">성별·나이</dt><dd>{data.gender} · 만 {data.age}세</dd>
            <dt className="text-[#6b7280]">키·몸무게</dt><dd>{data.height}cm · {data.weight}kg</dd>
            <dt className="text-[#6b7280]">관심 건강 분야</dt><dd>{interests.length ? interests.join(", ") : "선택 없음"}</dd>
            <dt className="text-[#6b7280]">현재 질환</dt><dd>{conditions.length ? conditions.join(", ") : "없음"}</dd>
          </dl>
          <p className="mt-4 text-lg leading-relaxed text-[#6b7280]">
            {ai?.personalizedSummary ?? (
              <>
                입력하신 키·몸무게는 BMI와 전체 에너지 목표를 살펴보는 데에만 사용했습니다. 선택하신 항목에 해당하는 우선 평가 항목과 2025 KDRI {ageGroup} 연령군 기준을 함께 정리했습니다.
                {conditions.length > 0 && " 질환이 있는 경우 식사 변경 전 전문가와 상의해 주세요."}
              </>
            )}
          </p>
        </Section>

        <Section index={2} title="신체정보 분석">
          <p className="text-lg leading-relaxed text-[#6b7280]">{ai?.bodyAnalysis ?? "BMI는 키와 몸무게로 체격을 가늠하는 지표입니다. 계산식은 체중(kg) ÷ 키(m)²입니다."}</p>
          <p className="mt-3 text-lg text-[#111827]">계산된 BMI <strong>{bmi}</strong> · 체중 상태 <strong>{weightStatus}</strong></p>
          {!isAdult && <p className="mt-2 text-lg text-[#6b7280]">만 19세 미만은 성인 기준을 적용하지 않으며, 백분위수는 별도 평가가 필요합니다.</p>}
        </Section>

        <Section index={3} title="주요 영양 목표">
          <p className="text-lg text-[#6b7280]">적용한 2025 KDRI 연령군: {ageGroup}</p>
          <ul className="mt-3 flex flex-wrap gap-2">{goals.map((goal) => <li key={goal} className="rounded-lg bg-[#f6f7f9] px-3 py-1.5 text-lg text-[#111827]">{goal}</li>)}</ul>
        </Section>

        <Section index={4} title="이 영양성분이 필요한 이유">
          {roles.length ? <ul className="space-y-2 text-lg leading-relaxed text-[#6b7280]">{roles.map((role) => <li key={role}>{role}</li>)}</ul>
            : <p className="text-lg leading-relaxed text-[#6b7280]">영양소는 정상적인 신체 기능을 유지하는 데 관여합니다. 특정 성분에 치우치기보다 여러 식품군을 고르게 구성하는 것이 기본입니다.</p>}
        </Section>

        <Section index={5} title="음식으로 섭취하기">
          {foods.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-lg">
                <thead><tr className="border-b border-[#e6e8ec] text-left text-[#6b7280]"><th scope="col" className="py-2 pr-4 font-semibold">식품</th><th scope="col" className="py-2 pr-4 font-semibold">기준량</th><th scope="col" className="py-2 font-semibold">영양성분</th></tr></thead>
                <tbody>{foods.map((row) => <tr key={row.food} className="border-b border-[#e6e8ec] last:border-b-0 text-[#111827]"><td className="py-2 pr-4">{row.food}</td><td className="py-2 pr-4 text-[#6b7280]">{row.amount}</td><td className="py-2">{row.nutrient}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <p className="text-lg leading-relaxed text-[#6b7280]">곡류, 채소, 과일, 단백질 식품 등 여러 식품군을 고르게 포함한 식사를 우선해 보세요.</p>}
          {foods.length > 0 && (
            <div className="mt-3 space-y-2 text-lg leading-relaxed text-[#6b7280]">
              <p>기준량은 영양성분 함량을 나타내는 측정 단위이며 권장 섭취량이 아닙니다.</p>
              <p><a href={SOURCES.nihVitaminAPro.url} target="_blank" rel="noreferrer" className="text-[#1F7A86] underline-offset-4 hover:underline">{SOURCES.nihVitaminAPro.label}</a></p>
            </div>
          )}
        </Section>

        <Section index={6} title="함께 관리할 생활습관">
          <ul className="space-y-2 text-lg leading-relaxed text-[#6b7280]">{lifestyle.map((item) => <li key={item}>{item}</li>)}</ul>
        </Section>

        <Section index={7} title="전문가 상담이 필요한 증상">
          {symptoms.length ? <ul className="space-y-2 text-lg leading-relaxed text-[#6b7280]">{symptoms.map((item) => <li key={item}>{item}</li>)}</ul>
            : <p className="text-lg leading-relaxed text-[#6b7280]">평소와 다른 증상이 이어지면 의료 전문가와 상의해 주세요.</p>}
        </Section>

        <Section index={8} title="정보 출처">
          <p className="text-lg text-[#6b7280]">2025 KDRI 적용 연령군: {ageGroup}</p>
          <ul className="mt-3 space-y-2 text-lg">{sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer" className="text-[#1F7A86] underline-offset-4 hover:underline">{source.label}</a></li>)}</ul>
        </Section>

        <Section index={9} title="비의료정보 안내">
          <p className="text-lg leading-relaxed text-[#6b7280]">{ai?.medicalDisclaimer ?? "이 내용은 AI가 생성한 일반 건강정보이며 진단·치료를 대신하지 않습니다. 건강 상태에 대한 판단과 조치는 의료 전문가와 상담해 주세요."}</p>
        </Section>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Button onClick={finish} className="text-[20px] sm:text-[24px]">상담 종료</Button>
          <Button type="button" variant="outline" className="text-[20px] sm:text-[24px]" onClick={() => navigate({ to: "/questionnaire" })}><RefreshCw />다시 입력하기</Button>
        </div>
      </div>
    </main>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-lg bg-[#f6f7f9] px-3 py-1.5 text-lg font-semibold text-[#1F7A86]">{children}</span>;
}

function Panel({ title, value, children }: { title: string; value?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#e6e8ec] bg-[#f6f7f9] p-5">
      <h2 className="text-lg font-semibold text-[#6b7280]">{title}</h2>
      {value != null && <p className="mt-2 text-[28px] font-extrabold leading-none text-[#111827]">{value}</p>}
      <p className="mt-2 text-lg leading-relaxed text-[#111827]">{children}</p>
    </section>
  );
}

function Section({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[#e6e8ec] py-7">
      <h2 className="text-lg font-extrabold text-[#111827]"><span className="mr-2 text-[#7ED0B8]">{index}</span>{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SiteHeader() { return <header className="border-b border-[#e6e8ec]"><div className="mx-auto flex h-[72px] max-w-[1120px] items-center px-5 sm:px-8"><Link to="/" onClick={() => clearConsultation()} className="focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F7A86] focus-visible:ring-offset-2"><img src={logoAsset.url} alt="영양나침반 로고" className="h-12 w-12 object-contain sm:h-14 sm:w-14" /></Link></div></header>; }

function unique<T>(values: T[]) { return Array.from(new Set(values)); }
function uniqueSources(values: SourceRef[]) { const seen = new Set<string>(); return values.filter((item) => (seen.has(item.url) ? false : (seen.add(item.url), true))); }

function ExpiredResult() { return <main className="min-h-screen bg-[#ffffff]"><SiteHeader /><div className="mx-auto flex min-h-[calc(100vh-72px)] max-w-[720px] items-center px-5 py-12"><section className="w-full rounded-2xl border border-[#e6e8ec] bg-[#f6f7f9] p-7 text-center sm:p-12"><AlertCircle className="mx-auto size-8 text-[#1F7A86]" /><h1 className="mt-5 text-[31px] font-extrabold leading-[1.2] text-[#111827]">상담 정보가 만료되었습니다</h1><p className="mx-auto mt-3 max-w-md text-lg leading-relaxed text-[#6b7280] sm:text-base">문진 정보는 현재 상담 중에만 유지됩니다. 새 상담을 시작해 주세요.</p><Button asChild className="mt-7 w-full sm:w-auto"><Link to="/questionnaire">새 상담 시작</Link></Button></section></div></main>; }
