
import { describe, it } from "mocha";
import { expect } from "chai";
import { network } from "hardhat";

describe("RoqLockEscrow", function () {
  async function deployFixture() {
    const { ethers } = await network.connect();

    const [owner, buyer, seller, arbitrator, stranger] =
      await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const Escrow = await ethers.getContractFactory("RoqLockEscrow");
    const escrow = await Escrow.deploy(
      await usdc.getAddress(),
      owner.address,
      arbitrator.address
    );
    await escrow.waitForDeployment();

    const amount = 100n * 10n ** 6n;
    const dealId = ethers.id("roqlock-deal-001");

    await usdc.transfer(buyer.address, amount * 5n);

    await usdc.connect(buyer).approve(
      await escrow.getAddress(),
      amount * 5n
    );

    return {
      ethers,
      owner,
      buyer,
      seller,
      arbitrator,
      stranger,
      usdc,
      escrow,
      amount,
      dealId,
    };
  }

  async function createDeal(fixture: Awaited<ReturnType<typeof deployFixture>>) {
    const { escrow, buyer, seller, amount, dealId } = fixture;

    await escrow.connect(buyer).createAndFundEscrow(
      dealId,
      seller.address,
      amount
    );
  }

  it("should lock USDC and release it to the seller", async function () {
    const f = await deployFixture();

    await createDeal(f);

    expect(
      await f.usdc.balanceOf(await f.escrow.getAddress())
    ).to.equal(f.amount);

    await f.escrow.connect(f.buyer).releaseFunds(f.dealId);

    expect(
      await f.usdc.balanceOf(f.seller.address)
    ).to.equal(f.amount);

    expect(
      await f.usdc.balanceOf(await f.escrow.getAddress())
    ).to.equal(0n);
  });

  it("should reject release by someone other than the buyer", async function () {
    const f = await deployFixture();

    await createDeal(f);

    await expect(
      f.escrow.connect(f.stranger).releaseFunds(f.dealId)
    ).to.be.revertedWith("Only buyer");
  });

  it("should reject duplicate deal IDs", async function () {
    const f = await deployFixture();

    await createDeal(f);

    await expect(
      f.escrow.connect(f.buyer).createAndFundEscrow(
        f.dealId,
        f.seller.address,
        f.amount
      )
    ).to.be.revertedWith("Deal exists");
  });

  it("should reject dispute resolution by a non-arbitrator", async function () {
    const f = await deployFixture();

    await createDeal(f);
    await f.escrow.connect(f.buyer).raiseDispute(f.dealId);

    await expect(
      f.escrow.connect(f.stranger).resolveDispute(
        f.dealId,
        f.amount,
        0n
      )
    ).to.be.revertedWith("Not arbitrator");
  });

  it("should prevent normal release after a dispute is raised", async function () {
    const f = await deployFixture();

    await createDeal(f);
    await f.escrow.connect(f.buyer).raiseDispute(f.dealId);

    await expect(
      f.escrow.connect(f.buyer).releaseFunds(f.dealId)
    ).to.be.revertedWith("Not funded");
  });

  it("should allow the arbitrator to resolve a dispute", async function () {
    const f = await deployFixture();

    await createDeal(f);
    await f.escrow.connect(f.seller).raiseDispute(f.dealId);

    const buyerRefund = 40n * 10n ** 6n;
    const sellerPayment = 60n * 10n ** 6n;

    await f.escrow.connect(f.arbitrator).resolveDispute(
      f.dealId,
      buyerRefund,
      sellerPayment
    );

    expect(
      await f.usdc.balanceOf(f.buyer.address)
    ).to.equal(4n * f.amount + buyerRefund);

    expect(
      await f.usdc.balanceOf(f.seller.address)
    ).to.equal(sellerPayment);
  });
});
