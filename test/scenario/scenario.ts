import {Scenario, Story} from "./types";

const DEPOSIT_SCENARIO = require('./fixtures/deposit.json');

const scenario = [
    DEPOSIT_SCENARIO as Scenario
];


const executeStory = async (story: Story) => {
    console.dir(story.description, { depth: null });
}

scenario.forEach((scenario) => {
   describe(scenario.title, () => {
        scenario.stories.forEach((story) => {
           it(story.description, async () => {
               await executeStory(story);
           });
       });
   });
});
