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

// TODO: add more action args types with OR
type ActionArgs = DepositActionArgs | BorrowActionArgs;

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
