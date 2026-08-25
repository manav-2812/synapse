import { describe, it, expect } from "vitest";
import { getTimeBlockConfig, extractFirstName } from "./timeBlock";
import { buildContextAwareSuggestions } from "../pages/Chat";
import type { DocumentResponse, DashboardResponse, FlashcardResponse } from "../types/api";

describe("timeBlock utility", () => {
  it("extracts clean first names from full_name and email", () => {
    expect(extractFirstName({ id: "1", email: "manav.baghel@example.com", full_name: "Manav Baghel" } as any)).toBe("Manav");
    expect(extractFirstName({ id: "2", email: "alex.smith@test.com", full_name: "" } as any)).toBe("Alex");
    expect(extractFirstName(null)).toBe("");
  });

  it("returns correct greeting and message across all 6 time blocks", () => {
    // Block 0 (00:00 - 03:59): Late night
    const t0 = getTimeBlockConfig(2, "Manav");
    expect(t0.block).toBe(0);
    expect(t0.part).toBe("evening");
    expect(t0.greeting).toBe("Working late, Manav");
    expect(t0.message).toContain("Quiet hours, deep focus, Manav");

    // Block 1 (04:00 - 07:59): Early morning
    const t1 = getTimeBlockConfig(6, "Manav");
    expect(t1.block).toBe(1);
    expect(t1.part).toBe("morning");
    expect(t1.message).toContain("Early start, Manav");

    // Block 2 (08:00 - 11:59): Morning peak focus
    const t2 = getTimeBlockConfig(10, "Manav");
    expect(t2.block).toBe(2);
    expect(t2.part).toBe("morning");
    expect(t2.message).toContain("Peak focus hours, Manav");

    // Block 3 (12:00 - 15:59): Midday review
    const t3 = getTimeBlockConfig(14, "Manav");
    expect(t3.block).toBe(3);
    expect(t3.part).toBe("afternoon");
    expect(t3.message).toContain("Midday review session, Manav");

    // Block 4 (16:00 - 19:59): Evening wrap-up
    const t4 = getTimeBlockConfig(18, "Manav");
    expect(t4.block).toBe(4);
    expect(t4.part).toBe("evening");
    expect(t4.message).toContain("Wrapping up today's topics, Manav");

    // Block 5 (20:00 - 23:59): Night deep-dive
    const t5 = getTimeBlockConfig(22, "Manav");
    expect(t5.block).toBe(5);
    expect(t5.part).toBe("evening");
    expect(t5.message).toContain("Evening deep-dive mode, Manav");
  });
});

describe("buildContextAwareSuggestions in Chat", () => {
  it("falls back to generic study cards when user has no uploaded documents", () => {
    const suggestions = buildContextAwareSuggestions([], null, []);
    expect(suggestions).toHaveLength(4);
    expect(suggestions[0].cmd).toBe("/summarize");
    expect(suggestions[1].cmd).toBe("/quiz");
    expect(suggestions[2].cmd).toBe("/explain");
    expect(suggestions[3].cmd).toBe("/compare");
    expect(suggestions[0].title).toBe("Executive Summary");
  });

  it("personalizes suggestions with real document names and compare actions", () => {
    const mockDocs: DocumentResponse[] = [
      {
        id: "d1",
        user_id: "u1",
        folder_id: null,
        filename: "compiler_design.pdf",
        original_filename: "Compiler Design Lecture 4.pdf",
        file_type: "pdf",
        file_size_bytes: 1024,
        processing_status: "completed",
        chunk_count: 12,
        page_count: 5,
        error_message: null,
        created_at: "2026-08-25T10:00:00Z",
      },
      {
        id: "d2",
        user_id: "u1",
        folder_id: null,
        filename: "computer_networks.pdf",
        original_filename: "Computer Networks Protocols.pdf",
        file_type: "pdf",
        file_size_bytes: 2048,
        processing_status: "completed",
        chunk_count: 8,
        page_count: 3,
        error_message: null,
        created_at: "2026-08-25T08:00:00Z",
      },
    ];

    const mockDashboard: DashboardResponse = {
      summary: {} as any,
      weekly_activity: { by_day: [], this_week_minutes: 0, last_week_minutes: 0 },
      metric_trends: {} as any,
      weak_topics: ["Lexical Analysis"],
      strong_topics: ["TCP Handshake"],
      recent_documents: [],
      recent_quizzes: [],
      topic_performance: [
        { topic: "Lexical Analysis", score: 60, quizzes: 4 },
        { topic: "TCP Handshake", score: 90, quizzes: 6 },
      ],
    };

    const mockDueCards: FlashcardResponse[] = [
      {
        id: "c1",
        document_id: "d1",
        front: "What is an LL(1) parsing table?",
        back: "A predictive top-down parsing table",
        repetitions: 1,
        ease_factor: 2.4,
        interval_days: 1,
        due_date: null,
        last_reviewed_at: null,
        is_due: true,
        created_at: "2026-08-25T10:00:00Z",
      },
    ];

    const suggestions = buildContextAwareSuggestions(mockDocs, mockDashboard, mockDueCards);
    expect(suggestions).toHaveLength(4);

    // 1. Summarize most recent doc
    expect(suggestions[0].cmd).toBe("/summarize");
    expect(suggestions[0].desc).toContain("Compiler Design Lecture 4");

    // 2. Compare top 2 docs
    expect(suggestions[1].cmd).toBe("/compare");
    expect(suggestions[1].desc).toContain("Compiler Design Lecture 4");
    expect(suggestions[1].desc).toContain("Computer Networks Protocols");

    // 3. Drill due cards
    expect(suggestions[2].cmd).toBe("/quiz");
    expect(suggestions[2].desc).toContain("due items");

    // 4. Explain with analogies on weak topic
    expect(suggestions[3].cmd).toBe("/explain");
    expect(suggestions[3].desc).toContain("Lexical Analysis");
  });
});
