import hre from "hardhat";
import {Scenario} from "./types";

import DEPOSIT_SCENARIO from './scenarios/deposit.json';
import {executeStory} from "../../lib/test/scenarios/scenario-engine";

const scenario = [
    DEPOSIT_SCENARIO as Scenario
];

describe('Scenario tests', () => {
    let users: string[] = [];

    before(async () => {
        users = await hre.getUnnamedAccounts();
    });

    scenario.forEach((scenario) => {
        describe.only(scenario.title, () => {
            scenario.stories.forEach((story) => {
                it(story.description, async () => {
                    await executeStory(story, users);
                });
            });
        });
    });
});




