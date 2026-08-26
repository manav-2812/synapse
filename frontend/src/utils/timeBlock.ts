import type { UserMeResponse } from "../types/api";

export interface TimeBlockConfig {
  block: number; // 0 to 5
  timeRange: string;
  greeting: string;
  message: string;
  part: "morning" | "afternoon" | "evening" | "night";
}

/**
 * Extracts a clean first name from UserMeResponse or email.
 */
export function extractFirstName(user?: UserMeResponse | null): string {
  if (!user) return "";
  if (user.full_name && user.full_name.trim()) {
    const raw = user.full_name.trim().split(/\s+/)[0] || "";
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
  }
  if (user.email) {
    const namePart = user.email.split("@")[0].replace(/[._-]/g, " ").trim().split(/\s+/)[0] || "";
    return namePart ? namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase() : "";
  }
  return "";
}

/**
 * 6 four-hour time blocks across the 24-hour day.
 * Synchronized across Dashboard and Chat empty state.
 */
export function getTimeBlockConfig(
  hour: number = new Date().getHours(),
  firstName?: string,
): TimeBlockConfig {
  const name = firstName ? `, ${firstName}` : "";

  // Block 0: 00:00 - 03:59 (Late Night)
  if (hour >= 0 && hour < 4) {
    return {
      block: 0,
      timeRange: "00:00 - 04:00",
      greeting: `Working late${name}`,
      message: `Quiet hours, deep focus${name}. We've got you.`,
      part: "evening",
    };
  }

  // Block 1: 04:00 - 07:59 (Early Morning)
  if (hour >= 4 && hour < 8) {
    return {
      block: 1,
      timeRange: "04:00 - 08:00",
      greeting: `Good morning${name}`,
      message: `Early start${name}. Let's get ahead today.`,
      part: "morning",
    };
  }

  // Block 2: 08:00 - 11:59 (Morning Peak Focus)
  if (hour >= 8 && hour < 12) {
    return {
      block: 2,
      timeRange: "08:00 - 12:00",
      greeting: `Good morning${name}`,
      message: `Peak focus hours${name}.`,
      part: "morning",
    };
  }

  // Block 3: 12:00 - 15:59 (Midday Review)
  if (hour >= 12 && hour < 16) {
    return {
      block: 3,
      timeRange: "12:00 - 16:00",
      greeting: `Good afternoon${name}`,
      message: `Midday review session${name}.`,
      part: "afternoon",
    };
  }

  // Block 4: 16:00 - 19:59 (Evening / Wrapping Up)
  if (hour >= 16 && hour < 20) {
    return {
      block: 4,
      timeRange: "16:00 - 20:00",
      greeting: `Good evening${name}`,
      message: `Wrapping up today's topics${name}.`,
      part: "evening",
    };
  }

  // Block 5: 20:00 - 23:59 (Night Deep-Dive Mode)
  return {
    block: 5,
    timeRange: "20:00 - 00:00",
    greeting: `Good evening${name}`,
    message: `Evening deep-dive mode${name}.`,
    part: "evening",
  };
}

import type { DocumentResponse, DashboardResponse, FlashcardResponse } from "../types/api";

export interface SuggestionItem {
  icon: string;
  cmd: string;
  title: string;
  desc: string;
  prompt: string;
}

function cleanDocTitle(filename?: string | null): string {
  if (!filename) return "study material";
  return (
    filename
      .replace(/^[\d_-]+/, "")
      .replace(/\.(pdf|docx?|txt|png|jpe?g|md)$/i, "")
      .replace(/[_-]+/g, " ")
      .trim() || filename
  );
}

export function buildContextAwareSuggestions(
  documents: DocumentResponse[] = [],
  dashboard?: DashboardResponse | null,
  dueCards: FlashcardResponse[] = [],
): SuggestionItem[] {
  // If no documents and no due cards, return sensible default suggestions
  if (documents.length === 0 && dueCards.length === 0) {
    return [
      {
        icon: "doc",
        cmd: "/summarize",
        title: "Executive Summary",
        desc: "Key concepts, arguments & core takeaways",
        prompt: "Provide a clear summary of the core concepts, main arguments, and key takeaways from my uploaded study documents.",
      },
      {
        icon: "help",
        cmd: "/quiz",
        title: "Active Recall Quiz",
        desc: "Test retention with 5 tailored questions",
        prompt: "Generate a 5-question active recall quiz based on the key concepts in my study materials, including answers and explanations.",
      },
      {
        icon: "lightbulb",
        cmd: "/explain",
        title: "Explain with Analogies",
        desc: "Break down complex topics simply",
        prompt: "Explain the most complex and foundational concepts in my documents using simple language and memorable analogies.",
      },
      {
        icon: "layers",
        cmd: "/compare",
        title: "Compare & Contrast",
        desc: "Connect themes and contrast related ideas",
        prompt: "Analyze the relationships, similarities, and contrasts between the major themes covered in these documents.",
      },
    ];
  }

  // Sort documents by created descending
  const sortedDocs = [...documents].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    return timeB - timeA;
  });

  const doc1 = sortedDocs[0];
  const doc2 = sortedDocs[1];
  const doc1Title = cleanDocTitle(doc1?.original_filename);
  const doc2Title = cleanDocTitle(doc2?.original_filename);

  const weakTopics = dashboard?.topic_performance?.filter((t) => t.score < 75) || [];
  const topWeakTopic = weakTopics[0]?.topic;

  const suggestions: SuggestionItem[] = [];

  // Card 1: Executive Summary (/summarize)
  if (doc1) {
    suggestions.push({
      icon: "doc",
      cmd: "/summarize",
      title: "Executive Summary",
      desc: `Core concepts & takeaways from "${doc1Title}"`,
      prompt: `Provide a structured executive summary of "${doc1.original_filename}", outlining core concepts, key mechanisms, and main takeaways.`,
    });
  } else {
    suggestions.push({
      icon: "doc",
      cmd: "/summarize",
      title: "Executive Summary",
      desc: "Key concepts, arguments & core takeaways",
      prompt: "Provide a clear summary of the core concepts, main arguments, and key takeaways from my uploaded study documents.",
    });
  }

  // Card 2: Compare & Contrast (/compare)
  if (doc1 && doc2) {
    suggestions.push({
      icon: "layers",
      cmd: "/compare",
      title: "Compare & Contrast",
      desc: `Compare "${doc1Title}" vs "${doc2Title}"`,
      prompt: `Analyze the similarities, differences, and thematic connections between "${doc1.original_filename}" and "${doc2.original_filename}".`,
    });
  } else if (doc1) {
    suggestions.push({
      icon: "layers",
      cmd: "/compare",
      title: "Thematic Synthesis",
      desc: `Cross-examine core models in "${doc1Title}"`,
      prompt: `Analyze and contrast the different approaches, principles, and paradigms discussed in "${doc1.original_filename}".`,
    });
  } else {
    suggestions.push({
      icon: "layers",
      cmd: "/compare",
      title: "Compare & Contrast",
      desc: "Connect themes and contrast related ideas",
      prompt: "Analyze the relationships, similarities, and contrasts between the major themes covered in these documents.",
    });
  }

  // Card 3: Active Recall Quiz (/quiz)
  if (dueCards.length > 0) {
    const targetCard = dueCards[0];
    const cardTopic = targetCard.front?.slice(0, 32) || doc1Title;
    suggestions.push({
      icon: "help",
      cmd: "/quiz",
      title: "Active Recall Drill",
      desc: `Strengthen ${dueCards.length} due items (${cardTopic}…)`,
      prompt: `Generate a focused 5-question active recall drill based on my due flashcards, especially around ${cardTopic}, with detailed feedback for each answer.`,
    });
  } else if (topWeakTopic) {
    suggestions.push({
      icon: "help",
      cmd: "/quiz",
      title: "Active Recall Quiz",
      desc: `Target knowledge gaps in ${topWeakTopic}`,
      prompt: `Generate a 5-question diagnostic quiz focused on ${topWeakTopic} to test and solidify my understanding.`,
    });
  } else if (doc1) {
    suggestions.push({
      icon: "help",
      cmd: "/quiz",
      title: "Active Recall Quiz",
      desc: `Test retention on "${doc1Title}" with 5 questions`,
      prompt: `Generate a 5-question active recall quiz testing mastery of "${doc1.original_filename}", including answer explanations.`,
    });
  } else {
    suggestions.push({
      icon: "help",
      cmd: "/quiz",
      title: "Active Recall Quiz",
      desc: "Test retention with 5 tailored questions",
      prompt: "Generate a 5-question active recall quiz based on the key concepts in my study materials, including answers and explanations.",
    });
  }

  // Card 4: Explain with Analogies (/explain)
  if (topWeakTopic) {
    suggestions.push({
      icon: "lightbulb",
      cmd: "/explain",
      title: "Explain with Analogies",
      desc: `Simplify tricky concepts in ${topWeakTopic}`,
      prompt: `Explain the most confusing and foundational concepts in ${topWeakTopic} using memorable real-world analogies and intuitive step-by-step breakdown.`,
    });
  } else if (doc1) {
    suggestions.push({
      icon: "lightbulb",
      cmd: "/explain",
      title: "Explain with Analogies",
      desc: `Deconstruct complex ideas in "${doc1Title}"`,
      prompt: `Explain the foundational theories and complex mechanisms in "${doc1.original_filename}" using simple language and vivid analogies.`,
    });
  } else {
    suggestions.push({
      icon: "lightbulb",
      cmd: "/explain",
      title: "Explain with Analogies",
      desc: "Break down complex topics simply",
      prompt: "Explain the most complex and foundational concepts in my documents using simple language and memorable analogies.",
    });
  }

  return suggestions;
}

