// Internal system representation of ETH token
export const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export const SYMBOLS = {
  ETH: "ETH",
  USDC: "USDC",
  DAI: "DAI",
  LINK: "LINK",
};

export const TOKEN_DECIMALS: Map<string, number> = new Map([
  [SYMBOLS.ETH, 18],
  [SYMBOLS.USDC, 6],
  [SYMBOLS.DAI, 18],
  [SYMBOLS.LINK, 18],
]);

export const MAINNET_ADDRESSES = new Map([
  [SYMBOLS.ETH, ETH],
  [SYMBOLS.USDC, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"],
  [SYMBOLS.DAI, "0x6B175474E89094C44Da98b954EedeAC495271d0F"],
  [SYMBOLS.LINK, "0x514910771AF9Ca656af840dff83E8264EcF986CA"],
]);
