import hre from "hardhat";
import { Scenario } from "./types";

import DEPOSIT_SCENARIO from "./scenarios/deposit.json";
import { executeStory } from "../../lib/test/scenarios/scenario-engine";
import { setConfig as setActionsConfig } from "../../lib/test/scenarios/actions";
import { setConfig as setCalcConfig } from "../../lib/test/calculations";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { setupContracts } from "../../lib/test/scenarios/common";
import { ETH, SYMBOLS } from "../../lib/constants/tokens";
import { STRATEGY_VOLATILE_ONE } from "../../lib/constants/reserves";

const scenarioSpec = [DEPOSIT_SCENARIO as Scenario];

describe("Scenario tests", () => {
  let users: string[] = [];

  before(async () => {
    users = await hre.getUnnamedAccounts();
  });

  scenarioSpec.forEach((scenario) => {
    describe(scenario.title, () => {
      before(async () => {
        const {
          lendingPool,
          lendingPoolCore,
          aTokensPerSymbol,
          aTokensPerAddress,
        } = await loadFixture(setupContracts);

        // Prepare config for actions module
        setActionsConfig({
          contracts: {
            lendingPool,
            lendingPoolCore,
            aTokensPerSymbol,
            aTokensPerAddress,
          },
          ethereumAddress: ETH,
          skipIntegrityCheck: false,
        });

        // Prepare config for calculations module
        setCalcConfig({
          reservesParams: new Map([
            [SYMBOLS.ETH, STRATEGY_VOLATILE_ONE],
            [SYMBOLS.DAI, STRATEGY_VOLATILE_ONE],
            [SYMBOLS.USDC, STRATEGY_VOLATILE_ONE],
          ]),
          ethereumAddress: ETH,
        });
      });

      scenario.stories.forEach((story) => {
        it(story.description, async () => {
          await executeStory(story, users);
        });
      });
    });
  });
});
