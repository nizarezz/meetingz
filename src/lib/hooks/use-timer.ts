import { useRef, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { timerApi } from "@/lib/api";

interface TimerData {
  is_running?: boolean;
  is_timer_running?: boolean;
  timer_started_at?: string | null;
  timer_item_started_at?: string | null;
  timer_base_total?: number;
  timer_base_item?: number;
}

export function computeElapsed(data: TimerData) {
  const now = Date.now();
  const baseTotal = data.timer_base_total ?? 0;
  const baseItem = data.timer_base_item ?? 0;

  if (!data.is_running && !data.is_timer_running) {
    return { total: baseTotal, item: baseItem };
  }

  let total = baseTotal;
  if (data.timer_started_at) {
    total += Math.floor((now - new Date(data.timer_started_at).getTime()) / 1000);
  }

  let item = baseItem;
  if (data.timer_item_started_at) {
    item += Math.floor((now - new Date(data.timer_item_started_at).getTime()) / 1000);
  }

  return { total, item };
}

export function useElapsedTime(data: TimerData | undefined | null) {
  const [elapsed, setElapsed] = useState(() => computeElapsed(data ?? {}));
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
  });

  useEffect(() => {
    if (!data?.is_running && !data?.is_timer_running) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setElapsed(computeElapsed(data ?? {}));
      return;
    }
    const tick = () => setElapsed(computeElapsed(dataRef.current ?? {}));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [data?.is_running, data?.is_timer_running]);

  return elapsed;
}

export function useTimer(meetingId: string) {
  return useQuery({
    queryKey: ["timer", meetingId],
    queryFn: () => timerApi.get(meetingId),
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

export function useEndTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meetingId: string) => timerApi.end(meetingId),
    onSuccess: (_, meetingId) => {
      qc.invalidateQueries({ queryKey: ["timer", meetingId] });
      qc.invalidateQueries({ queryKey: ["meetings", meetingId] });
    },
  });
}

export function useAddTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ meetingId, seconds }: { meetingId: string; seconds: number }) =>
      timerApi.addTime(meetingId, seconds),
    onSuccess: (_, { meetingId }) => {
      qc.invalidateQueries({ queryKey: ["timer", meetingId] });
    },
  });
}
