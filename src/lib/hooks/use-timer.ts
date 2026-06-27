import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { timerApi } from "@/lib/api";

export function useTimer(meetingId: string) {
  return useQuery({
    queryKey: ["timer", meetingId],
    queryFn: () => timerApi.get(meetingId),
    refetchInterval: 5000,
    enabled: !!meetingId,
  });
}

export function useStartTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meetingId: string) => timerApi.start(meetingId),
    onSuccess: (_, meetingId) => {
      qc.invalidateQueries({ queryKey: ["timer", meetingId] });
      qc.invalidateQueries({ queryKey: ["meetings", meetingId] });
    },
  });
}

export function usePauseTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meetingId: string) => timerApi.pause(meetingId),
    onSuccess: (_, meetingId) => {
      qc.invalidateQueries({ queryKey: ["timer", meetingId] });
    },
  });
}

export function useResumeTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meetingId: string) => timerApi.resume(meetingId),
    onSuccess: (_, meetingId) => {
      qc.invalidateQueries({ queryKey: ["timer", meetingId] });
    },
  });
}

export function useNextItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meetingId: string) => timerApi.next(meetingId),
    onSuccess: (_, meetingId) => {
      qc.invalidateQueries({ queryKey: ["timer", meetingId] });
    },
  });
}

export function useResetTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meetingId: string) => timerApi.reset(meetingId),
    onSuccess: (_, meetingId) => {
      qc.invalidateQueries({ queryKey: ["timer", meetingId] });
    },
  });
}
