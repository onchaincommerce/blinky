const apiBase = process.env.API_BASE_URL ?? "http://localhost:8787";
const matchId = process.env.MATCH_ID;
const userId = process.env.USER_ID;
const calibrationFrames = Number(process.env.CALIBRATION_FRAMES ?? 48);

if (!matchId || !userId) {
  throw new Error("Set MATCH_ID and USER_ID before running the blink simulator");
}

async function main() {
  for (let index = 0; index < calibrationFrames; index += 1) {
    await postSample({
      userId,
      detectedAt: new Date().toISOString(),
      leftEAR: 0.29,
      rightEAR: 0.28,
      yaw: 0,
      pitch: 0,
      faceConfidence: 0.99
    });
  }

  for (let index = 0; index < 4; index += 1) {
    await postSample({
      userId,
      detectedAt: new Date().toISOString(),
      leftEAR: 0.09,
      rightEAR: 0.08,
      yaw: 0,
      pitch: 0,
      faceConfidence: 0.99
    });
  }

  console.log(`Posted simulated blink for ${userId} on match ${matchId}`);
}

async function postSample(payload: Record<string, unknown>) {
  const response = await fetch(`${apiBase}/internal/matches/${matchId}/landmarks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Simulator request failed (${response.status}): ${body}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

