import { ComingSoon } from "@/components/public/ComingSoon";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ season: string; slug: string }>;
}) {
  const { slug } = await params;

  return <ComingSoon feature={slug === "search" ? "Player Search" : `Player — ${slug}`} />;
}
