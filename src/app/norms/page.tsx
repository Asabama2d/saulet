import type { Metadata } from 'next';
import { NormExplorer } from '@/components/norms/norm-explorer';

export const metadata: Metadata = { title: 'Атлас норм — Saulet', description: 'Граф связей нормативной базы РК: документы, пункты и темы. Доступ к текстам по паролю.', robots: { index: false, follow: false } };
export default function NormsPage() { return <NormExplorer />; }
