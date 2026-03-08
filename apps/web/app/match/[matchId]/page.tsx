import { MatchView } from "../../../components/match-view";

export default async function MatchPage({
  params
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  return <MatchView matchId={matchId} />;
}
