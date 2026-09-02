"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Home,
  Inbox,
  Info,
  LayoutDashboard,
  LineChart,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  MoreHorizontal,
  MoreVertical,
  PackageOpen,
  Percent,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Sun,
  Moon,
  Monitor,
  Star,
  Truck,
  Upload,
  User,
  Users,
  Wallet,
  WifiOff,
  X,
  XCircle,
  type LucideProps,
} from "lucide-react";
import {
  ApartmentTowerIcon,
  GarmentBagIcon,
  HangerIcon,
  IronIcon,
  ScanTagIcon,
  ShirtIcon,
  TrouserIcon,
  WatchmanIcon,
} from "./custom";

/** One name-to-glyph registry so both platforms (web now, native later)
 * can share icon *names* even though the rendering differs (docs/05 §10).
 * No icon fonts, no raster icons, no `<svg>` copy-pasted into feature
 * code — everything comes through this one component. */
const registry = {
  // lucide
  "alert-triangle": AlertTriangle,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  bell: Bell,
  calendar: Calendar,
  camera: Camera,
  check: Check,
  "check-circle": CheckCircle2,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  clock: Clock,
  "credit-card": CreditCard,
  download: Download,
  eye: Eye,
  "eye-off": EyeOff,
  "file-text": FileText,
  filter: Filter,
  home: Home,
  inbox: Inbox,
  info: Info,
  dashboard: LayoutDashboard,
  chart: LineChart,
  spinner: Loader2,
  lock: Lock,
  logout: LogOut,
  "map-pin": MapPin,
  menu: Menu,
  chat: MessageCircle,
  "more-horizontal": MoreHorizontal,
  "more-vertical": MoreVertical,
  "package-open": PackageOpen,
  percent: Percent,
  phone: Phone,
  plus: Plus,
  printer: Printer,
  refresh: RefreshCw,
  search: Search,
  settings: Settings,
  shield: ShieldCheck,
  bag: ShoppingBag,
  sparkles: Sparkles,
  sun: Sun,
  moon: Moon,
  monitor: Monitor,
  star: Star,
  truck: Truck,
  upload: Upload,
  user: User,
  users: Users,
  wallet: Wallet,
  offline: WifiOff,
  close: X,
  "x-circle": XCircle,
  // custom IronMan glyphs
  iron: IronIcon,
  hanger: HangerIcon,
  "garment-bag": GarmentBagIcon,
  shirt: ShirtIcon,
  trouser: TrouserIcon,
  watchman: WatchmanIcon,
  apartment: ApartmentTowerIcon,
  "scan-tag": ScanTagIcon,
} as const;

export type IconName = keyof typeof registry;

export interface IconProps extends Omit<LucideProps, "ref"> {
  name: IconName;
  /** An accessible label. Omit for a purely decorative icon (the default
   * — aria-hidden) sitting next to visible text; provide one for an
   * icon-only control (docs/05 §2.4: "an icon-only button without an
   * accessible name is a CI failure"). */
  label?: string;
}

export function Icon({ name, label, className, ...props }: IconProps) {
  const Glyph = registry[name];
  if (label) {
    return (
      <span role="img" aria-label={label} className="inline-flex">
        <Glyph className={className} aria-hidden="true" {...props} />
      </span>
    );
  }
  return <Glyph className={className} aria-hidden="true" {...props} />;
}
