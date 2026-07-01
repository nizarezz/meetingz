import { useQuery } from "@tanstack/react-query";
import { roomsApi } from "@/lib/api";
import type { RoomConflict } from "@/lib/types";

export function useRoomConflictCheck({
  roomId,
  scheduledAt,
  scheduledDuration,
  excludeMeetingId,
  enabled,
}: {
  roomId: string | null;
  scheduledAt: string | null;
  scheduledDuration: number | null;
  excludeMeetingId?: string;
  enabled?: boolean;
}) {
  const canCheck = enabled !== false && !!roomId && !!scheduledAt && !!scheduledDuration && scheduledDuration > 0;

  return useQuery<RoomConflict[]>({
    queryKey: ["room-conflict", roomId, scheduledAt, scheduledDuration, excludeMeetingId],
    queryFn: () =>
      roomsApi.checkConflict({
        roomId: roomId!,
        scheduledAt: scheduledAt!,
        scheduledDuration: scheduledDuration!,
        excludeMeetingId,
      }),
    enabled: canCheck,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
}
