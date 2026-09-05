import type { ConsultationAiResult } from "@/lib/consultation.functions";

export type ConsultationData = {
  gender: string;
  age: string;
  birthDate: string;
  height: string;
  weight: string;
  diseases: string[];
  bodyParts: string[];
  ai?: ConsultationAiResult;
};

let currentConsultation: ConsultationData | null = null;

export function saveConsultation(data: ConsultationData) {
  currentConsultation = {
    ...data,
    diseases: [...data.diseases],
    bodyParts: [...data.bodyParts],
  };
}

export function getConsultation() {
  return currentConsultation;
}

export function clearConsultation() {
  currentConsultation = null;
}
