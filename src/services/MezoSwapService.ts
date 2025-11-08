/**
 * Mezo Swap Service
 * 
 * Handles swap calculations, route optimization, and slippage protection
 */

import { createPublicClient, http, type PublicClient } from 'viem';
import { MEZO_ROUTER, MEZO_ROUTER_ABI, buildSwapRoute, type Route } from '../contracts/MezoRouter';

export interface SwapQuote {
    inputAmount: bigint;
    outputAmount: bigint;
    minimumOutput: bigint;
    route: Route[];
    priceImpact: number;
    slippageTolerance: number;
}

export interface SwapParams {
    fromToken: string;
    toToken: string;
    amountIn: bigint;
    slippageTolerance?: number; // in percentage, e.g., 0.5 for 0.5%
    recipient?: string;
    deadline?: bigint;
}

export class MezoSwapService {
    private client: PublicClient;
    private routerAddress: `0x${string}`;

    constructor(rpcUrl: string, chainId: number = 31611) {
        this.client = createPublicClient({
            transport: http(rpcUrl),
        }) as PublicClient;

        // Select router based on chainId
        this.routerAddress = chainId === 31611 
            ? MEZO_ROUTER.testnet.address 
            : MEZO_ROUTER.mainnet.address;
    }

    /**
     * Get a quote for swapping tokens
     */
    async getSwapQuote(params: SwapParams): Promise<SwapQuote> {
        const { fromToken, toToken, amountIn, slippageTolerance = 0.5 } = params;

        // Build the optimal route
        const route = buildSwapRoute(fromToken, toToken);

        try {
            // Get expected output amount from router
            const amounts = await this.client.readContract({
                address: this.routerAddress,
                abi: MEZO_ROUTER_ABI,
                functionName: 'getAmountsOut',
                args: [amountIn, route as readonly { from: `0x${string}`; to: `0x${string}`; stable: boolean; }[]],
            }) as bigint[];

            const outputAmount = amounts[amounts.length - 1];

            // Calculate minimum output with slippage
            const slippageMultiplier = BigInt(Math.floor((100 - slippageTolerance) * 100));
            const minimumOutput = (outputAmount * slippageMultiplier) / 10000n;

            // Calculate price impact (simplified)
            // In production, you'd want to compare against oracle prices
            const priceImpact = 0; // TODO: Calculate actual price impact

            return {
                inputAmount: amountIn,
                outputAmount,
                minimumOutput,
                route,
                priceImpact,
                slippageTolerance,
            };
        } catch (error) {
            console.error('Failed to get swap quote:', error);
            throw new Error('Failed to calculate swap quote. Pool may not have sufficient liquidity.');
        }
    }

    /**
     * Get multiple swap quotes for different routes
     * Useful for finding the best route
     */
    async getMultipleQuotes(
        fromToken: string,
        toToken: string,
        amountIn: bigint,
        slippageTolerance: number = 0.5
    ): Promise<SwapQuote[]> {
        // For now, we only support one route per pair
        // In the future, you could compare multiple routes
        const quote = await this.getSwapQuote({
            fromToken,
            toToken,
            amountIn,
            slippageTolerance,
        });

        return [quote];
    }

    /**
     * Calculate the total output for swapping multiple tokens to a single target token
     */
    async calculateMultiSwapOutput(
        swaps: Array<{ fromToken: string; amount: bigint }>,
        toToken: string,
        slippageTolerance: number = 0.5
    ): Promise<{
        totalOutput: bigint;
        quotes: SwapQuote[];
        minimumTotalOutput: bigint;
    }> {
        const quotes: SwapQuote[] = [];

        for (const swap of swaps) {
            if (swap.amount > 0n) {
                const quote = await this.getSwapQuote({
                    fromToken: swap.fromToken,
                    toToken,
                    amountIn: swap.amount,
                    slippageTolerance,
                });
                quotes.push(quote);
            }
        }

        const totalOutput = quotes.reduce((sum, q) => sum + q.outputAmount, 0n);
        const minimumTotalOutput = quotes.reduce((sum, q) => sum + q.minimumOutput, 0n);

        return {
            totalOutput,
            quotes,
            minimumTotalOutput,
        };
    }

    /**
     * Format swap quote for display
     */
    formatSwapQuote(quote: SwapQuote, fromDecimals: number, toDecimals: number): {
        inputDisplay: string;
        outputDisplay: string;
        minimumOutputDisplay: string;
        priceDisplay: string;
        routeDisplay: string;
    } {
        const inputDisplay = (Number(quote.inputAmount) / Math.pow(10, fromDecimals)).toFixed(6);
        const outputDisplay = (Number(quote.outputAmount) / Math.pow(10, toDecimals)).toFixed(6);
        const minimumOutputDisplay = (Number(quote.minimumOutput) / Math.pow(10, toDecimals)).toFixed(6);
        
        const price = Number(quote.outputAmount) / Number(quote.inputAmount);
        const priceDisplay = price.toFixed(6);

        const routeDisplay = quote.route
            .map(r => `${this.getTokenSymbol(r.from)} → ${this.getTokenSymbol(r.to)}${r.stable ? ' (Stable)' : ''}`)
            .join(' → ');

        return {
            inputDisplay,
            outputDisplay,
            minimumOutputDisplay,
            priceDisplay,
            routeDisplay,
        };
    }

    private getTokenSymbol(address: string): string {
        const addr = address.toLowerCase();
        if (addr.includes('7b7c00000')) return 'BTC';
        if (addr.includes('118917a')) return 'MUSD';
        if (addr.includes('04671c7')) return 'mUSDC';
        if (addr.includes('eb5a5d3')) return 'mUSDT';
        return address.slice(0, 6) + '...';
    }
}

// Export a singleton for testnet
export const mezoSwapService = new MezoSwapService('https://rpc.test.mezo.org', 31611);

