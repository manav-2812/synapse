import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useDocumentPolling } from "./useDocumentPolling";

vi.mock("../api/documents", () => ({
  documentsApi: { status: vi.fn() },
}));

import { documentsApi } from "../api/documents";

describe("useDocumentPolling", () => {
  afterEach(() => vi.clearAllMocks());

  it("polls pending docs, reports status, and stops once completed", async () => {
    const status = documentsApi.status as unknown as ReturnType<typeof vi.fn>;
    status.mockResolvedValue({ processing_status: "completed" });
    const onStatus = vi.fn();

    renderHook(() =>
      useDocumentPolling([{ id: "d1", processing_status: "pending" } as never], onStatus),
    );

    await waitFor(() => expect(status).toHaveBeenCalledWith("d1"), { timeout: 5000 });
    await waitFor(() => expect(onStatus).toHaveBeenCalled(), { timeout: 5000 });
    // completed -> no further polling
    expect(status).toHaveBeenCalledTimes(1);
  });

  it("does not poll already-completed docs", async () => {
    const status = documentsApi.status as unknown as ReturnType<typeof vi.fn>;
    const onStatus = vi.fn();

    renderHook(() =>
      useDocumentPolling([{ id: "d2", processing_status: "completed" } as never], onStatus),
    );

    await new Promise((r) => setTimeout(r, 2500));
    expect(status).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();
  });
});
