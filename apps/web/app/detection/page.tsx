import { DetectionLab } from "../../components/detection-lab";

export default async function DetectionPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const matchId = typeof resolved.matchId === "string" ? resolved.matchId : "";
  const userId = typeof resolved.userId === "string" ? resolved.userId : "";

  return <DetectionLab initialMatchId={matchId} initialUserId={userId} />;
}
