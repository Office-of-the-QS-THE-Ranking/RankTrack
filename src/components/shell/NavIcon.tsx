"use client";

import type { ComponentType } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { IconProps } from "@/components/animate-ui/icons/icon";
import { BookOpen } from "@/components/animate-ui/icons/book-open";
import { ChartBar } from "@/components/animate-ui/icons/chart-bar";
import { ChartColumnIncreasing } from "@/components/animate-ui/icons/chart-column-increasing";
import { CircleQuestionMark } from "@/components/animate-ui/icons/circle-question-mark";
import { ClipboardCheck } from "@/components/animate-ui/icons/clipboard-check";
import { CloudUpload } from "@/components/animate-ui/icons/cloud-upload";
import { FileText } from "@/components/animate-ui/icons/file-text";
import { FolderClock } from "@/components/animate-ui/icons/folder-clock";
import { FolderOpen } from "@/components/animate-ui/icons/folder-open";
import { GraduationCap } from "@/components/animate-ui/icons/graduation-cap";
import { Info } from "@/components/animate-ui/icons/info";
import { LayoutDashboard } from "@/components/animate-ui/icons/layout-dashboard";
import { Library } from "@/components/animate-ui/icons/library";
import { Lightbulb } from "@/components/animate-ui/icons/lightbulb";
import { MessageSquareText } from "@/components/animate-ui/icons/message-square-text";
import { Newspaper } from "@/components/animate-ui/icons/newspaper";
import { NotebookPen } from "@/components/animate-ui/icons/notebook-pen";
import { Trophy } from "@/components/animate-ui/icons/trophy";
import { Upload } from "@/components/animate-ui/icons/upload";

/* Sidebar icons come from animate-ui's Lucide set. The active tab's icon replays its motion every
   four seconds; the rest stay still. Names without an animated pair fall back to the static set. */
const ANIMATED: Partial<Record<IconName, ComponentType<IconProps<never>>>> = {
  dashboard: LayoutDashboard,
  rankings: ChartColumnIncreasing,
  contributions: CloudUpload,
  units: GraduationCap,
  publications: Library,
  newspaper: Newspaper,
  recognition: Trophy,
  knowledge: BookOpen,
  reports: FileText,
  about: Info,
  clipboard: ClipboardCheck,
  data: ChartBar,
  upload: Upload,
  pen: NotebookPen,
  innovation: Lightbulb,
  comment: MessageSquareText,
  history: FolderClock,
  folder: FolderOpen,
  help: CircleQuestionMark,
};

const LOOP_MS = 4000;

export function NavIcon({ name, active = false, size = 19 }: { name: IconName; active?: boolean; size?: number }) {
  const Animated = ANIMATED[name];
  if (!Animated) return <Icon name={name} size={size} />;
  return <Animated size={size} strokeWidth={1.75} animate={active} loop loopDelay={LOOP_MS} aria-hidden="true" />;
}
