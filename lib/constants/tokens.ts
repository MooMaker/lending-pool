// Internal system representation of ETH token
export const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export const TOKEN_DECIMALS: Map<string, number> = new Map([
    ['ETH', 18],
    ['USDC', 6],
    ['DAI', 18],
]);

export const MAINNET_ADDRESSES = new Map([
    ['ETH', ETH],
    ['USDC', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],
    ['DAI', '0x6B175474E89094C44Da98b954EedeAC495271d0F']
]);
