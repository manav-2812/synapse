export interface NavItem {
  to: string;
  label: string;
  icon: string;
}

export const STUDY_ITEMS: NavItem[] = [
  { to: "/documents", label: "Documents", icon: "doc" },
  { to: "/chat", label: "Chat", icon: "chat" },
  { to: "/quiz", label: "Quiz", icon: "quiz" },
  { to: "/flashcards", label: "Flashcards", icon: "card" },
  { to: "/notes", label: "Notes", icon: "notes" },
];

export const INSIGHTS_ITEMS: NavItem[] = [
  { to: "/analytics", label: "Analytics", icon: "chart" },
  { to: "/eval", label: "Eval", icon: "eval" },
];

export const NAV_ITEMS: NavItem[] = [...STUDY_ITEMS, ...INSIGHTS_ITEMS];
