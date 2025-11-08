import type {TokenPrices, TokenBalances, ProviderConfig, AssetDataService} from '../types';
import {createPublicClient, http, type Address} from 'viem';
import {defineChain} from 'viem';

// Define Mezo Testnet chain
export const mezoTestnet = defineChain({
    id: 31611,
    name: 'Mezo Testnet',
    network: 'mezo-testnet',
    nativeCurrency: {
        decimals: 18,
        name: 'Bitcoin',
        symbol: 'BTC',
    },
    rpcUrls: {
        default: {
            http: ['https://rpc.test.mezo.org'],
            webSocket: ['wss://rpc-ws.test.mezo.org'],
        },
        public: {
            http: ['https://rpc.test.mezo.org'],
            webSocket: ['wss://rpc-ws.test.mezo.org'],
        },
    },
    blockExplorers: {
        default: { name: 'Explorer', url: 'https://explorer.test.mezo.org' },
    },
});

// Skip Oracle (Chainlink-compatible) - BTC/USD
const SKIP_ORACLE_ADDRESS = '0x7b7c000000000000000000000000000000000015' as const;

// Pyth Oracle
const PYTH_ORACLE_ADDRESS = '0x2880aB155794e7179c9eE2e38200202908C17B43' as const;

// Pyth Price Feed IDs
const PYTH_PRICE_FEEDS = {
    MUSD_USD: '0x0617a9b725011a126a2b9fd53563f4236501f32cf76d877644b943394606c6de',
    BTC_USD: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    USDC_USD: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
    USDT_USD: '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b',
} as const;

// Skip Oracle ABI (Chainlink-compatible)
const SKIP_ORACLE_ABI = [
    {
        inputs: [],
        name: 'latestRoundData',
        outputs: [
            { name: 'roundId', type: 'uint80' },
            { name: 'answer', type: 'int256' },
            { name: 'startedAt', type: 'uint256' },
            { name: 'updatedAt', type: 'uint256' },
            { name: 'answeredInRound', type: 'uint80' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'decimals',
        outputs: [{ name: '', type: 'uint8' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// Pyth Oracle ABI
const PYTH_ORACLE_ABI = [
    {
        inputs: [{ name: 'id', type: 'bytes32' }, { name: 'age', type: 'uint256' }],
        name: 'getPriceNoOlderThan',
        outputs: [
            {
                components: [
                    { name: 'price', type: 'int64' },
                    { name: 'conf', type: 'uint64' },
                    { name: 'expo', type: 'int32' },
                    { name: 'publishTime', type: 'uint256' },
                ],
                name: 'price',
                type: 'tuple',
            },
        ],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// ERC20 ABI for balance checking
const ERC20_ABI = [
    {
        inputs: [{ name: 'account', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

export class MezoOracleService implements AssetDataService {
    private publicClient: any;

    constructor(private config: ProviderConfig) {
        this.publicClient = createPublicClient({
            chain: mezoTestnet,
            transport: config.rpcUrl ? http(config.rpcUrl) : http(),
        });
    }

    /**
     * Normalize price from one decimal precision to another
     * @param price - The price value
     * @param fromDecimals - Source decimal precision
     * @param toDecimals - Target decimal precision (typically 8 for USD feeds)
     */
    private normalizePrice(price: bigint, fromDecimals: number, toDecimals: number): bigint {
        if (fromDecimals === toDecimals) return price;
        
        if (fromDecimals > toDecimals) {
            // Reduce precision
            const divisor = BigInt(10) ** BigInt(fromDecimals - toDecimals);
            return price / divisor;
        } else {
            // Increase precision
            const multiplier = BigInt(10) ** BigInt(toDecimals - fromDecimals);
            return price * multiplier;
        }
    }

    async getPrices(): Promise<TokenPrices> {
        try {
            //console.log('📊 Fetching prices from Mezo oracles...');

            // Fetch BTC price from Skip Oracle (Chainlink-compatible)
            const btcData = await this.publicClient.readContract({
                address: SKIP_ORACLE_ADDRESS,
                abi: SKIP_ORACLE_ABI,
                functionName: 'latestRoundData',
            }) as any;

           // console.log('🔍 BTC data from Skip Oracle:', btcData);

            // Parse array response: [roundId, answer, startedAt, updatedAt, answeredInRound]
            const btcPrice = Array.isArray(btcData) ? btcData[1] : btcData?.answer;
            
            if (!btcPrice) {
                throw new Error('Skip Oracle returned invalid BTC data');
            }

            // Get decimals to normalize the price
            const btcDecimals = await this.publicClient.readContract({
                address: SKIP_ORACLE_ADDRESS,
                abi: SKIP_ORACLE_ABI,
                functionName: 'decimals',
            }) as number;

           // console.log('🔍 BTC decimals:', btcDecimals);

            // Normalize to 8 decimals (standard for Chainlink USD feeds)
            const btcUsd = this.normalizePrice(BigInt(btcPrice), btcDecimals, 8);

            // Fetch other prices from Pyth Oracle
            const maxAge = 3600; // 1 hour max age

            // MUSD/USD
            let musdData;
            try {
                musdData = await this.publicClient.readContract({
                    address: PYTH_ORACLE_ADDRESS,
                    abi: PYTH_ORACLE_ABI,
                    functionName: 'getPriceNoOlderThan',
                    args: [PYTH_PRICE_FEEDS.MUSD_USD as `0x${string}`, BigInt(maxAge)],
                }) as any;
                //console.log('🔍 MUSD data from Pyth:', musdData);
            } catch (err) {
                console.warn('⚠️ Failed to fetch MUSD price, using $1 default:', err);
                musdData = { price: 100000000n, expo: -8 }; // $1.00
            }

            // USDC/USD
            let usdcData;
            try {
                usdcData = await this.publicClient.readContract({
                    address: PYTH_ORACLE_ADDRESS,
                    abi: PYTH_ORACLE_ABI,
                    functionName: 'getPriceNoOlderThan',
                    args: [PYTH_PRICE_FEEDS.USDC_USD as `0x${string}`, BigInt(maxAge)],
                }) as any;
              //  console.log('🔍 USDC data from Pyth:', usdcData);
            } catch (err) {
                console.warn('⚠️ Failed to fetch USDC price, using $1 default:', err);
                usdcData = { price: 100000000n, expo: -8 }; // $1.00
            }

            // USDT/USD
            let usdtData;
            try {
                usdtData = await this.publicClient.readContract({
                    address: PYTH_ORACLE_ADDRESS,
                    abi: PYTH_ORACLE_ABI,
                    functionName: 'getPriceNoOlderThan',
                    args: [PYTH_PRICE_FEEDS.USDT_USD as `0x${string}`, BigInt(maxAge)],
                }) as any;
             //   console.log('🔍 USDT data from Pyth:', usdtData);
            } catch (err) {
                console.warn('⚠️ Failed to fetch USDT price, using $1 default:', err);
                usdtData = { price: 100000000n, expo: -8 }; // $1.00
            }

            // Convert Pyth prices (they have negative exponents)
            // Pyth returns: price * 10^expo
            // We need to convert to 8 decimals
            const convertPythPrice = (price: bigint, expo: number): bigint => {
                // Pyth expo is typically -8, meaning the price needs to be divided by 10^8
                // But we want 8 decimals, so: price * 10^8 / 10^(-expo)
                // If expo is -8: price * 10^8 / 10^8 = price
                const adjustmentFactor = 8 - Math.abs(expo);
                if (adjustmentFactor > 0) {
                    return price * BigInt(10 ** adjustmentFactor);
                } else if (adjustmentFactor < 0) {
                    return price / BigInt(10 ** Math.abs(adjustmentFactor));
                }
                return price;
            };

            const musdUsd = convertPythPrice(BigInt(musdData.price), Number(musdData.expo));
            const musdcUsd = convertPythPrice(BigInt(usdcData.price), Number(usdcData.expo));
            const musdtUsd = convertPythPrice(BigInt(usdtData.price), Number(usdtData.expo));

            // console.log('✅ Prices fetched:', {
            //     btcUsd: btcUsd.toString(),
            //     musdUsd: musdUsd.toString(),
            //     musdcUsd: musdcUsd.toString(),
            //     musdtUsd: musdtUsd.toString(),
            // });

            return {
                // Legacy fields (for compatibility)
                ethUsd: 0n,
                wbtcUsd: 0n,
                daiUsd: 0n,
                usdcUsd: 0n,
                linkUsd: 0n,
                wstethUsd: 0n,
                // Mezo-specific prices
                btcUsd,
                musdUsd,
                musdcUsd,
                musdtUsd,
            };
        } catch (error) {
            console.error('Failed to fetch prices from Mezo oracles:', error);
            throw new Error('Failed to fetch prices from Mezo oracles');
        }
    }

    async getBalances(address: string): Promise<TokenBalances> {
        try {
         //   console.log('💰 Fetching balances for:', address);

            // Get native BTC balance
            const btcBalance = await this.publicClient.getBalance({
                address: address as Address,
            });

            // Get token balances
            const tokens = this.config.supportedAssets.filter(
                (asset) => asset.contractAddress && asset.contractAddress !== '0x7b7C000000000000000000000000000000000000'
            );

            const tokenBalances = await Promise.all(
                tokens.map(async (token) => {
                    try {
                        const balance = await this.publicClient.readContract({
                            address: token.contractAddress as Address,
                            abi: ERC20_ABI,
                            functionName: 'balanceOf',
                            args: [address as Address],
                        });
                        return { symbol: token.symbol.toLowerCase(), balance };
                    } catch (err) {
                        // Silently return 0 for tokens that don't exist or can't be read
                        return { symbol: token.symbol.toLowerCase(), balance: 0n };
                    }
                })
            );

            const balances: any = {
                // Legacy fields
                eth: 0n,
                wbtc: 0n,
                dai: 0n,
                usdc: 0n,
                link: 0n,
                wsteth: 0n,
                // Mezo balances
                btc: btcBalance,
            };

            // Add token balances
            tokenBalances.forEach(({ symbol, balance }) => {
                balances[symbol] = balance;
            });

         //   console.log('✅ Balances fetched:', balances);

            return balances;
        } catch (error) {
            console.error('Failed to fetch balances:', error);
            throw new Error('Failed to fetch balances');
        }
    }
}

