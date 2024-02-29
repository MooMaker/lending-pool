import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getTokenListForNetwork } from "../../lib/utils/token";
import { SYMBOLS } from "../../lib/constants/tokens";

const RESERVES = [SYMBOLS.ETH, SYMBOLS.DAI, SYMBOLS.USDC, SYMBOLS.LINK];
const RESERVE_LTV = 80n;
const LIQUIDATION_THRESHOLD = 90n;
// TODO: probably should be 101% instead of 1% (Full + bonus)
const LIQUIDATION_BONUS = 1n;

const setupFunction: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployer } = await hre.getNamedAccounts();
  const { deployments } = hre;

  const tokenList = getTokenListForNetwork(hre.network);

  for (const symbol of RESERVES) {
    const reserveAddress = tokenList.get(symbol);
    const strategy = await deployments.get(`${symbol}InterestRateStrategy`);
    const aToken = await deployments.get(`a${symbol}`);

    const decimals = await deployments.read(
      `a${symbol}`,
      { from: deployer },
      "decimals",
    );

    await deployments.execute(
      "LendingPoolCore",
      { from: deployer, log: true },
      "initReserve",
      ...[reserveAddress, aToken.address, decimals, strategy.address],
    );

    await deployments.execute(
      "LendingPoolCore",
      { from: deployer, log: true },
      "enableReserveAsCollateral",
      ...[
        reserveAddress,
        RESERVE_LTV,
        LIQUIDATION_THRESHOLD,
        LIQUIDATION_BONUS,
      ],
    );
  }
};

setupFunction.tags = [];

export default setupFunction;
