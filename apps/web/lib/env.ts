export const BASE_SEPOLIA_USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export const env = {
  cdpProjectId: process.env.NEXT_PUBLIC_CDP_PROJECT_ID ?? "",
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/referee",
  escrowAddress: process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS ?? "",
  stakeTokenAddress: process.env.NEXT_PUBLIC_STAKE_TOKEN_ADDRESS ?? BASE_SEPOLIA_USDC_ADDRESS,
  deployerAddress: process.env.NEXT_PUBLIC_DEPLOYER_ADDRESS ?? "",
  refereeAddress: process.env.NEXT_PUBLIC_REFEREE_ADDRESS ?? ""
};

export const missingEnv = Object.entries({
  NEXT_PUBLIC_CDP_PROJECT_ID: env.cdpProjectId,
  NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS: env.escrowAddress
})
  .filter(([, value]) => !value)
  .map(([key]) => key);
