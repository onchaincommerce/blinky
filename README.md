# Blink Duel MVP

Blink Duel is a two-player live game scaffold built around:

- `CDP Embedded Wallets` for player sign-in and smart-account funding
- `CDP Server Wallet v2` for backend referee contract calls
- `Base Sepolia` for testnet escrow settlement
- `LiveKit` for live rooms
- `EAR-based blink detection` in the referee service for MediaPipe-powered landmark streams

## Repo layout

- `apps/web`: Next.js client for email OTP sign-in, match creation, joining, and live room UI
- `apps/referee`: Express backend for match state, LiveKit tokens, blink adjudication, and referee settlement
- `packages/contracts`: `BlinkMatchEscrow` Solidity contract and tests
- `packages/shared`: shared types, request schemas, room hashing helpers, and contract ABI

## Key flow

1. Player signs in with email OTP and gets a smart account via CDP Embedded Wallets.
2. Player creates a match through the backend and funds the escrow contract with a sponsored user operation.
3. Opponent joins from the invite link and funds the same match with a second sponsored user operation.
4. Both players mark camera presence, the backend starts the match, and LiveKit provides room tokens.
5. A MediaPipe landmark worker posts EAR samples to `/internal/matches/:id/landmarks`.
6. The referee service resolves the loser and calls `resolveMatch` on the escrow contract.

## Setup

### 1. Install dependencies

The repo uses `npm` workspaces.

```bash
npm install
```

### 2. Copy env vars

```bash
cp .env.example .env
```

Fill in:

- `NEXT_PUBLIC_CDP_PROJECT_ID` from Coinbase CDP
- `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS` after deploying `BlinkMatchEscrow`
- `NEXT_PUBLIC_STAKE_TOKEN_ADDRESS` defaults to Circle's Base Sepolia USDC test token: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- `LIVEKIT_*` if you want live video enabled
- `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, and `CDP_WALLET_SECRET` for backend server wallet control

The UI defaults to a `1.00` test USDC stake amount.

### 3. Create or fund a deployer wallet

This repo now includes a Foundry-generated deployer wallet in the root `.env`. Its public address is:

`0xBCA2886530169439D344ce80F7F0781Ba10a3645`

Fund it with a small amount of Base Sepolia ETH from an official faucet:

- [Base network faucets](https://docs.base.org/tools/network-faucets)

For test USDC on Base Sepolia, you can use:

- [CDP Faucet](https://portal.cdp.coinbase.com/products/faucet)
- [Circle Faucet](https://faucet.circle.com/)

### 4. Deploy contracts

```bash
npm run deploy:base-sepolia --workspace @blink/contracts
```

For Base Sepolia testing, use:

```bash
npm run deploy:stack --workspace @blink/contracts
```

That deploys `MockUSDC` and `BlinkMatchEscrow`, writes `packages/contracts/deployments/base-sepolia.json`, and updates the app env files with the deployed addresses.

By default, `deploy:stack` uses the official Base Sepolia USDC test token. If you want a local mock token instead, run with:

```bash
DEPLOY_MOCK_USDC=true npm run deploy:stack --workspace @blink/contracts
```

### 5. Start the apps

```bash
npm run dev:referee
npm run dev:web
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Public friend test with ngrok

The web app now proxies the referee API through Next at `/api/referee`, so you only need one tunnel:

```bash
npm run tunnel:web
```

Share the generated `https://...ngrok-free.app` URL with your friend.

## Notes

- The backend store is in-memory to keep the MVP scaffold compact. Replace `MatchStore` with a database adapter before production.
- The blink detector expects EAR samples from a MediaPipe worker. It does not decode raw video inside this repo.
- A demo landmark simulator is included so you can exercise match resolution before wiring full video analysis.
- The workspace requires Node `>=22` per current CDP guidance, even though the local machine may still need an upgrade before installation.
- Mainnet release should not happen without legal review for wagering, privacy, minors, and payments compliance.
