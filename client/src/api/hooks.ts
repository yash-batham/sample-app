import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type {
  Court,
  DashboardOverview,
  LiveNotification,
  Match,
  MatchFormatPreset,
  MatchStage,
  MatchStatus,
  Pool,
  PoolStandings,
  SettingsData,
  StageStandings,
  Team,
} from "../types";

export function usePools() {
  return useQuery({
    queryKey: ["pools"],
    queryFn: async () => (await api.get<Pool[]>("/api/pools")).data,
  });
}

export function useCourts() {
  return useQuery({
    queryKey: ["courts"],
    queryFn: async () => (await api.get<Court[]>("/api/courts")).data,
  });
}

export function useTeams(params?: { pool_id?: number | string; search?: string }) {
  return useQuery({
    queryKey: ["teams", params],
    queryFn: async () => (await api.get<Team[]>("/api/teams", { params })).data,
  });
}

export function useTeam(teamId: number | string | undefined) {
  return useQuery({
    queryKey: ["teams", teamId],
    queryFn: async () => (await api.get<Team>(`/api/teams/${teamId}`)).data,
    enabled: !!teamId,
  });
}

export function useMatches(
  params?: {
    status?: MatchStatus;
    pool_id?: number | string;
    court_id?: number | string;
    stage?: MatchStage;
    search?: string;
  },
  options?: { refetchInterval?: number }
) {
  return useQuery({
    queryKey: ["matches", params],
    queryFn: async () => (await api.get<Match[]>("/api/matches", { params })).data,
    refetchInterval: options?.refetchInterval,
  });
}

export function useMatch(matchId: number | string | undefined, options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: ["matches", matchId],
    queryFn: async () => (await api.get<Match>(`/api/matches/${matchId}`)).data,
    enabled: !!matchId,
    refetchInterval: options?.refetchInterval,
  });
}

export function useStandings() {
  return useQuery({
    queryKey: ["standings"],
    queryFn: async () => (await api.get<PoolStandings[]>("/api/standings/pools")).data,
  });
}

export function useSuper4Standings() {
  return useQuery({
    queryKey: ["standings-super4"],
    queryFn: async () => (await api.get<StageStandings>("/api/standings/super4")).data,
  });
}

export function useDashboardOverview() {
  return useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: async () => (await api.get<DashboardOverview>("/api/dashboard/overview")).data,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.get<SettingsData>("/api/settings")).data,
  });
}

export function useStaffList() {
  return useQuery({
    queryKey: ["staff"],
    queryFn: async () => (await api.get("/api/staff")).data,
  });
}

export function useMatchFormats() {
  return useQuery({
    queryKey: ["match-formats"],
    queryFn: async () => (await api.get<MatchFormatPreset[]>("/api/match-formats")).data,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get<LiveNotification[]>("/api/notifications")).data,
  });
}
