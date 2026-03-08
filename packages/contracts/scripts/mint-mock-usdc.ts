import { ethers } from "hardhat";
import { parseUnits } from "ethers";

async function main() {
  const tokenAddress = process.env.STAKE_TOKEN_ADDRESS;
  const recipient = process.env.MINT_TO_ADDRESS;
  const amount = process.env.MINT_AMOUNT_USDC ?? "100";

  if (!tokenAddress || !recipient) {
    throw new Error("Set STAKE_TOKEN_ADDRESS and MINT_TO_ADDRESS");
  }

  const token = await ethers.getContractAt("MockUSDC", tokenAddress);
  const tx = await token.mint(recipient, parseUnits(amount, 6));
  await tx.wait();

  console.log(`Minted ${amount} mUSDC to ${recipient}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

