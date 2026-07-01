import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { meetingsApi } from "@/lib/api";
import type { Meeting, CreateMeetingInput, MeetingStatus } from "@/lib/types";

export function useMeetings(params?: { status?: MeetingStatus; department?: string; page?: number; perPage?: number }) {
  return useQuery({
    queryKey: ["meetings", params],
    queryFn: () => meetingsApi.list(params),
  });
}

export function useMeeting(id: string) {
  return useQuery({
    queryKey: ["meetings", id],
    queryFn: () => meetingsApi.get(id),
    enabled: !!id,
  });
}

export function useCreateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMeetingInput) => meetingsApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}

export function useUpdateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Meeting> }) =>
      meetingsApi.update(id, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
      qc.invalidateQueries({ queryKey: ["meetings", data.id] });
    },
  });
}

export function useDeleteMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => meetingsApi.remove(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: ["meetings", id] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}
