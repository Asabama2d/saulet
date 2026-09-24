import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/app-shell';

export const metadata: Metadata = { title: 'Атлас норм — Saulet', description: 'Граф связей нормативной базы РК: документы, пункты и темы. Доступ к текстам по паролю.', robots: { index: false, follow: false } };
export default function NormsPage() { return <AppShell initialView="norms" />; }
