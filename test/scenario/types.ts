export type DepositActionArgs = {
    reserve: string;
    amount: string;
    user: string,
    sendValue?: string;
}

// TODO: add more action args types with OR
type ActionArgs = DepositActionArgs;

export type Action = {
    name: string,
    args: ActionArgs,
    expected: 'revert' | 'success',
    revertMessage?: string,
}

export type Story = {
    description: string;
    action: Action[]
}

export type Scenario = {
    title: string;
    description: string;
    stories: Story[];
}
