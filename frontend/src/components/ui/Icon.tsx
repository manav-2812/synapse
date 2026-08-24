import type React from "react";
import {
  AlertTriangle,
  AudioWaveform,
  BarChart3,
  Bell,
  BookOpen,
  Box,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardList,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  File,
  FileText,
  Filter,
  Flame,
  Folder,
  FolderInput,
  FolderPlus,
  Gauge,
  Globe,
  HardDrive,
  HelpCircle,
  Home,
  Image as ImageIcon,
  Info,
  Keyboard,
  KeyRound,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Lightbulb,
  List,
  Lock,
  LogOut,
  Maximize2,
  Menu,
  MessageCircle,
  MessageSquare,
  Mic,
  Minimize2,
  Monitor,
  Moon,
  MoreVertical,
  Move,
  NotebookPen,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  Plus,
  Printer,
  RotateCw,
  Search,
  Send,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Target,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TrendingUp,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Custom diagonal pushpin icon matching reference design
const CustomPin: React.FC<{ size?: number; className?: string }> = ({
  size = 24,
  className,
  ...props
}) => (
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
    {...props}
  >
    <g transform="rotate(45 12 12)">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </g>
  </svg>
);

// Custom rounded home icon matching reference design with rounded roof, walls and doorway
const CustomRoundedHome: React.FC<{ size?: number; className?: string }> = ({
  size = 24,
  className,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    {...props}
  >
    <path d="M3 10.5 10.58 3.65a2 2 0 0 1 2.84 0L21 10.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M9.5 21v-5a2.5 2.5 0 0 1 5 0v5" />
  </svg>
);

// Custom Inbox tray icon matching reference design
const CustomInbox: React.FC<{ size?: number; className?: string }> = ({
  size = 24,
  className,
  ...props
}) => (
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
    {...props}
  >
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);

// Maps the app's existing icon names to Lucide / custom components.
const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  mic: Mic,
  waveform: AudioWaveform,
  pin: CustomPin,
  box: Box,
  circle: Circle,
  close: X,
  edit: Pencil,
  trash: Trash2,
  upload: Upload,
  camera: Camera,
  plus: Plus,
  doc: FileText,
  search: Search,
  send: Send,
  chat: MessageCircle,
  messageSquare: MessageSquare,
  messageCircle: MessageCircle,
  chevron: ChevronLeft,
  chevronRight: ChevronRight,
  grid: LayoutDashboard,
  dashboard: LayoutDashboard,
  layoutGrid: LayoutGrid,
  hardDrive: HardDrive,
  globe: Globe,
  web: Globe,
  bell: Bell,
  inbox: CustomInbox,
  clipboard: ClipboardList,
  copy: Copy,
  refresh: RotateCw,
  download: Download,
  print: Printer,
  maximize: Maximize2,
  minimize: Minimize2,
  book: BookOpen,
  layers: Layers,
  chevronDown: ChevronDown,
  check: Check,
  logout: LogOut,
  moon: Moon,
  sun: Sun,
  monitor: Monitor,
  desktop: Monitor,
  system: Monitor,
  laptop: Monitor,
  chart: BarChart3,
  eval: Gauge,
  quiz: Lightbulb,
  lightbulb: Lightbulb,
  helpCircle: HelpCircle,
  note: BookOpen,
  notes: BookOpen,
  card: CreditCard,
  sparkles: Sparkles,
  keyboard: Keyboard,
  eye: Eye,
  eyeOff: EyeOff,
  flame: Flame,
  trending: TrendingUp,
  clock: Clock,
  target: Target,
  lock: Lock,
  password: Lock,
  key: KeyRound,
  menu: Menu,
  hamburger: Menu,
  sidebarClose: PanelLeftClose,
  sidebarOpen: Menu,
  panelLeft: PanelLeft,
  home: CustomRoundedHome,
  folder: Folder,
  folderPlus: FolderPlus,
  folderInput: FolderInput,
  filter: Filter,
  sliders: SlidersHorizontal,
  slidersVertical: Sliders,
  tune: Sliders,
  moreVertical: MoreVertical,
  file: File,
  image: ImageIcon,
  list: List,
  info: Info,
  help: HelpCircle,
  alert: AlertTriangle,
  thumbsUp: ThumbsUp,
  thumbsDown: ThumbsDown,
  checkCircle: CheckCircle2,
  xCircle: XCircle,
  move: Move,
  externalLink: ExternalLink,
  arrowRight: ChevronRight,
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
