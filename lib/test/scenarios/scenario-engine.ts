import {Action, Story} from "../../../test/scenario/types";
import {approve, transfer} from "./actions";

export const executeStory = async (story: Story, users: string[]) => {
    for (const action of story.actions) {
        await executeAction(action, users);
    }
};

const executeAction = async (action: Action, users: string[]) => {
    const {reserve, user} = action.args;
    const {name, expected, revertMessage} = action;

    if (!name || name === '') {
        throw 'Action name is missing';
    }
    if (!reserve || reserve === '') {
        throw 'Invalid reserve selected for deposit';
    }
    if (!user || user === '') {
        throw `Invalid user selected to deposit into the ${reserve} reserve`;
    }

    if (!expected) {
        throw `An expected result for action ${name} is required`;
    }

    const userAddress = users[parseInt(user)];

    switch (name) {
        case 'transfer':
            const { amount} = action.args;

            if (!amount || amount === '') {
                throw `Invalid amount of ${reserve} to transfer`;
            }

            await transfer(reserve, amount, userAddress);
            break;

        case 'approve':
            await approve(reserve, userAddress);
            break;
    }
};
