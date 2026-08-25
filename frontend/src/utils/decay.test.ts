import { describe, it, expect } from "vitest";
import { computeFlashcardDecay, groupFlashcardsByTopic, type RawFlashcard } from "./decay";

describe("Decay & Retention Telemetry Utility", () => {
  const baseTime = new Date("2026-08-25T12:00:00Z").getTime();

  it("produces distinctly different decay percentages for cards with different review histories", () => {
    // Card A: High ease factor, long interval, reviewed recently (1 day ago)
    const cardA: RawFlashcard = {
      id: "card-a",
      front: "Software Requirements Specification (SRS)",
      ease_factor: 2.8,
      interval_days: 14,
      repetitions: 4,
      last_reviewed_at: new Date("2026-08-24T12:00:00Z").toISOString(), // 1 day ago
    };

    // Card B: Medium ease factor, shorter interval, reviewed 4 days ago
    const cardB: RawFlashcard = {
      id: "card-b",
      front: "Scenario Analysis & User Persona Modeling",
      ease_factor: 2.3,
      interval_days: 6,
      repetitions: 2,
      last_reviewed_at: new Date("2026-08-21T12:00:00Z").toISOString(), // 4 days ago
    };

    // Card C: Low ease factor, lapsed/short interval, reviewed 8 days ago
    const cardC: RawFlashcard = {
      id: "card-c",
      front: "Form and Data Analysis Normalization Forms",
      ease_factor: 1.6,
      interval_days: 1,
      repetitions: 1,
      last_reviewed_at: new Date("2026-08-17T12:00:00Z").toISOString(), // 8 days ago
    };

    const evalA = computeFlashcardDecay(cardA, baseTime);
    const evalB = computeFlashcardDecay(cardB, baseTime);
    const evalC = computeFlashcardDecay(cardC, baseTime);

    // Card A should have high retention and long stability
    expect(evalA.stabilityDays).toBeGreaterThan(10);
    expect(evalA.retention).toBeGreaterThan(90);

    // Card B should have moderate retention
    expect(evalB.stabilityDays).toBeLessThan(evalA.stabilityDays);
    expect(evalB.retention).toBeLessThan(evalA.retention);
    expect(evalB.retention).toBeGreaterThan(evalC.retention);

    // Card C should have significant decay / low retention
    expect(evalC.stabilityDays).toBeLessThan(1.0);
    expect(evalC.retention).toBeLessThan(30);

    // Assert that all three retention percentages are strictly non-identical
    const uniqueRetentions = new Set([evalA.retention, evalB.retention, evalC.retention]);
    expect(uniqueRetentions.size).toBe(3);

    // Assert that reasons reflect actual distinct EF and stability
    expect(evalA.reason).toContain("EF 2.8");
    expect(evalB.reason).toContain("EF 2.3");
    expect(evalC.reason).toContain("EF 1.6");
  });

  it("handles unreviewed newly-created cards correctly", () => {
    const unreviewedCard: RawFlashcard = {
      id: "card-new",
      front: "New Concept Not Yet Studied",
      ease_factor: 2.5,
      interval_days: 0,
      repetitions: 0,
      last_reviewed_at: null,
      created_at: new Date("2026-08-23T12:00:00Z").toISOString(), // 2 days ago
    };

    const evalNew = computeFlashcardDecay(unreviewedCard, baseTime);
    expect(evalNew.repetitions).toBe(0);
    expect(evalNew.reason).toContain("Never reviewed");
    expect(evalNew.retention).toBeLessThan(50);
  });

  it("correctly groups flashcards by topic and computes per-topic aggregate decay", () => {
    const docMap = {
      "doc-1": "Software Engineering SRS",
      "doc-2": "Discrete Mathematics",
    };

    const cards: RawFlashcard[] = [
      {
        id: "1",
        front: "SRS Requirement Verification",
        document_id: "doc-1",
        ease_factor: 2.6,
        interval_days: 10,
        repetitions: 3,
        last_reviewed_at: new Date("2026-08-24T12:00:00Z").toISOString(),
      },
      {
        id: "2",
        front: "SRS Validation Metrics",
        document_id: "doc-1",
        ease_factor: 2.7,
        interval_days: 12,
        repetitions: 4,
        last_reviewed_at: new Date("2026-08-24T12:00:00Z").toISOString(),
      },
      {
        id: "3",
        front: "Graph Isomorphism Definition",
        document_id: "doc-2",
        ease_factor: 1.8,
        interval_days: 2,
        repetitions: 1,
        last_reviewed_at: new Date("2026-08-20T12:00:00Z").toISOString(),
      },
    ];

    const topicGroups = groupFlashcardsByTopic(cards, docMap, baseTime);
    expect(topicGroups.length).toBe(2);

    const srsGroup = topicGroups.find((g) => g.topicId === "doc-1");
    const mathGroup = topicGroups.find((g) => g.topicId === "doc-2");

    expect(srsGroup).toBeDefined();
    expect(mathGroup).toBeDefined();

    expect(srsGroup?.cardCount).toBe(2);
    expect(mathGroup?.cardCount).toBe(1);

    expect(srsGroup?.topicName).toBe("Software Engineering SRS");
    expect(mathGroup?.topicName).toBe("Discrete Mathematics");

    // Math group reviewed 5 days ago with lower stability should have lower retention than SRS group reviewed 1 day ago
    expect(mathGroup!.avgRetention).toBeLessThan(srsGroup!.avgRetention);
  });
});
