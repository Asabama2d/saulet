import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Статический экспорт: приложение полностью клиентское (нет API-роутов,
  // server actions и обращений к БД), поэтому сборка кладётся в /out
  // и раздаётся как статика — Render Static Site, CDN, без Node на проде.
  output: 'export',

  // next/image не используется, но при появлении картинок оптимизатор
  // недоступен в статическом экспорте — сразу отключаем, чтобы сборка не падала.
  images: { unoptimized: true },
};

export default nextConfig;
