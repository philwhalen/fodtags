import { notFound } from "next/navigation";

import { ComingSoon } from "@/components/public/ComingSoon";
import { isValidSubLeague, subLeagueLabel } from "@/lib/public-routes";

export default async function OlpPage({
  params,
}: {
  params: Promise<{ season: string; league: string }>;
}) {
  const { league } = await params;

  if (!isValidSubLeague(league)) {
    notFound();
  }

  return <ComingSoon feature={`OLP — ${subLeagueLabel(league)}`} />;
}
