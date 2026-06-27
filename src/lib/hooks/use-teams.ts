import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { teamsApi } from "@/lib/api";

export function useTeam() {
  return useQuery({
    queryKey: ["team"],
    queryFn: () => teamsApi.get(),
    retry: false,
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => teamsApi.update(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
    },
  });
}
