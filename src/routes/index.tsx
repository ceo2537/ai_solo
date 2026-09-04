import { createFileRoute, Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "영양나침반" },
      {
        name: "description",
        content: "간단히 묻고 자세히 알아가세요.",
      },
      { property: "og:title", content: "영양나침반" },
      {
        property: "og:description",
        content: "간단히 묻고 자세히 알아가세요.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <main className="min-h-screen bg-[#ffffff]">
      <section className="mx-auto flex min-h-screen max-w-[1120px] flex-col justify-center px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto flex w-full max-w-[720px] min-w-0 flex-col items-center">
          <h1 className="text-center text-[34px] font-extrabold leading-[1.2] text-[#111827] sm:text-[39px]">
            내 손안에 영양정보
          </h1>
          <p className="mt-5 text-center text-lg leading-[1.6] text-[#6b7280] sm:text-xl">
            간단히 묻고 자세히 알아보세요.
          </p>
          <div className="mt-5 h-px w-12 bg-[#7ed0b8]" aria-hidden="true" />

          <div className="mt-10 w-full rounded-2xl border border-[#e6e8ec] bg-[#f6f7f9] p-6 sm:p-8">
            <h2 className="text-[22px] font-extrabold leading-[1.3] text-[#1f6f8b] sm:text-[25px]">
              비의료정보 안내
            </h2>
            <p className="mt-4 text-base leading-[1.6] text-[#111827]">
              본 서비스는 질병의 진단, 치료, 예방, 정확한 복용량, 특정 제품 추천 등 의료적 판단을 대신하지 않습니다.
              건강 관련 결정은 반드시 의료 전문가와 상담하시기 바랍니다.
            </p>
          </div>

          <p className="mt-6 text-center text-sm leading-[1.6] text-[#6b7280] sm:text-base">
            상담내용은 저장되지 않고 일회성으로 처리됩니다.
          </p>

          <Button
            asChild
            size="lg"
            className="mt-8 w-full rounded-2xl bg-[#7ed0b8] px-5 py-3 text-[20px] text-[#111827] hover:bg-[#6fc2aa] focus-visible:ring-[#1f6f8b] sm:text-[24px]"
          >
            <Link to="/questionnaire"><Compass />상담 시작</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
