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
