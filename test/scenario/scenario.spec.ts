import hre from "hardhat";
import {Scenario} from "./types";

import DEPOSIT_SCENARIO from './scenarios/deposit.json';
import {executeStory} from "../../lib/test/scenarios/scenario-engine";
import {setConfig as setActionsConfig} from "../../lib/test/scenarios/actions";
import {loadFixture} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {getEnvironment, setupContracts} from "../../lib/test/scenarios/common";
import {ETH} from "../../lib/constants/tokens";

const scenarioSpec = [
    DEPOSIT_SCENARIO as Scenario
];

describe('Scenario tests', () => {
    let users: string[] = [];

    before(async () => {
        users = await hre.getUnnamedAccounts();
    });

    beforeEach(async () => {
        const {
            lendingPool,
            lendingPoolCore,
            aTokensPerSymbol,
            aTokensPerAddress
        } = await loadFixture(setupContracts);

        setActionsConfig({
            contracts: {
                lendingPool,
                lendingPoolCore,
                aTokensPerSymbol,
                aTokensPerAddress
            },
            ethereumAddress: ETH,
            skipIntegrityCheck: false
        })
    });

    scenarioSpec.forEach((scenario) => {
        describe.only(scenario.title, () => {
            scenario.stories.forEach((story) => {
                it(story.description, async () => {
                    await executeStory(story, users);
                });
            });
        });
    });
});




