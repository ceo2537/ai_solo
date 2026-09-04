import { createFileRoute, Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "영양나침반" },
      {
        name: "description",
        content:
          "성별, 나이, 키, 몸무게, 질환과 관심 신체 부위를 바탕으로 영양성분과 생활습관 정보를 정리해 드립니다.",
      },
      { property: "og:title", content: "영양나침반" },
      {
        property: "og:description",
        content: "내 건강에 맞는 영양 방향을, 근거와 함께",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-[72px] max-w-[1120px] items-center px-5 sm:px-8">
          <span className="text-xl font-extrabold text-foreground">영양나침반</span>
        </div>
      </header>
      <section className="mx-auto flex min-h-[calc(100vh-72px)] max-w-[1120px] flex-col justify-center px-5 py-14 sm:px-8 lg:py-20">
        <div className="min-w-0">
          <h1 className="max-w-[680px] text-[36px] font-extrabold leading-[1.2] text-foreground sm:text-[39px] lg:text-[52px]">
            내 건강에 맞는
            <br />영양 방향을, 근거와 함께
          </h1>
          <p className="mt-7 max-w-[640px] text-base leading-[1.7] text-muted-foreground sm:text-xl">
            성별, 나이, 키, 몸무게, 질환과 관심 신체 부위를 바탕으로 영양성분과 생활습관 정보를 정리해 드립니다.
          </p>
          <Button asChild size="lg" className="mt-9 w-full sm:w-auto sm:min-w-60">
            <Link to="/questionnaire"><Compass />상담 시작</Link>
          </Button>
          <div className="mt-8 space-y-3 text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
            <p className="flex items-start gap-3">AI가 생성한 비의료 건강정보입니다.</p>
            <p className="flex items-start gap-3">입력한 내용은 외부 AI에 일회성으로 전달되며 상담 종료 후 남지 않습니다.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

