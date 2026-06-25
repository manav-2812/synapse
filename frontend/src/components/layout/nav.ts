export interface NavItem {
  to: string;
  label: string;
  icon: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: "grid" },
  { to: "/documents", label: "Documents", icon: "doc" },
  { to: "/chat", label: "Chat", icon: "chat" },
  { to: "/quiz", label: "Quiz", icon: "quiz" },
  { to: "/flashcards", label: "Flashcards", icon: "card" },
  { to: "/notes", label: "Notes", icon: "notes" },
  { to: "/analytics", label: "Analytics", icon: "chart" },
  { to: "/eval", label: "Eval", icon: "eval" },
];
