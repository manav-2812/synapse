import { request } from "./client";
import type { DashboardResponse, HeatmapDay, UsageResponse } from "../types/api";

export const analyticsApi = {
  dashboard(): Promise<DashboardResponse> {
    return request<DashboardResponse>("/analytics/dashboard");
  },
  usage(days = 30): Promise<UsageResponse> {
    return request<UsageResponse>(`/analytics/usage?days=${days}`);
  },
  heatmap(): Promise<HeatmapDay[]> {
    return request<HeatmapDay[]>("/analytics/heatmap");
  },
};
