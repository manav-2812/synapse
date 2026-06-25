import { request } from "./client";
import type { EvalRunResponse, RunEvalResponse } from "../types/api";

export const evalApi = {
  /** Run the full eval set through the real retrieval pipeline. */
  run(): Promise<RunEvalResponse> {
    return request<RunEvalResponse>("/eval/run", { method: "POST" });
  },
  /** Historical eval runs for the trends chart. */
  runs(): Promise<EvalRunResponse[]> {
    return request<EvalRunResponse[]>("/eval/runs");
  },
};
