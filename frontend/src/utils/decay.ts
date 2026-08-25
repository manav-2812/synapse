/**
 * Ebbinghaus Memory Decay & Retention Telemetry Utility
 *
 * Implements cognitive decay formula:
 *   R(t) = e^(-t / S)
 * where:
 *   t = elapsed time since last review (in days)
 *   S = memory stability in days = max(0.5, interval_days * (ease_factor / 2.5))
 */

export interface RawFlashcard {
  id: string;
  front: string;
  back?: string;
  ease_factor?: number;
  interval_days?: number;
  repetitions?: number;
  last_reviewed_at?: string | null;
  created_at?: string;
  document_id?: string | null;
  is_due?: boolean;
}

export interface EvaluatedDecay {
  id: string;
  name: string;
  documentId?: string | null;
  retention: number; // 5 - 100 (%)
  stabilityDays: number;
  daysSinceReview: number;
  easeFactor: number;
  repetitions: number;
  reason: string;
  isDue: boolean;
}

export interface TopicDecayGroup {
  topicId: string;
  topicName: string;
  cardCount: number;
  avgRetention: number;
  avgStabilityDays: number;
  avgEaseFactor: number;
  avgRepetitions: number;
  daysSinceReview: number;
  reason: string;
  cards: EvaluatedDecay[];
}

export function cleanConceptTitle(str: string, maxLen = 38): string {
  if (!str) return "Flashcard Concept";
  const cleaned = str.replace(/[#*`_]/g, "").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1) + "…";
}

/**
 * Calculates real Ebbinghaus decay metrics for an individual flashcard row.
 */
export function computeFlashcardDecay(
  card: RawFlashcard,
  nowTime: number = Date.now(),
): EvaluatedDecay {
  const ef = typeof card.ease_factor === "number" && !isNaN(card.ease_factor) && card.ease_factor >= 1.3
    ? card.ease_factor
    : 2.5;

  const interval = typeof card.interval_days === "number" && !isNaN(card.interval_days) && card.interval_days >= 0
    ? card.interval_days
    : 1;

  const reps = typeof card.repetitions === "number" && !isNaN(card.repetitions)
    ? card.repetitions
    : 0;

  // Reference timestamp: last review or initial card creation
  const refDateStr = card.last_reviewed_at || card.created_at || new Date().toISOString();
  const refTime = new Date(refDateStr).getTime();
  const elapsedDays = Math.max(0, (nowTime - refTime) / (1000 * 60 * 60 * 24));

  // Stability S (days) scales with repetition interval and ease factor
  const baseInterval = interval > 0 ? interval : (reps > 0 ? 1 : 0.8);
  const stabilityDays = Math.max(0.4, parseFloat((baseInterval * (ef / 2.5)).toFixed(2)));

  // R(t) = e^(-t / S)
  const rawRetention = Math.exp(-elapsedDays / stabilityDays);
  const retentionPct = Math.min(100, Math.max(5, Math.round(rawRetention * 100)));

  // Precise diagnostic explanation
  let reason = "";
  if (!card.last_reviewed_at) {
    const daysOld = Math.max(1, Math.round(elapsedDays));
    reason = `Never reviewed • Consolidation pending (${daysOld}d unreviewed, EF ${ef.toFixed(1)}) • S=${stabilityDays.toFixed(1)}d`;
  } else {
    const daysAgo = Math.round(elapsedDays);
    reason = `Last reviewed ${daysAgo === 0 ? "today" : `${daysAgo}d ago`} (EF ${ef.toFixed(1)}, Reps: ${reps}) • Stability S=${stabilityDays.toFixed(1)}d`;
  }

  return {
    id: card.id,
    name: cleanConceptTitle(card.front),
    documentId: card.document_id,
    retention: retentionPct,
    stabilityDays,
    daysSinceReview: elapsedDays,
    easeFactor: ef,
    repetitions: reps,
    reason,
    isDue: !!card.is_due,
  };
}

/**
 * Groups flashcards by document / topic and returns distinct topic decay metrics.
 */
export function groupFlashcardsByTopic(
  cards: RawFlashcard[],
  docNameMap: Record<string, string> = {},
  nowTime: number = Date.now(),
): TopicDecayGroup[] {
  if (!cards.length) return [];

  const evaluated = cards.map((c) => computeFlashcardDecay(c, nowTime));

  const groups: Record<string, EvaluatedDecay[]> = {};

  evaluated.forEach((c) => {
    const topicKey = c.documentId || "General Concepts";
    if (!groups[topicKey]) groups[topicKey] = [];
    groups[topicKey].push(c);
  });

  const result: TopicDecayGroup[] = [];

  for (const [key, topicCards] of Object.entries(groups)) {
    const count = topicCards.length;
    const avgRetention = Math.round(
      topicCards.reduce((acc, cur) => acc + cur.retention, 0) / count
    );
    const avgStability = parseFloat(
      (topicCards.reduce((acc, cur) => acc + cur.stabilityDays, 0) / count).toFixed(1)
    );
    const avgEf = parseFloat(
      (topicCards.reduce((acc, cur) => acc + cur.easeFactor, 0) / count).toFixed(2)
    );
    const avgReps = Math.round(
      topicCards.reduce((acc, cur) => acc + cur.repetitions, 0) / count
    );
    const maxElapsed = Math.max(...topicCards.map((c) => c.daysSinceReview));

    const topicName = docNameMap[key] || (key === "General Concepts" ? "General Recall Deck" : `Topic ${key.slice(0, 8)}`);

    const daysAgo = Math.round(maxElapsed);
    const reason = daysAgo === 0
      ? `Active today • ${count} cards (EF ${avgEf.toFixed(1)}, Avg Reps: ${avgReps}) • Avg S=${avgStability}d`
      : `Last reviewed ${daysAgo}d ago • ${count} cards (EF ${avgEf.toFixed(1)}, Avg Reps: ${avgReps}) • Avg S=${avgStability}d`;

    result.push({
      topicId: key,
      topicName,
      cardCount: count,
      avgRetention,
      avgStabilityDays: avgStability,
      avgEaseFactor: avgEf,
      avgRepetitions: avgReps,
      daysSinceReview: maxElapsed,
      reason,
      cards: topicCards,
    });
  }

  // Sort lowest retention first
  return result.sort((a, b) => a.avgRetention - b.avgRetention);
}
