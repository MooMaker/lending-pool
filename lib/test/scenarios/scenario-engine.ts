import {
  Action,
  BorrowActionArgs,
  DepositActionArgs,
  RedeemActionArgs,
  RepayActionArgs,
  Story,
} from "../../../test/scenario/types";
import { approve, borrow, deposit, redeem, repay, transfer } from "./actions";

export const executeStory = async (story: Story, users: string[]) => {
  for (const action of story.actions) {
    await executeAction(action, users);
  }
};

const executeAction = async (action: Action, users: string[]) => {
  const { reserve, user } = action.args;
  const { name, expected, revertMessage } = action;

  if (!name || name === "") {
    throw "Action name is missing";
  }
  if (!reserve || reserve === "") {
    throw "Invalid reserve selected for deposit";
  }
  if (!user || user === "") {
    throw `Invalid user selected to deposit into the ${reserve} reserve`;
  }

  if (!expected) {
    throw `An expected result for action ${name} is required`;
  }

  const userIndex = parseInt(user);
  const userAddress = users[userIndex];

  switch (name) {
    case "transfer": {
      const { amount } = action.args;

      if (!amount || amount === "") {
        throw `Invalid amount of ${reserve} to transfer`;
      }

      await transfer(reserve, amount, userAddress, userIndex);
      break;
    }

    case "approve":
      await approve(reserve, userAddress, userIndex);
      break;

    case "deposit": {
      const { amount, sendValue } = action.args as DepositActionArgs;

      if (!amount || amount === "") {
        throw `Invalid amount to deposit into the ${reserve} reserve`;
      }

      await deposit(
        reserve,
        amount,
        userAddress,
        userIndex,
        sendValue,
        expected,
        revertMessage,
      );
      break;
    }

    case "borrow":
      {
        const { amount, timeTravel } = action.args as BorrowActionArgs;

        if (!amount || amount === "") {
          throw `Invalid amount to borrow from the ${reserve} reserve`;
        }

        await borrow(
          reserve,
          amount,
          userAddress,
          userIndex,
          timeTravel,
          expected,
          revertMessage,
        );
      }
      break;

    case "redeem":
      {
        const { amount } = action.args as RedeemActionArgs;

        if (!amount || amount === "") {
          throw `Invalid amount to redeem from the ${reserve} reserve`;
        }

        await redeem(
          reserve,
          amount,
          userAddress,
          userIndex,
          expected,
          revertMessage,
        );
      }
      break;

    case "repay":
      {
        const { amount, sendValue } = action.args as RepayActionArgs;
        let { onBehalfOf } = action.args as RepayActionArgs;

        if (!amount || amount === "") {
          throw `Invalid amount to repay into the ${reserve} reserve`;
        }

        if (!onBehalfOf || onBehalfOf === "") {
          console.log(
            "WARNING: No onBehalfOf specified for a repay action. Defaulting to the repayer address",
          );
          onBehalfOf = userAddress;
        } else {
          onBehalfOf = users[parseInt(onBehalfOf)];
        }

        await repay(
          reserve,
          amount,
          userAddress,
          userIndex,
          onBehalfOf,
          sendValue,
          expected,
          revertMessage,
        );
      }
      break;
  }
};
