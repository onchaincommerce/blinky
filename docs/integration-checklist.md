# Blink Duel Integration Checklist

## 1. Wallet and chain

- `NEXT_PUBLIC_CDP_PROJECT_ID` is set in `apps/web/.env.local`
- `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, and `CDP_WALLET_SECRET` are set in `apps/referee/.env`
- Deployer wallet is funded on Base Sepolia:
  - `0xBCA2886530169439D344ce80F7F0781Ba10a3645`
- Referee wallet is funded on Base Sepolia:
  - `0xBB767D8A2bA900D1cECa239b84a2ad1EfB3d9014`
- Deploy stack:
  - `npm run deploy:stack --workspace @blink/contracts`
- Default stake token is official Base Sepolia USDC:
  - `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Fund player wallets with test USDC:
  - CDP Faucet or Circle Faucet
- Optional mock token path:
  - `DEPLOY_MOCK_USDC=true npm run deploy:stack --workspace @blink/contracts`
  - `MINT_TO_ADDRESS=<player_wallet> STAKE_TOKEN_ADDRESS=<mock_usdc> npm run mint:mock-usdc --workspace @blink/contracts`

## 2. Live rooms

Required env in `apps/referee/.env`:

- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_WS_URL`

MVP room model:

- One LiveKit room per match
- Backend signs participant join tokens
- Browser publishes video, no audio required
- Referee process or a separate worker consumes frames/landmarks for adjudication

## 3. Vision path

Short-term demo path already supported:

- Start a match until status is `live`
- Use:
  - `MATCH_ID=<match_id> USER_ID=<creator_or_challenger_user_id> npm run simulate:blink --workspace @blink/referee`
- That posts calibrated EAR samples and then a blink to `/internal/matches/:id/landmarks`

Production path to wire next:

- Subscribe a worker to the LiveKit room
- Run MediaPipe Face Landmarker on sampled frames
- Compute EAR per eye
- POST landmarks to:
  - `/internal/matches/:id/landmarks`

Expected landmark payload:

```json
{
  "userId": "user_123",
  "detectedAt": "2026-03-07T18:00:00.000Z",
  "leftEAR": 0.28,
  "rightEAR": 0.27,
  "yaw": 0,
  "pitch": 0,
  "faceConfidence": 0.98
}
```

## 4. Current defaults

- Default stake in the UI: `1.00` USDC
- Chain target: `Base Sepolia`
- Settlement model: backend referee resolves onchain escrow
