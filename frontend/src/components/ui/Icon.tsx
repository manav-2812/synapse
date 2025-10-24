import {
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Flame,
  Gauge,
  HardDrive,
  Keyboard,
  Layers,
  LayoutGrid,
  Lightbulb,
  LogOut,
  MessageSquare,
  Moon,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Sun,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Maps the app's existing icon names to Lucide components.
const ICONS: Record<string, LucideIcon> = {
  close: X,
  edit: Pencil,
  trash: Trash2,
  upload: Upload,
  plus: Plus,
  doc: FileText,
  search: Search,
  chat: MessageSquare,
  chevron: ChevronLeft,
  grid: LayoutGrid,
  hardDrive: HardDrive,
  bell: Bell,
  clipboard: ClipboardList,
  layers: Layers,
  chevronDown: ChevronDown,
  check: Check,
  logout: LogOut,
  moon: Moon,
  sun: Sun,
  chart: BarChart3,
  eval: Gauge,
  quiz: Lightbulb,
  notes: NotebookPen,
  card: CreditCard,
  sparkles: Sparkles,
  keyboard: Keyboard,
  eye: Eye,
  eyeOff: EyeOff,
  flame: Flame,
  trending: TrendingUp,
  clock: Clock,
  target: Target,
};

// Ambiguous icons kept on their original custom SVG paths.
const FALLBACK_PATHS: Record<string, string> = {};

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Cmp = ICONS[name];
  if (Cmp) return <Cmp size={size} className={className} />;

  const d = FALLBACK_PATHS[name];
  if (d) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        <path d={d} />
      </svg>
    );
  }
  return null;
}
