import { useQuery } from "@tanstack/react-query";
import { departmentsApi } from "@/lib/api";

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: () => departmentsApi.list(),
    staleTime: 5 * 60 * 1000,
  });
}
