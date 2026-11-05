import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const RoqLockModule = buildModule("RoqLockModule", (m) => {
  const deployer = m.getAccount(0);

  const mockUSDC = m.contract("MockUSDC");

  const roqLockEscrow = m.contract("RoqLockEscrow", [
    mockUSDC,
    deployer,
    deployer,
  ]);

  return {
    mockUSDC,
    roqLockEscrow,
  };
});

export default RoqLockModule;