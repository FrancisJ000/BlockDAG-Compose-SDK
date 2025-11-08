import type {AssetConfig} from '../types';

/**
 * Mezo Testnet Assets Configuration
 * 
 * Supported assets on Mezo Testnet (Chain ID: 31611)
 * All prices fetched via Mezo's native oracles (Skip Connect + Pyth Network)
 */
export const MEZO_TESTNET_ASSETS: AssetConfig[] = [
    {
        name: "BTC",
        symbol: "BTC",
        contractAddress: "0x7b7C000000000000000000000000000000000000",
        priceFeedAddress: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43", // Using WBTC feed as proxy
        priceFeedDecimals: 8,
        tokenDecimals: 18,
        type: "native",
        description: "Native Bitcoin on Mezo Testnet",
        logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png",
    },
    {
        name: "MUSD",
        symbol: "MUSD",
        contractAddress: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
        priceFeedAddress: "0x14866185B1962B63C3Ea9E03Bc1da838bab34C19", // Using DAI feed as $1 proxy
        priceFeedDecimals: 8,
        tokenDecimals: 18,
        type: "stablecoin",
        description: "Mezo's Bitcoin-backed stablecoin (Testnet)",
        logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/37163.png",
    },
    {
        name: "mUSDC",
        symbol: "mUSDC",
        contractAddress: "0x04671C72Aab5AC02A03c1098314b1BB6B560c197",
        priceFeedAddress: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E",
        priceFeedDecimals: 8,
        tokenDecimals: 6,
        type: "stablecoin",
        description: "Bridged USDC on Mezo Testnet",
        logo: "https://coin-images.coingecko.com/coins/images/6319/large/usdc.png?1696506694",
    },
    {
        name: "mUSDT",
        symbol: "mUSDT",
        contractAddress: "0xeB5a5d39dE4Ea42C2Aa6A57EcA2894376683bB8E",
        priceFeedAddress: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E", // Using USDC feed as proxy
        priceFeedDecimals: 8,
        tokenDecimals: 6,
        type: "stablecoin",
        description: "Bridged USDT on Mezo Testnet",
        logo: "https://coin-images.coingecko.com/coins/images/325/large/Tether.png",
    },
];

