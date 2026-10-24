import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import { useFamily } from "@/app/session";
import type { Task, TaskComment, TaskStats } from "@/types/api";

export function useTasks(params: { status: string; assignee?: string; due?: string; limit?: number }) {
  const { f, familyId } = useFamily();
  return useQuery({ queryKey: ["tasks", familyId, params], queryFn: () => api<Task[]>(f("/tasks"), { query: params }), refetchInterval: 30_000 });
}

export function useTask(id: string | undefined) {
  const { f, familyId } = useFamily();
  return useQuery({ queryKey: ["task", familyId, id], queryFn: () => api<Task>(f(`/tasks/${id}`)), enabled: Boolean(id) });
}

export function useComments(id: string | undefined) {
  const { f, familyId } = useFamily();
  return useQuery({ queryKey: ["task-comments", familyId, id], queryFn: () => api<TaskComment[]>(f(`/tasks/${id}/comments`)), enabled: Boolean(id) });
}

export function useTaskStats() {
  const { f, familyId } = useFamily();
  return useQuery({ queryKey: ["task-stats", familyId], queryFn: () => api<TaskStats>(f("/tasks/stats")) });
}

export function useTasksInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all(["tasks", "task", "task-stats", "task-comments", "dashboard"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}
