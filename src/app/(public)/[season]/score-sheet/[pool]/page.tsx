import { notFound } from "next/navigation";

import { ComingSoon } from "@/components/public/ComingSoon";
import { isValidPool, poolLabel } from "@/lib/public-routes";

export default async function ScoreSheetPage({
  params,
}: {
  params: Promise<{ season: string; pool: string }>;
}) {
  const { pool } = await params;

  if (!isValidPool(pool)) {
    notFound();
  }

  return <ComingSoon feature={`Score Sheet — ${poolLabel(pool)}`} />;
}
