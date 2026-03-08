import { expect } from "chai";
import { ethers } from "hardhat";
import { keccak256, toUtf8Bytes } from "ethers";

describe("BlinkMatchEscrow", () => {
  async function deployFixture() {
    const [owner, referee, creator, challenger, outsider] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("MockUSDC");
    const token = await tokenFactory.deploy();
    await token.waitForDeployment();

    const escrowFactory = await ethers.getContractFactory("BlinkMatchEscrow");
    const escrow = await escrowFactory.deploy(owner.address, referee.address, 60, 120);
    await escrow.waitForDeployment();

    const stakeAmount = 10_000_000n;
    await token.mint(creator.address, stakeAmount);
    await token.mint(challenger.address, stakeAmount);
    await token.connect(creator).approve(await escrow.getAddress(), stakeAmount);
    await token.connect(challenger).approve(await escrow.getAddress(), stakeAmount);

    const roomIdHash = keccak256(toUtf8Bytes("room-123"));
    const matchId = BigInt(roomIdHash);

    return { owner, referee, creator, challenger, outsider, token, escrow, stakeAmount, roomIdHash, matchId };
  }

  it("creates and resolves a match through the referee", async () => {
    const { creator, challenger, referee, token, escrow, stakeAmount, roomIdHash, matchId } = await deployFixture();

    await escrow.connect(creator).createMatch(await token.getAddress(), stakeAmount, roomIdHash);
    await escrow.connect(challenger).joinMatch(matchId);
    await escrow.connect(referee).startMatch(matchId);
    await escrow.connect(referee).resolveMatch(matchId, challenger.address, roomIdHash);

    expect(await token.balanceOf(challenger.address)).to.equal(stakeAmount * 2n);
  });

  it("blocks non-referee resolution", async () => {
    const { creator, challenger, outsider, token, escrow, stakeAmount, roomIdHash, matchId } = await deployFixture();

    await escrow.connect(creator).createMatch(await token.getAddress(), stakeAmount, roomIdHash);
    await escrow.connect(challenger).joinMatch(matchId);
    await escrow.connect(challenger).startMatch(matchId);

    await expect(
      escrow.connect(outsider).resolveMatch(matchId, challenger.address, roomIdHash)
    ).to.be.revertedWithCustomError(escrow, "Unauthorized");
  });

  it("refunds both players when the match never starts", async () => {
    const { creator, challenger, token, escrow, stakeAmount, roomIdHash, matchId } = await deployFixture();

    await escrow.connect(creator).createMatch(await token.getAddress(), stakeAmount, roomIdHash);
    await escrow.connect(challenger).joinMatch(matchId);
    await ethers.provider.send("evm_increaseTime", [121]);
    await ethers.provider.send("evm_mine", []);

    await escrow.refundNoShow(matchId);

    expect(await token.balanceOf(creator.address)).to.equal(stakeAmount);
    expect(await token.balanceOf(challenger.address)).to.equal(stakeAmount);
  });

  it("cancels a match if nobody joins before expiry", async () => {
    const { creator, token, escrow, stakeAmount, roomIdHash, matchId } = await deployFixture();

    await escrow.connect(creator).createMatch(await token.getAddress(), stakeAmount, roomIdHash);
    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);

    await escrow.cancelExpiredMatch(matchId);

    expect(await token.balanceOf(creator.address)).to.equal(stakeAmount);
  });
});
