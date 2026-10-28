import {
  AlarmClock, AlertTriangle, Archive, AtSign, Award, BarChart3, Bell, BookOpen, Bookmark, Brain, Briefcase, Bug, Calendar,
  Camera, CheckCircle2, CircleCheckBig, ClipboardList, Cloud, Code2, Coffee, Compass, CreditCard, Database, DollarSign,
  FileText, Film, Flag, Flame, FolderOpen, Gift, Globe, GraduationCap, Hand, Heart, Home, Image, Inbox, Info, Key, Lightbulb,
  Map, Megaphone, MessageCircle, Mic, Music, Palette, PenLine, Pin, Plane, Rocket, Search, Settings, ShoppingCart, Sparkles,
  Star, Sun, Table2, Target, Trophy, Users, Wrench, Zap, type LucideIcon,
} from 'lucide-react'
import type { Page } from '../types'

/** Line icons a page can use; stored on the page as "lucide:<Name>:<color>". */
export const PAGE_ICONS: Record<string, LucideIcon> = {
  FileText, BookOpen, ClipboardList, CircleCheckBig, Table2, Calendar, Target, Rocket, Lightbulb, Brain, Sparkles, Star,
  Flag, Pin, Bookmark, FolderOpen, Archive, Inbox, Briefcase, Users, MessageCircle, Megaphone, BarChart3, DollarSign,
  CreditCard, ShoppingCart, Gift, Award, Trophy, GraduationCap, Code2, Bug, Wrench, Settings, Key, Database, Globe, Map,
  Compass, Plane, Home, Coffee, Heart, Hand, Sun, Cloud, Zap, Flame, Camera, Image, Film, Music, Mic, Palette, PenLine,
  Search, Bell, AlarmClock, Info, AlertTriangle, CheckCircle2,
}

export const ICON_COLORS: Record<string, string> = {
  gray: '#91918e', brown: '#9f6b53', orange: '#d9730d', yellow: '#cb912f', green: '#448361',
  blue: '#337ea9', purple: '#9065b0', pink: '#c14c8a', red: '#d44c47',
}

export const lucideIcon = (name: string, color = 'gray') => `lucide:${name}:${color}`

/** Renders an icon value: "lucide:Name:color", an emoji, or nothing (fallback). */
export function IconView({ value, fallback = FileText, size = 18, className = '' }: {
  value?: string; fallback?: LucideIcon; size?: number; className?: string
}) {
  if (value?.startsWith('lucide:')) {
    const [, name, color] = value.split(':')
    const C = PAGE_ICONS[name] ?? fallback
    return <C size={size} strokeWidth={1.8} color={ICON_COLORS[color] ?? ICON_COLORS.gray} className={`ico ${className}`} />
  }
  if (value) return <span className={`ico emoji ${className}`} style={{ fontSize: size * 0.95, width: size, height: size, lineHeight: `${size}px` }}>{value}</span>
  const C = fallback
  return <C size={size} strokeWidth={1.8} className={`ico ico-muted ${className}`} />
}

export function PageIcon({ page, size = 18, className }: { page: Pick<Page, 'icon' | 'kind'>; size?: number; className?: string }) {
  return <IconView value={page.icon} fallback={page.kind === 'database' ? Table2 : FileText} size={size} className={className} />
}
