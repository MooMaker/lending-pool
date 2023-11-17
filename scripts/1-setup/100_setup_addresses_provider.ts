import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const setupFunction: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployer } = await hre.getNamedAccounts();
  const { deployments } = hre;

  const txSettings = {
    from: deployer,
    log: true,
  };

  const lendingPoolCore = await deployments.get("LendingPoolCore");
  const lendingPool = await deployments.get("LendingPool");
  const lendingPoolDataProvider = await deployments.get(
    "LendingPoolDataProvider",
  );
  const chainLinkProxyPriceProvider = await deployments.get(
    "ChainLinkProxyPriceProvider",
  );
  const feeProvider = await deployments.get("FeeProvider");
  const tokenDistributor = await deployments.get("TokenDistributor");

  const execute = async (methodName: string, ...args: unknown[]) => {
    await hre.deployments.execute(
      "AddressesProvider",
      txSettings,
      methodName,
      ...args,
    );
  };

  await execute("setLendingPoolCoreImpl", lendingPoolCore.address);
  await execute("setLendingPoolImpl", lendingPool.address);
  await execute(
    "setLendingPoolDataProviderImpl",
    lendingPoolDataProvider.address,
  );
  await execute("setPriceOracle", chainLinkProxyPriceProvider.address);
  await execute("setFeeProviderImpl", feeProvider.address);
  await execute("setTokenDistributor", tokenDistributor.address);
};

setupFunction.tags = [];

export default setupFunction;
