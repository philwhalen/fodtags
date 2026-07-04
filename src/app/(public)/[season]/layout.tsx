import Link from "next/link";
import type { Route } from "next";

import { PublicNav } from "@/components/public/PublicNav";
import "@/components/public/public-shell.css";

export default async function SeasonLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ season: string }>;
}) {
  const { season } = await params;
  const seasonYear = Number(season);

  return (
    <div className="public-shell">
      <header className="public-shell-header">
        <div className="public-shell-brand">
          <Link href={`/${season}/championship/pool-a` as Route} className="public-shell-brand-link">
            FOD Tags {season}
          </Link>
        </div>
        <PublicNav seasonYear={Number.isFinite(seasonYear) ? seasonYear : 2026} />
      </header>
      <main className="public-shell-main">{children}</main>
    </div>
  );
}
