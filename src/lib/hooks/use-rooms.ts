import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { roomsApi } from "@/lib/api";
import type { Room } from "@/lib/types";

export function useRooms() {
  return useQuery({
    queryKey: ["rooms"],
    queryFn: () => roomsApi.list(),
  });
}

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => roomsApi.create(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
  });
}

export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; is_active?: boolean } }) =>
      roomsApi.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
  });
}

export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => roomsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
  });
}
