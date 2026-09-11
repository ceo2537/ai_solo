import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { forwardRef, useEffect, useId, useRef, useState } from "react";

import logoAsset from "@/assets/logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { clearConsultation, saveConsultation } from "@/lib/consultation-memory";
import { generateConsultation } from "@/lib/consultation.functions";
import { buildInternalTestResult, useInternalTestMode } from "@/lib/internal-test-mode";


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
const BODY_PARTS = ["없음", "뇌·기억력", "눈", "갑상선·목", "심혈관", "간", "위·장", "신장·요로", "뼈·관절", "피부·모발", "면역·전신", "수면·스트레스"];
const MAX_DISEASES = 10;

type Errors = { gender?: string | undefined; birthDate?: string | undefined; height?: string | undefined; weight?: string | undefined; bodyParts?: string | undefined; consentPrivacy?: string | undefined; consentSensitive?: string | undefined };
const initialForm = { gender: "", birthDate: "", height: "", weight: "", diseases: [] as string[], bodyParts: [] as string[] };
const initialConsents = { privacy: false, sensitive: false };
const initialExpanded = { privacy: false, sensitive: false };

function Questionnaire() {
  const navigate = useNavigate();
  const requestConsultation = useServerFn(generateConsultation);
  const internalTest = useInternalTestMode();

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const baseId = useId();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<Errors>({});
  const [consents, setConsents] = useState(initialConsents);
  const [expanded, setExpanded] = useState(initialExpanded);
  const [dateResetKey, setDateResetKey] = useState(0);
  const genderRef = useRef<HTMLInputElement>(null);
  const birthDateRef = useRef<HTMLInputElement>(null);
  const heightRef = useRef<HTMLInputElement>(null);
  const weightRef = useRef<HTMLInputElement>(null);
  const bodyPartsSectionRef = useRef<HTMLElement>(null);
  const consentPrivacyRef = useRef<HTMLInputElement>(null);
  const consentSensitiveRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const invalid = isEmptyOrNone(form.bodyParts);
    if (!invalid && errors.bodyParts) {
      setErrors((prev) => ({ ...prev, bodyParts: undefined }));
    }
  }, [form.bodyParts, form.diseases, errors.bodyParts]);

  const toggleDisease = (name: string) => setForm((prev) => {
    if (prev.diseases.includes(name)) return { ...prev, diseases: prev.diseases.filter((item) => item !== name) };
    if (name === "없음") return { ...prev, diseases: ["없음"] };
    const selected = prev.diseases.filter((item) => item !== "없음");
    if (selected.length >= MAX_DISEASES) return prev;
    return { ...prev, diseases: [...selected, name] };
  });

  const toggleBodyPart = (name: string) => setForm((prev) => {
    if (prev.bodyParts.includes(name)) return { ...prev, bodyParts: prev.bodyParts.filter((item) => item !== name) };
    if (name === "없음") return { ...prev, bodyParts: ["없음"] };
    const selected = prev.bodyParts.filter((item) => item !== "없음");
    return { ...prev, bodyParts: [...selected, name] };
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitError(null);
    const next: Errors = {};
    if (!form.gender) next.gender = "성별을 선택해 주세요.";
    let age: number | null = null;
    if (!form.birthDate) next.birthDate = "생년월일을 입력해 주세요";
    else {
      age = computeAge(form.birthDate);
      if (age === null || age < 1 || age > 100) next.birthDate = "올바른 생년월일을 입력해 주세요.";
    }
    const height = Number(form.height);
    if (!form.height) next.height = "키를 입력해 주세요.";
    else if (!Number.isFinite(height) || height < 50 || height > 200) next.height = "정확한 키를 입력해주세요.";
    const weight = Number(form.weight);
    if (!form.weight) next.weight = "몸무게를 입력해 주세요.";
    else if (!Number.isFinite(weight) || weight < 30 || weight > 150) next.weight = "정확한 몸무게를 입력해주세요.";

    setErrors(next);
    const firstError = Object.keys(next)[0] as keyof Errors | undefined;
    if (firstError) {
      const refs: Record<keyof Errors, React.RefObject<HTMLElement | null> | undefined> = { gender: genderRef, birthDate: birthDateRef, height: heightRef, weight: weightRef, bodyParts: bodyPartsSectionRef, consentPrivacy: consentPrivacyRef, consentSensitive: consentSensitiveRef };
      refs[firstError]?.current?.focus();
      return;
    }
    if (isEmptyOrNone(form.bodyParts)) {
      setErrors((prev) => ({ ...prev, bodyParts: "하나 이상의 관심 건강분야를 선택해 주세요" }));
      bodyPartsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      bodyPartsSectionRef.current?.focus();
      return;
    }
    if (!consents.privacy) next.consentPrivacy = "개인정보 수집·이용에 동의해 주세요.";
    if (!consents.sensitive) next.consentSensitive = "민감정보 처리에 동의해 주세요.";
    if (next.consentPrivacy || next.consentSensitive) {
      setErrors(next);
      const consentFirst = Object.keys(next).find((key) => key === "consentPrivacy" || key === "consentSensitive") as "consentPrivacy" | "consentSensitive" | undefined;
      const consentRefs: Record<"consentPrivacy" | "consentSensitive", React.RefObject<HTMLInputElement | null>> = { consentPrivacy: consentPrivacyRef, consentSensitive: consentSensitiveRef };
      if (consentFirst) consentRefs[consentFirst]?.current?.focus();
      return;
    }
    if (internalTest) {
      // 서버 함수·외부 API·DB 기록 없이 승인된 근거 데이터만으로 결과를 구성한다.
      saveConsultation({ gender: form.gender, age: String(age), birthDate: form.birthDate, height: form.height, weight: form.weight, diseases: form.diseases, bodyParts: form.bodyParts, ai: buildInternalTestResult({ gender: form.gender, age: age as number, height: Number(form.height), weight: Number(form.weight), diseases: form.diseases, bodyParts: form.bodyParts }) });
      void navigate({ to: "/result" });
      return;
    }
    setSubmitting(true);
    void (async () => {

      try {
        const response = await requestConsultation({
          data: {
            gender: form.gender,
            birthDate: form.birthDate,
            height: Number(form.height),
            weight: Number(form.weight),
            diseases: form.diseases,
            bodyParts: form.bodyParts,
            consentPrivacy: true,
            consentSensitive: true,
            requestId:
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`,
          },
        });
        if (!response.ok) {
          const retryMinutes = Math.ceil((response.retryAfterSeconds ?? 60) / 60);
          setSubmitError(
            response.errorCode === "UNSUPPORTED_SCOPE"
              ? "선택하신 항목은 아직 근거 자료가 준비되지 않아 결과를 만들 수 없습니다. 다른 항목을 선택해 주세요."
              : response.errorCode === "RATE_LIMITED"
                ? `요청이 너무 많습니다. 약 ${retryMinutes}분 후에 다시 시도해 주세요.`
                : response.errorCode === "DUPLICATE_REQUEST"
                  ? "이미 처리 중인 요청이 있습니다. 잠시 후 다시 시도해 주세요."
                  : "결과를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
          );
          return;
        }
        saveConsultation({ gender: form.gender, age: String(age), birthDate: form.birthDate, height: form.height, weight: form.weight, diseases: form.diseases, bodyParts: form.bodyParts, ai: response.result });
        void navigate({ to: "/result" });
      } catch {
        setSubmitError("결과를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-[72px] max-w-[1120px] items-center px-5 sm:px-8"><Link to="/" onClick={() => clearConsultation()} className="focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><img src={logoAsset.url} alt="영양나침반 로고" className="h-12 w-12 object-contain sm:h-14 sm:w-14" /></Link></div>
      </header>
      <div className="mx-auto w-full max-w-[720px] px-4 py-10 sm:px-6 sm:py-16">
        <header className="text-center">
          <h1 className="text-[31px] font-extrabold leading-[1.2] text-foreground sm:text-[39px]">상담하실 내용을 알려주세요</h1>
          <p className="mt-3 text-lg leading-relaxed text-muted-foreground sm:text-base">입력하신 내용은 저장되지 않고 일회성으로 처리됩니다.</p>

        </header>
        <form onSubmit={handleSubmit} noValidate className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-brand sm:p-10">
          <FormSection>
            <fieldset>
              <legend className="text-lg font-semibold text-foreground">성별 <span className="text-lg font-semibold text-foreground">(필수)</span></legend>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {["남성", "여성"].map((gender, index) => {
                  const checked = form.gender === gender;
                  return <label key={gender} className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 text-lg ${checked ? "border-primary bg-primary font-semibold" : "border-border bg-background hover:bg-muted"} has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2`}>
                    <input ref={index === 0 ? genderRef : undefined} className="sr-only" type="radio" name="gender" value={gender} checked={checked} aria-invalid={!!errors.gender} onChange={() => { setForm((prev) => ({ ...prev, gender })); setErrors((prev) => ({ ...prev, gender: undefined })); }} />
                    {checked && <Check aria-hidden="true" className="size-4" />}{gender}
                  </label>;
                })}
              </div>
              {errors.gender && <ErrorMessage>{errors.gender}</ErrorMessage>}
            </fieldset>
            <div className="mt-7 grid grid-cols-2 gap-3">
              <DateField key={dateResetKey} id={`${baseId}-birthDate`} label="생년월일 (필수)" value={form.birthDate} error={errors.birthDate} inputRef={birthDateRef} onChange={(value) => { setForm((prev) => ({ ...prev, birthDate: value })); setErrors((prev) => ({ ...prev, birthDate: undefined })); }} />
              <NumberField id={`${baseId}-height`} label="키 (필수)" unit="cm" placeholder="예) 165" value={form.height} error={errors.height} inputRef={heightRef} inputMode="decimal" onChange={(value) => { setForm((prev) => ({ ...prev, height: value })); setErrors((prev) => ({ ...prev, height: undefined })); }} />
              <NumberField id={`${baseId}-weight`} label="몸무게 (필수)" unit="kg" placeholder="예) 60" value={form.weight} error={errors.weight} inputRef={weightRef} inputMode="decimal" onChange={(value) => { setForm((prev) => ({ ...prev, weight: value })); setErrors((prev) => ({ ...prev, weight: undefined })); }} />
            </div>
          </FormSection>
          <FormSection ref={bodyPartsSectionRef} title="관심 건강 분야">
            <fieldset><legend className="sr-only">관심 건강 분야</legend><div className="flex flex-wrap gap-2">{BODY_PARTS.map((item) => <ChipCheckbox key={item} label={item} checked={form.bodyParts.includes(item)} onChange={() => toggleBodyPart(item)} />)}</div></fieldset>
            {errors.bodyParts && <ErrorMessage>{errors.bodyParts}</ErrorMessage>}
          </FormSection>
          <FormSection title="현재의 질환">
            <fieldset><legend className="sr-only">현재의 질환</legend><div className="flex flex-wrap gap-2">{DISEASES.map((item) => <ChipCheckbox key={item} label={item} checked={form.diseases.includes(item)} disabled={item !== "없음" && !form.diseases.includes(item) && form.diseases.filter((disease) => disease !== "없음").length >= MAX_DISEASES} onChange={() => toggleDisease(item)} />)}</div></fieldset>
          </FormSection>
          <FormSection>
            <div className="space-y-5">
              <ConsentItem
                baseId={baseId}
                suffix="privacy"
                label="[필수] 개인정보 수집·이용에 동의합니다."
                checked={consents.privacy}
                expanded={expanded.privacy}
                error={errors.consentPrivacy}
                inputRef={consentPrivacyRef}
                onChange={() => { setConsents((prev) => ({ ...prev, privacy: !prev.privacy })); setErrors((prev) => ({ ...prev, consentPrivacy: undefined })); }}
                onToggle={() => setExpanded((prev) => ({ ...prev, privacy: !prev.privacy }))}
                title="1. 개인정보 수집·이용 안내"
                rows={[
                  ["수집 항목", "성별, 생년월일, 키, 몸무게"],
                  ["이용 목적", "나이 및 BMI 계산, 맞춤형 영양·생활정보 생성"],
                  ["보유·이용 기간", "결과 확인을 위한 현재 상담 중에만 처리하며, 상담 종료·페이지 새로고침·탭 종료 시 삭제"],
                  ["동의 거부", "동의를 거부할 수 있으나, 거부하면 맞춤 결과를 생성할 수 없습니다."],
                ]}
              />
              <ConsentItem
                baseId={baseId}
                suffix="sensitive"
                label="[필수] 민감정보 처리에 동의합니다."
                checked={consents.sensitive}
                expanded={expanded.sensitive}
                error={errors.consentSensitive}
                inputRef={consentSensitiveRef}
                onChange={() => { setConsents((prev) => ({ ...prev, sensitive: !prev.sensitive })); setErrors((prev) => ({ ...prev, consentSensitive: undefined })); }}
                onToggle={() => setExpanded((prev) => ({ ...prev, sensitive: !prev.sensitive }))}
                title="2. 민감정보 처리 안내"
                rows={[
                  ["처리 항목", "현재 질환, 관심 건강 분야 등 건강에 관한 정보"],
                  ["이용 목적", "선택한 건강 분야와 질환에 맞는 영양·생활정보 생성"],
                  ["보유·이용 기간", "결과 확인을 위한 현재 상담 중에만 처리하며, 상담 종료·페이지 새로고침·탭 종료 시 삭제"],
                  ["동의 거부", "동의를 거부할 수 있으나, 거부하면 해당 정보를 반영한 결과를 생성할 수 없습니다."],
                ]}
              />
            </div>
          </FormSection>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Button type="submit" disabled={submitting} className="text-[20px] sm:text-[24px]">{submitting ? "생성 중…" : "제출"}</Button>
            <Button type="button" variant="outline" disabled={submitting} className="text-[20px] sm:text-[24px]" onClick={() => { setForm(initialForm); setErrors({}); setConsents(initialConsents); setExpanded(initialExpanded); setSubmitError(null); setDateResetKey((k) => k + 1); }}>초기화</Button>
          </div>
          {submitError && <ErrorMessage>{submitError}</ErrorMessage>}
        </form>
      </div>
    </main>
  );
}

const FormSection = forwardRef<HTMLElement, { title?: string; required?: boolean; optional?: boolean; children: React.ReactNode }>(function FormSection({ title, required, optional, children }, ref) {
  return <section ref={ref} tabIndex={-1} className="border-b border-border py-7 first:pt-0 last:border-b-0 last:pb-0">{title && <h2 className="mb-4 text-base font-bold text-foreground">{title} {required && <Required />}{optional && <span className="text-sm font-semibold text-foreground">(중복선택 가능)</span>}</h2>}{children}</section>;
});
function Required() { return <span className="text-lg font-semibold text-foreground">(필수)</span>; }
function ErrorMessage({ children }: { children: React.ReactNode }) { return <p role="alert" className="mt-2 text-lg text-destructive">{children}</p>; }

function NumberField({ id, label, unit, placeholder, value, error, onChange, inputRef, inputMode }: { id: string; label: string; unit: string; placeholder: string; value: string; error?: string | undefined; onChange: (value: string) => void; inputRef?: React.RefObject<HTMLInputElement | null> | undefined; inputMode: "numeric" | "decimal" }) {
  return <div className="min-w-0"><label htmlFor={id} className="text-lg font-semibold text-foreground">{label}</label><div className="relative mt-2"><input ref={inputRef} id={id} type="text" inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} className="min-h-12 w-full rounded-lg border border-input bg-background px-4 pr-12 text-lg text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive" /><span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">{unit}</span></div>{error && <p id={`${id}-error`} role="alert" className="mt-2 text-lg text-destructive">{error}</p>}</div>;
}

function DateField({ id, label, value, error, onChange, inputRef }: { id: string; label: string; value: string; error?: string | undefined; onChange: (value: string) => void; inputRef?: React.RefObject<HTMLInputElement | null> | undefined }) {
  const [touched, setTouched] = useState(false);
  const showPrefix = !touched;
  return <div className="min-w-0"><label htmlFor={id} className="text-lg font-semibold text-foreground">{label}</label><div className="relative mt-2">{showPrefix && <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">예)</span>}<input ref={inputRef} id={id} type="date" value={value} onFocus={() => setTouched(true)} onChange={(event) => { setTouched(true); onChange(event.target.value); }} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} className={`min-h-12 w-full rounded-lg border border-input bg-background text-lg text-muted-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive ${showPrefix ? "pl-11 pr-4" : "px-4"}`} /></div>{error && <p id={`${id}-error`} role="alert" className="mt-2 text-lg text-destructive">{error}</p>}</div>;
}

function ChipCheckbox({ label, checked, disabled, onChange, inputRef }: { label: string; checked: boolean; disabled?: boolean | undefined; onChange: () => void; inputRef?: React.RefObject<HTMLInputElement | null> | undefined }) {
  return <label className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-4 text-lg ${checked ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted"} ${disabled ? "cursor-not-allowed opacity-60" : ""} has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2`}><input ref={inputRef} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="sr-only" />{checked && <Check aria-hidden="true" className="size-4" />}{label}</label>;
}

function ConsentItem({ baseId, suffix, label, checked, expanded, error, inputRef, onChange, onToggle, title, rows }: { baseId: string; suffix: string; label: string; checked: boolean; expanded: boolean; error?: string | undefined; inputRef?: React.RefObject<HTMLInputElement | null> | undefined; onChange: () => void; onToggle: () => void; title: string; rows: [string, string][] }) {
  const detailId = `${baseId}-${suffix}-detail`;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <ChipCheckbox label={label} checked={checked} onChange={onChange} inputRef={inputRef} />
        <button type="button" aria-expanded={expanded} aria-controls={detailId} onClick={onToggle} className="border-0 bg-transparent p-0 text-lg text-muted-foreground hover:text-foreground">(<span className="underline">내용</span>)</button>
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {expanded && (
        <div id={detailId} className="mt-3 rounded-lg border border-border bg-background p-4">
          <h3 className="mb-3 text-lg font-bold text-foreground">{title}</h3>
          <table className="w-full border-collapse text-lg">
            <thead>
              <tr className="border-b border-border">
                <th className="w-[30%] py-2 pr-3 text-left font-semibold text-foreground">구분</th>
                <th className="py-2 text-left font-semibold text-foreground">내용</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([category, content], index) => (
                <tr key={index} className="border-b border-border last:border-b-0">
                  <td className="min-w-0 py-2 pr-3 align-top font-medium text-foreground break-words">{category}</td>
                  <td className="min-w-0 py-2 align-top text-foreground break-words">{content}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function isEmptyOrNone(values: string[]) {
  return values.length === 0 || (values.length === 1 && values[0] === "없음");
}

function computeAge(birthDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birth = new Date(year, month - 1, day);
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (birth > today) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const birthdayThisYear = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
  if (today < birthdayThisYear) age -= 1;
  return age;
}
