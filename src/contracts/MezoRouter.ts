/**
 * Mezo Router Contract
 * 
 * Aerodrome-style DEX router for token swaps on Mezo
 * Supports both volatile (constant product) and stable (curve) pools
 */

export const MEZO_ROUTER_ABI = [
    {
        inputs: [
            { internalType: "uint256", name: "amountIn", type: "uint256" },
            { internalType: "uint256", name: "amountOutMin", type: "uint256" },
            {
                components: [
                    { internalType: "address", name: "from", type: "address" },
                    { internalType: "address", name: "to", type: "address" },
                    { internalType: "bool", name: "stable", type: "bool" }
                ],
                internalType: "struct Router.Route[]",
                name: "routes",
                type: "tuple[]"
            },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "deadline", type: "uint256" }
        ],
        name: "swapExactTokensForTokens",
        outputs: [
            { internalType: "uint256[]", name: "amounts", type: "uint256[]" }
        ],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [
            { internalType: "uint256", name: "amountIn", type: "uint256" },
            {
                components: [
                    { internalType: "address", name: "from", type: "address" },
                    { internalType: "address", name: "to", type: "address" },
                    { internalType: "bool", name: "stable", type: "bool" }
                ],
                internalType: "struct Router.Route[]",
                name: "routes",
                type: "tuple[]"
            }
        ],
        name: "getAmountsOut",
        outputs: [
            { internalType: "uint256[]", name: "amounts", type: "uint256[]" }
        ],
        stateMutability: "view",
        type: "function"
    }
] as const;

export interface Route {
    from: `0x${string}`;
    to: `0x${string}`;
    stable: boolean;
}

export const MEZO_ROUTER = {
    testnet: {
        address: "0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9" as `0x${string}`,
        abi: MEZO_ROUTER_ABI,
    },
    mainnet: {
        address: "0x16A76d3cd3C1e3CE843C6680d6B37E9116b5C706" as `0x${string}`,
        abi: MEZO_ROUTER_ABI,
    }
} as const;

/**
 * Pool addresses on Mezo Testnet
 */
export const MEZO_TESTNET_POOLS = {
    "MUSD/BTC": "0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9",
    "MUSD/mUSDC": "0x525F049A4494dA0a6c87E3C4df55f9929765Dc3e",
    "MUSD/mUSDT": "0x27414B76CF00E24ed087adb56E26bAeEEe93494e",
} as const;

/**
 * Token addresses on Mezo Testnet
 */
export const MEZO_TESTNET_TOKENS = {
    BTC: "0x7b7C000000000000000000000000000000000000",
    MUSD: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
    mUSDC: "0x04671C72Aab5AC02A03c1098314b1BB6B560c197",
    mUSDT: "0xeB5a5d39dE4Ea42C2Aa6A57EcA2894376683bB8E",
} as const;

/**
 * Helper to determine if a pool should use stable swap curve
 * Stable pools are for like-assets (stablecoin pairs)
 */
export function isStablePool(tokenA: string, tokenB: string): boolean {
    const stablecoins = [
        MEZO_TESTNET_TOKENS.MUSD.toLowerCase(),
        MEZO_TESTNET_TOKENS.mUSDC.toLowerCase(),
        MEZO_TESTNET_TOKENS.mUSDT.toLowerCase(),
    ];

    const aIsStable = stablecoins.includes(tokenA.toLowerCase());
    const bIsStable = stablecoins.includes(tokenB.toLowerCase());

    return aIsStable && bIsStable;
}

/**
 * Build a route for swapping tokens
 * Routes through MUSD for non-direct pairs
 */
export function buildSwapRoute(fromToken: string, toToken: string): Route[] {
    const from = fromToken.toLowerCase();
    const to = toToken.toLowerCase();
    
    // Check if direct pool exists
    const directPools = [
        { tokens: [MEZO_TESTNET_TOKENS.MUSD, MEZO_TESTNET_TOKENS.BTC], stable: false },
        { tokens: [MEZO_TESTNET_TOKENS.MUSD, MEZO_TESTNET_TOKENS.mUSDC], stable: true },
        { tokens: [MEZO_TESTNET_TOKENS.MUSD, MEZO_TESTNET_TOKENS.mUSDT], stable: true },
    ];

    for (const pool of directPools) {
        const poolTokens = pool.tokens.map(t => t.toLowerCase());
        if (poolTokens.includes(from) && poolTokens.includes(to)) {
            // Direct swap available
            return [{
                from: fromToken as `0x${string}`,
                to: toToken as `0x${string}`,
                stable: pool.stable
            }];
        }
    }

    // Route through MUSD for multi-hop swaps
    // e.g., BTC -> MUSD -> mUSDC
    return [
        {
            from: fromToken as `0x${string}`,
            to: MEZO_TESTNET_TOKENS.MUSD as `0x${string}`,
            stable: isStablePool(fromToken, MEZO_TESTNET_TOKENS.MUSD)
        },
        {
            from: MEZO_TESTNET_TOKENS.MUSD as `0x${string}`,
            to: toToken as `0x${string}`,
            stable: isStablePool(MEZO_TESTNET_TOKENS.MUSD, toToken)
        }
    ];
}

