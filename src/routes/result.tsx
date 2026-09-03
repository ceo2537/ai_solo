import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, ClipboardList, ExternalLink, Leaf, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { clearConsultation, getConsultation, type ConsultationData } from "@/lib/consultation-memory";

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

const SOURCE_URL = "https://kns.or.kr/fileroom/fileroom_view.asp?BoardID=Kdr&idx=167";
const NUTRITION_GUIDANCE = [
  { title: "균형 있는 식사 구성", body: "곡류, 채소, 과일, 단백질 식품 등 여러 식품군을 고르게 구성하고 한 가지 성분에 치우치지 않는 식사를 우선해 보세요." },
  { title: "식품을 통한 영양 섭취", body: "영양소는 평소 식사에서 충분히 섭취하는 것을 기본으로 하고, 식품의 종류와 조리법을 다양하게 선택해 보세요." },
  { title: "나트륨과 당류 살피기", body: "가공식품의 영양표시를 확인하고 나트륨과 당류가 많은 식품의 섭취 빈도를 조절해 보세요." },
];
const LIFESTYLE_GUIDANCE = [
  { title: "규칙적인 식사", body: "일정한 시간대에 식사하고 과도한 결식이나 한 번에 많은 양을 먹는 습관을 피하는 것이 좋습니다." },
  { title: "수분과 신체 활동", body: "일상에서 물을 충분히 마시고 현재 건강 상태에 맞는 신체 활동을 꾸준히 이어가 보세요." },
  { title: "기록하며 조정하기", body: "식사와 생활습관을 간단히 기록하면 반복되는 패턴을 확인하고 실천 가능한 변화를 정하는 데 도움이 됩니다." },
];

function ResultPage() {
  const navigate = useNavigate();
  const [data] = useState<ConsultationData | null>(() => getConsultation());
  if (!data) return <ExpiredResult />;
  const conditions = data.diseases.filter((item) => item !== "없음");

  const finish = () => {
    clearConsultation();
    void navigate({ to: "/" });
  };

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-[1120px] px-4 py-10 sm:px-8 sm:py-14">
        <header className="max-w-[720px]">
          <h1 className="text-[31px] font-extrabold leading-[1.2] text-foreground sm:text-[39px]">맞춤 영양 안내</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">입력하신 내용과 승인된 근거를 바탕으로 지금 우선 확인할 영양·생활 가이드를 정리했습니다.</p>
        </header>

        <section className="mt-8 rounded-2xl bg-ocean p-5 text-accent-foreground sm:p-6" aria-label="비의료 건강정보 안내">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3"><AlertCircle className="mt-0.5 size-5 shrink-0" /><div><h2 className="font-bold">AI가 생성한 비의료 건강정보입니다.</h2><p className="mt-1 text-sm leading-relaxed opacity-90">질병의 진단, 치료, 처방을 대신하지 않습니다.</p>{conditions.length > 0 && <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-background/15 px-3 py-2 text-sm font-semibold"><ShieldCheck className="size-4" />전문가 확인 필요</p>}</div></div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <ResultCard icon={<ClipboardList />} title="입력 내용 요약">
            <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm"><dt className="text-muted-foreground">성별·나이</dt><dd>{data.gender} · {data.age}세</dd><dt className="text-muted-foreground">키·몸무게</dt><dd>{data.height}cm · {data.weight}kg</dd><dt className="text-muted-foreground">관심 부위</dt><dd>{data.bodyParts.join(", ")}</dd><dt className="text-muted-foreground">현재 질환</dt><dd>{conditions.length ? conditions.join(", ") : "없음"}</dd></dl>
          </ResultCard>
          <ResultCard icon={<CheckCircle2 />} title="우선 확인할 영양·생활 항목" accent>
            <ul className="space-y-3 text-sm leading-relaxed"><li><strong>균형 있는 식사:</strong> 여러 식품군을 고르게 구성하기</li><li><strong>표시 확인:</strong> 나트륨과 당류 섭취 빈도 살피기</li><li><strong>생활 리듬:</strong> 규칙적인 식사와 활동 이어가기</li></ul>
          </ResultCard>
        </div>

        <GuidanceSection title="영양성분 안내" items={NUTRITION_GUIDANCE} />
        <GuidanceSection title="생활습관 안내" items={LIFESTYLE_GUIDANCE} />

        <section className="mt-6 rounded-2xl border border-ocean bg-background p-5 sm:p-6" aria-labelledby="safety-title"><div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3"><ShieldCheck className="mt-0.5 size-5 text-ocean" /><div><h2 id="safety-title" className="font-bold text-ocean">안전 안내</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">이 안내는 진단·치료·예방 또는 개인별 치료 목적의 정확한 섭취량을 제공하지 않습니다. 질환이 있거나 치료 중이라면 식사나 생활습관을 변경하기 전에 의사, 임상영양사 등 전문가와 상의해 주세요.</p></div></div></section>

        <div className="mt-8 grid gap-3 sm:grid-cols-2"><Button onClick={finish}>상담 종료</Button><Button type="button" variant="outline"><RefreshCw />같은 내용으로 다시 생성</Button></div>
      </div>
    </main>
  );
}

function SiteHeader() { return <header className="border-b border-border"><div className="mx-auto flex h-[72px] max-w-[1120px] items-center px-5 sm:px-8"><span className="text-xl font-extrabold text-foreground">영양나침반</span></div></header>; }

function ResultCard({ icon, title, accent, children }: { icon: React.ReactNode; title: string; accent?: boolean; children: React.ReactNode }) { return <section className={`rounded-2xl border p-5 shadow-brand sm:p-6 ${accent ? "border-primary bg-primary/10" : "border-border bg-card"}`}><h2 className="flex items-center gap-2 font-bold text-foreground"><span className="text-ocean [&_svg]:size-5">{icon}</span>{title}</h2><div className="mt-5">{children}</div></section>; }

function GuidanceSection({ title, items }: { title: string; items: { title: string; body: string }[] }) { return <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-brand sm:p-7"><h2 className="flex items-center gap-2 text-xl font-extrabold text-foreground"><Leaf className="size-5 text-ocean" />{title}</h2><div className="mt-5 divide-y divide-border">{items.map((item) => <article key={item.title} className="py-5 first:pt-0 last:pb-0"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-5"><div><h3 className="font-bold text-foreground">{item.title}</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p></div><a href={SOURCE_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-ocean underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span>출처</span><ExternalLink className="size-4" /></a></div></article>)}</div></section>; }

function ExpiredResult() { return <main className="min-h-screen bg-background"><SiteHeader /><div className="mx-auto flex min-h-[calc(100vh-72px)] max-w-[720px] items-center px-5 py-12"><section className="w-full rounded-2xl border border-border bg-card p-7 text-center shadow-brand sm:p-12"><AlertCircle className="mx-auto size-8 text-ocean" /><h1 className="mt-5 text-[31px] font-extrabold leading-[1.2] text-foreground">상담 정보가 만료되었습니다</h1><p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">문진 정보는 현재 상담 중에만 유지됩니다. 새 상담을 시작해 주세요.</p><Button asChild className="mt-7 w-full sm:w-auto"><Link to="/questionnaire">새 상담 시작</Link></Button></section></div></main>; }
