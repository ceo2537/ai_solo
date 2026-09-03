import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { saveConsultation } from "@/lib/consultation-memory";

export const Route = createFileRoute("/questionnaire")({
  head: () => ({
    meta: [
      { title: "상담 정보 입력 — 영양나침반" },
      { name: "description", content: "결과를 만드는 데 필요한 건강 정보를 입력해 주세요." },
      { property: "og:title", content: "상담 정보 입력 — 영양나침반" },
      { property: "og:description", content: "결과를 만드는 데 필요한 건강 정보를 입력해 주세요." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Questionnaire,
});

const DISEASES = ["없음", "당뇨병", "이상지질혈증", "비만", "고혈압", "지방간", "관절·퇴행성 근골격질환", "골다공증·골감소증", "위염·위식도역류질환", "만성콩팥병", "통풍·고요산혈증"];
const BODY_PARTS = ["뇌·기억력", "눈", "갑상선·목", "심혈관", "간", "위·장", "신장·요로", "뼈·관절", "피부·모발", "면역·전신", "수면·스트레스"];
const MAX_DISEASES = 10;

type Errors = { gender?: string | undefined; age?: string | undefined; height?: string | undefined; weight?: string | undefined; bodyParts?: string | undefined };
const initialForm = { gender: "", age: "", height: "", weight: "", diseases: [] as string[], bodyParts: [] as string[] };

function Questionnaire() {
  const navigate = useNavigate();
  const baseId = useId();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<Errors>({});
  const genderRef = useRef<HTMLInputElement>(null);
  const ageRef = useRef<HTMLInputElement>(null);
  const heightRef = useRef<HTMLInputElement>(null);
  const weightRef = useRef<HTMLInputElement>(null);
  const bodyPartsRef = useRef<HTMLInputElement>(null);

  const toggleDisease = (name: string) => setForm((prev) => {
    if (prev.diseases.includes(name)) return { ...prev, diseases: prev.diseases.filter((item) => item !== name) };
    if (name === "없음") return { ...prev, diseases: ["없음"] };
    const selected = prev.diseases.filter((item) => item !== "없음");
    if (selected.length >= MAX_DISEASES) return prev;
    return { ...prev, diseases: [...selected, name] };
  });

  const toggleBodyPart = (name: string) => {
    setForm((prev) => ({ ...prev, bodyParts: prev.bodyParts.includes(name) ? prev.bodyParts.filter((item) => item !== name) : [...prev.bodyParts, name] }));
    setErrors((prev) => ({ ...prev, bodyParts: undefined }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const next: Errors = {};
    if (!form.gender) next.gender = "성별을 선택해 주세요.";
    const age = Number(form.age);
    if (!form.age) next.age = "나이를 입력해 주세요.";
    else if (!Number.isInteger(age) || age < 1 || age > 100) next.age = "정확한 나이를 입력해주세요.";
    const height = Number(form.height);
    if (!form.height) next.height = "키를 입력해 주세요.";
    else if (!Number.isFinite(height) || height < 50 || height > 200) next.height = "정확한 키를 입력해주세요.";
    const weight = Number(form.weight);
    if (!form.weight) next.weight = "몸무게를 입력해 주세요.";
    else if (!Number.isFinite(weight) || weight < 30 || weight > 150) next.weight = "정확한 몸무게를 입력해주세요.";
    if (form.bodyParts.length === 0) next.bodyParts = "관심 신체 부위를 한 개 이상 선택해 주세요.";
    setErrors(next);
    const firstError = Object.keys(next)[0] as keyof Errors | undefined;
    if (firstError) {
      const refs: Record<keyof Errors, React.RefObject<HTMLInputElement | null>> = { gender: genderRef, age: ageRef, height: heightRef, weight: weightRef, bodyParts: bodyPartsRef };
      refs[firstError].current?.focus();
      return;
    }
    saveConsultation({ gender: form.gender, age: form.age, height: form.height, weight: form.weight, diseases: form.diseases, bodyParts: form.bodyParts });
    void navigate({ to: "/result" });
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-[72px] max-w-[1120px] items-center px-5 sm:px-8"><span className="text-xl font-extrabold text-foreground">영양나침반</span></div>
      </header>
      <div className="mx-auto w-full max-w-[720px] px-4 py-10 sm:px-6 sm:py-16">
        <header className="text-center">
          <h1 className="text-[31px] font-extrabold leading-[1.2] text-foreground sm:text-[39px]">상담 정보 입력</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">결과를 만드는 데 필요한 내용만 입력해 주세요.</p>
        </header>
        <form onSubmit={handleSubmit} noValidate className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-brand sm:p-10">
          <FormSection title="기본정보">
            <fieldset>
              <legend className="text-sm font-semibold text-foreground">성별 <Required /></legend>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {["남성", "여성"].map((gender, index) => {
                  const checked = form.gender === gender;
                  return <label key={gender} className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 text-sm ${checked ? "border-primary bg-primary font-semibold" : "border-border bg-background hover:bg-muted"} has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2`}>
                    <input ref={index === 0 ? genderRef : undefined} className="sr-only" type="radio" name="gender" value={gender} checked={checked} aria-invalid={!!errors.gender} onChange={() => { setForm((prev) => ({ ...prev, gender })); setErrors((prev) => ({ ...prev, gender: undefined })); }} />
                    {checked && <Check aria-hidden="true" className="size-4" />}{gender}
                  </label>;
                })}
              </div>
              {errors.gender && <ErrorMessage>{errors.gender}</ErrorMessage>}
            </fieldset>
            <div className="mt-7 grid gap-6 md:grid-cols-3">
              <NumberField id={`${baseId}-age`} label="나이 (필수)" unit="세" placeholder="예) 40" value={form.age} error={errors.age} inputRef={ageRef} inputMode="numeric" onChange={(value) => { setForm((prev) => ({ ...prev, age: value })); setErrors((prev) => ({ ...prev, age: undefined })); }} />
              <NumberField id={`${baseId}-height`} label="키 (필수)" unit="cm" placeholder="예) 165" value={form.height} error={errors.height} inputRef={heightRef} inputMode="decimal" onChange={(value) => { setForm((prev) => ({ ...prev, height: value })); setErrors((prev) => ({ ...prev, height: undefined })); }} />
              <NumberField id={`${baseId}-weight`} label="몸무게 (필수)" unit="kg" placeholder="예) 60" value={form.weight} error={errors.weight} inputRef={weightRef} inputMode="decimal" onChange={(value) => { setForm((prev) => ({ ...prev, weight: value })); setErrors((prev) => ({ ...prev, weight: undefined })); }} />
            </div>
          </FormSection>
          <FormSection title="관심 건강 분야" required>
            <fieldset><legend className="sr-only">관심 건강 분야 (필수)</legend><div className="flex flex-wrap gap-2">{BODY_PARTS.map((item, index) => <ChipCheckbox key={item} label={item} checked={form.bodyParts.includes(item)} inputRef={index === 0 ? bodyPartsRef : undefined} onChange={() => toggleBodyPart(item)} />)}</div>{errors.bodyParts && <ErrorMessage>{errors.bodyParts}</ErrorMessage>}</fieldset>
          </FormSection>
          <FormSection title="현재의 질환" optional>
            <fieldset><legend className="sr-only">현재의 질환 (선택)</legend><div className="flex flex-wrap gap-2">{DISEASES.map((item) => <ChipCheckbox key={item} label={item} checked={form.diseases.includes(item)} disabled={item !== "없음" && !form.diseases.includes(item) && form.diseases.filter((disease) => disease !== "없음").length >= MAX_DISEASES} onChange={() => toggleDisease(item)} />)}</div></fieldset>
          </FormSection>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Button type="submit">제출</Button>
            <Button type="button" variant="outline" onClick={() => { setForm(initialForm); setErrors({}); }}>초기화</Button>
          </div>
        </form>
      </div>
    </main>
  );
}

function FormSection({ title, required, optional, children }: { title: string; required?: boolean; optional?: boolean; children: React.ReactNode }) {
  return <section className="border-b border-border py-7 first:pt-0 last:border-b-0 last:pb-0"><h2 className="mb-4 text-base font-bold text-foreground">{title} {required && <Required />}{optional && <span className="text-[13px] font-normal text-muted-foreground">(선택)</span>}</h2>{children}</section>;
}
function Required() { return <span className="text-[13px] font-normal text-ocean">(필수)</span>; }
function ErrorMessage({ children }: { children: React.ReactNode }) { return <p role="alert" className="mt-2 text-sm text-destructive">{children}</p>; }

function NumberField({ id, label, unit, placeholder, value, error, onChange, inputRef, inputMode }: { id: string; label: string; unit: string; placeholder: string; value: string; error?: string | undefined; onChange: (value: string) => void; inputRef?: React.RefObject<HTMLInputElement | null> | undefined; inputMode: "numeric" | "decimal" }) {
  return <div className="min-w-0"><label htmlFor={id} className="text-sm font-semibold text-foreground">{label}</label><div className="relative mt-2"><input ref={inputRef} id={id} type="text" inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} className="min-h-12 w-full rounded-lg border border-input bg-background px-4 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive" /><span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{unit}</span></div>{error && <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-destructive">{error}</p>}</div>;
}

function ChipCheckbox({ label, checked, disabled, onChange, inputRef }: { label: string; checked: boolean; disabled?: boolean | undefined; onChange: () => void; inputRef?: React.RefObject<HTMLInputElement | null> | undefined }) {
  return <label className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm ${checked ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted"} ${disabled ? "cursor-not-allowed opacity-60" : ""} has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2`}><input ref={inputRef} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="sr-only" />{checked && <Check aria-hidden="true" className="size-4" />}{label}</label>;
}

