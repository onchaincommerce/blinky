import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const referee = process.env.REFEREE_ADDRESS ?? deployer.address;
  const owner = process.env.OWNER_ADDRESS ?? deployer.address;
  const joinExpiry = Number(process.env.JOIN_EXPIRY_SECONDS ?? 1800);
  const noShowExpiry = Number(process.env.NO_SHOW_EXPIRY_SECONDS ?? 3600);

  const factory = await ethers.getContractFactory("BlinkMatchEscrow");
  const escrow = await factory.deploy(owner, referee, joinExpiry, noShowExpiry);
  await escrow.waitForDeployment();

  console.log("BlinkMatchEscrow deployed to:", await escrow.getAddress());
  console.log("Owner:", owner);
  console.log("Referee:", referee);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

