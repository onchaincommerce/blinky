import fs from "node:fs/promises";
import path from "node:path";

import { ethers } from "hardhat";

const rootDir = path.resolve(process.cwd(), "../..");
const BASE_SEPOLIA_USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

async function main() {
  const [deployer] = await ethers.getSigners();
  const referee = process.env.REFEREE_ADDRESS ?? deployer.address;
  const owner = process.env.OWNER_ADDRESS ?? deployer.address;
  const joinExpiry = Number(process.env.JOIN_EXPIRY_SECONDS ?? 1800);
  const noShowExpiry = Number(process.env.NO_SHOW_EXPIRY_SECONDS ?? 3600);
  const deployMockUsdc = process.env.DEPLOY_MOCK_USDC === "true";

  let stakeTokenAddress = process.env.STAKE_TOKEN_ADDRESS ?? BASE_SEPOLIA_USDC_ADDRESS;
  if (deployMockUsdc) {
    const tokenFactory = await ethers.getContractFactory("MockUSDC");
    const token = await tokenFactory.deploy();
    await token.waitForDeployment();
    stakeTokenAddress = await token.getAddress();
  }

  const escrowFactory = await ethers.getContractFactory("BlinkMatchEscrow");
  const escrow = await escrowFactory.deploy(owner, referee, joinExpiry, noShowExpiry);
  await escrow.waitForDeployment();

  const deployment = {
    network: "base-sepolia",
    deployer: deployer.address,
    owner,
    referee,
    stakeToken: stakeTokenAddress,
    deployMockUsdc,
    blinkMatchEscrow: await escrow.getAddress()
  };

  const deploymentDir = path.join(process.cwd(), "deployments");
  await fs.mkdir(deploymentDir, { recursive: true });
  await fs.writeFile(
    path.join(deploymentDir, "base-sepolia.json"),
    `${JSON.stringify(deployment, null, 2)}\n`,
    "utf8"
  );

  await syncEnv(path.join(rootDir, "apps/web/.env.local"), {
    NEXT_PUBLIC_STAKE_TOKEN_ADDRESS: deployment.stakeToken,
    NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS: deployment.blinkMatchEscrow
  });

  await syncEnv(path.join(rootDir, "apps/referee/.env"), {
    ESCROW_CONTRACT_ADDRESS: deployment.blinkMatchEscrow
  });

  await syncEnv(path.join(rootDir, ".env"), {
    OWNER_ADDRESS: owner,
    REFEREE_ADDRESS: referee,
    NEXT_PUBLIC_STAKE_TOKEN_ADDRESS: deployment.stakeToken,
    STAKE_TOKEN_ADDRESS: deployment.stakeToken,
    NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS: deployment.blinkMatchEscrow,
    ESCROW_CONTRACT_ADDRESS: deployment.blinkMatchEscrow
  });

  console.log(JSON.stringify(deployment, null, 2));
}

async function syncEnv(filePath: string, updates: Record<string, string>) {
  let content = "";
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    content = "";
  }

  const lines = content.length > 0 ? content.split("\n") : [];
  const seen = new Set<string>();

  const nextLines = lines.map((line) => {
    const [key] = line.split("=", 1);
    if (key in updates) {
      seen.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      nextLines.push(`${key}=${value}`);
    }
  }

  await fs.writeFile(filePath, `${nextLines.filter(Boolean).join("\n")}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
