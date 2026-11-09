/**
 * Skill tracking: sports and their frameworks, monthly assessments, progress, insights,
 * student photos and private report links.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, requestBlob } from './api';

export const RATING_LABELS = ['Beginner', 'Developing', 'Competent', 'Advanced', 'Excellent'];
/** 345 → "3.45"; 300 → "3.0". */
export const score = (x100: number) => (x100 / 100).toFixed(x100 % 10 === 0 ? 1 : 2);
export const ratingLabel = (x100: number) =>
  RATING_LABELS[Math.min(4, Math.max(0, Math.round(x100 / 100) - 1))]!;

export interface Skill {
  id: string;
  name: string;
  description: string | null;
  position: number;
  isActive: boolean;
}
export interface SkillArea {
  id: string;
  name: string;
  position: number;
  isActive: boolean;
  skills: Skill[];
}
export interface Level {
  id: string;
  name: string;
  minScore: number;
  position: number;
}
export interface Framework {
  sport: { id: string; name: string; isActive: boolean };
  areas: SkillArea[];
  levels: Level[];
}
export type SportListItem = Framework & { batches: number };

export interface AssessmentLite {
  id: string;
  month: string;
  average: number;
  levelName: string | null;
  comment: string | null;
  goals: string | null;
  updatedAt: string;
  ratings: Record<string, number>;
}
export interface SkillSheet {
  batch: { id: string; name: string; coachId: string };
  month: string;
  editable: boolean;
  framework: Framework;
  students: {
    id: string;
    fullName: string;
    code: string;
    hasPhoto: boolean;
    current: AssessmentLite | null;
    previous: AssessmentLite | null;
  }[];
}
export interface StudentSkills {
  framework: Framework;
  assessments: (AssessmentLite & {
    levelPosition: number | null;
    batchId: string;
    batchName: string;
    coachName: string;
  })[];
  current: {
    month: string;
    average: number;
    levelName: string | null;
    levelPosition: number | null;
    change: number | null;
  };
  areas: { id: string; name: string; now: number | null; before: number | null }[];
}
type Mover = {
  studentId: string;
  fullName: string;
  batchName: string;
  average: number;
  change: number;
  levelName: string | null;
  levelChange: number;
};
export interface SkillInsights {
  month: string;
  totals: {
    students: number;
    assessed: number;
    coverage: number | null;
    average: number | null;
    improved: number;
    declined: number;
    promoted: number;
    demoted: number;
  };
  coverage: {
    batchId: string;
    batchName: string;
    sportName: string;
    coachId: string;
    coachName: string;
    students: number;
    assessed: number;
    pending: { id: string; fullName: string }[];
  }[];
  heatmap: {
    batchId: string;
    batchName: string;
    sportName: string;
    assessed: number;
    areas: { areaId: string; name: string; average: number | null }[];
  }[];
  improved: Mover[];
  atRisk: Mover[];
  stale: { studentId: string; fullName: string; batchName: string; lastMonth: string | null }[];
  staleCount: number;
  levels: {
    sportId: string;
    sportName: string;
    levels: { name: string; n: number }[];
    unranked: number;
    promoted: number;
    demoted: number;
  }[];
  strongest: { skillId: string; name: string; area: string; average: number; n: number }[];
  weakest: { skillId: string; name: string; area: string; average: number; n: number }[];
  trend: { month: string; assessed: number; average: number | null }[];
  coaches: {
    coachId: string;
    name: string;
    students: number;
    assessed: number;
    averageGiven: number | null;
  }[];
}
export interface ReportLink {
  id: string;
  expiresAt: string;
  createdAt: string;
  views: number;
  lastViewedAt: string | null;
  createdBy: string | null;
}

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[][]) =>
    Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

// ─── Sports ──────────────────────────────────────────────────────────────────

export const useSports = () =>
  useQuery({
    queryKey: ['sports'],
    queryFn: ({ signal }) => api.get<SportListItem[]>('/sports', undefined, signal),
    staleTime: 60_000,
  });

export function useCreateSport() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (name: string) => api.post<Framework>('/sports', { name }),
    onSuccess: () => invalidate(['sports']),
  });
}

export function useUpdateSport() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; isActive?: boolean }) =>
      api.patch<Framework>(`/sports/${id}`, body),
    onSuccess: () => invalidate(['sports'], ['batches']),
  });
}

export interface FrameworkInput {
  areas: {
    id?: string;
    name: string;
    skills: { id?: string; name: string; description?: string | null }[];
  }[];
  levels: { name: string; minScore: number }[];
}

export function useSaveFramework() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: FrameworkInput & { id: string }) =>
      api.put<Framework>(`/sports/${id}/framework`, body),
    onSuccess: () => invalidate(['sports'], ['skills']),
  });
}

// ─── Assessments ─────────────────────────────────────────────────────────────

export const useSkillSheet = (batchId: string | undefined, month: string) =>
  useQuery({
    queryKey: ['skills', 'sheet', batchId, month],
    queryFn: ({ signal }) =>
      api.get<SkillSheet>(`/skills/batches/${batchId}`, { month: month.slice(0, 7) }, signal),
    enabled: !!batchId,
    placeholderData: keepPreviousData,
  });

export function useSaveAssessment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: {
      batchId: string;
      studentId: string;
      ratings: { skillId: string; rating: number }[];
      comment?: string | null;
      goals?: string | null;
    }) => api.put<AssessmentLite>('/skills/assessments', body),
    // The sheet, insights, the student's progress and the reminder count all change.
    onSuccess: () => invalidate(['skills'], ['me', 'tasks']),
  });
}

export const useStudentSkills = (id: string) =>
  useQuery({
    queryKey: ['skills', 'student', id],
    queryFn: ({ signal }) => api.get<StudentSkills[]>(`/skills/students/${id}`, undefined, signal),
  });

export const useSkillInsights = (month: string, batchId?: string) =>
  useQuery({
    queryKey: ['skills', 'insights', month, batchId ?? ''],
    queryFn: ({ signal }) =>
      api.get<SkillInsights>(
        '/skills/insights',
        { month: month.slice(0, 7), batchId: batchId || undefined },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

// ─── Photos ──────────────────────────────────────────────────────────────────

/** Object URL of a student's photo, or null when there is none. */
export function useStudentPhoto(id: string, enabled = true) {
  return useQuery({
    queryKey: ['students', id, 'photo'],
    queryFn: async () => {
      try {
        return URL.createObjectURL(await requestBlob(`/students/${id}/photo`));
      } catch {
        return null;
      }
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useSetStudentPhoto(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (data: string | null) =>
      data === null
        ? api.delete(`/students/${id}/photo`)
        : api.put(`/students/${id}/photo`, { data }),
    onSuccess: () => invalidate(['students', id, 'photo'], ['skills']),
  });
}

/** Resizes an image file on the device to a square-ish JPEG (≤ 512 px) as base64. */
export async function resizePhoto(file: File, max = 512): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

// ─── Report links ────────────────────────────────────────────────────────────

export const useReportLinks = (studentId: string, enabled = true) =>
  useQuery({
    queryKey: ['students', studentId, 'report-links'],
    queryFn: ({ signal }) =>
      api.get<ReportLink[]>(`/reports/students/${studentId}/links`, undefined, signal),
    enabled,
  });

export function useCreateReportLink(studentId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () =>
      api.post<{ id: string; url: string; expiresAt: string }>(
        `/reports/students/${studentId}/links`,
      ),
    onSuccess: () => invalidate(['students', studentId, 'report-links']),
  });
}

export function useRevokeReportLink(studentId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (linkId: string) => api.delete(`/reports/links/${linkId}`),
    onSuccess: () => invalidate(['students', studentId, 'report-links']),
  });
}
