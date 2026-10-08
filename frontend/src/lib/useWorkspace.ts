"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getJobs, type DashboardJob } from "./api";

const tokenKey = "job-automation-token";

export const loadAllJobs = async (token: string): Promise<DashboardJob[]> => {
  const jobs: DashboardJob[] = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= 20) {
    const result = await getJobs(token, { page, limit: 50, sortBy: "score" });
    if (!result.data) throw new Error("Job list was incomplete");
    jobs.push(...result.data.jobs);
    totalPages = result.data.pagination.totalPages;
    page += 1;
  }
  return jobs;
};

export const countApplications = async (token: string, status: string) => {
  const result = await getJobs(token, { applicationStatus: status, limit: 1, page: 1 });
  return result.data?.pagination.total ?? 0;
};

export function useWorkspace() {
  const router = useRouter();
  const [token, setToken] = useState<string>();
  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [discoveredAt, setDiscoveredAt] = useState<Date>();

  const reload = useCallback(async (storedToken: string) => {
    setJobs(await loadAllJobs(storedToken));
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem(tokenKey);
    if (!storedToken) {
      router.replace("/login");
      return;
    }
    setToken(storedToken);
    reload(storedToken)
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && /session|unauthorized|token/i.test(requestError.message)) {
          localStorage.removeItem(tokenKey);
          router.replace("/login");
          return;
        }
        setError(requestError instanceof Error ? requestError.message : "Unable to load jobs");
      })
      .finally(() => setLoading(false));
  }, [reload, router]);

  const signOut = () => {
    localStorage.removeItem(tokenKey);
    router.replace("/login");
  };

  return { token, jobs, loading, error, reload, discoveredAt, setDiscoveredAt, signOut };
}
