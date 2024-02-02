export type DepositActionArgs = {
  reserve: string;
  amount: string;
  user: string;
  sendValue?: string;
};

export type BorrowActionArgs = {
  reserve: string;
  amount: string;
  user: string;
  timeTravel?: string;
};

export type RepayActionArgs = {
  reserve: string;
  amount: string;
  user: string;
  onBehalfOf: string;
  sendValue?: string;
};

export type RedeemActionArgs = {
  reserve: string;
  amount: string;
  user: string;
};

export type TransferActionArgs = {
  reserve: string;
  amount: string;
  user: string;
};

export type SetUseAsCollateralActionArgs = {
  reserve: string;
  useAsCollateral: string;
  user: string;
};

type ActionArgs =
  | DepositActionArgs
  | BorrowActionArgs
  | RepayActionArgs
  | RedeemActionArgs
  | SetUseAsCollateralActionArgs
  | TransferActionArgs;

export type Action = {
  name: string;
  args: ActionArgs;
  expected: "revert" | "success";
  revertMessage?: string;
};

export type Story = {
  description: string;
  skip: boolean;
  actions: Action[];
};

export type Scenario = {
  title: string;
  description: string;
  stories: Story[];
};
