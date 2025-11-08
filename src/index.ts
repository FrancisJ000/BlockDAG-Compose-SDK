/**
 * Mezo Compose SDK
 * Composable DeFi primitives for building sophisticated Bitcoin-backed applications
 */

// Main Components
export {Assets} from './components/Assets';
export type {AssetsProps} from './components/Assets';

// Hooks
export {usePrices} from './hooks/prices';
export {useBalances} from './hooks/balances';
export {useAssetData} from './hooks/useAssetData';

// Services
export {MezoOracleService, mezoTestnet} from './services/MezoOracleService';
export {MezoSwapService, mezoSwapService} from './services/MezoSwapService';
export type {SwapQuote, SwapParams} from './services/MezoSwapService';

// Utilities
export {PurchaseCalculator} from './utils/purchaseCalculator';

// Transaction Building Utilities
export {
    buildApprovalTransactions,
    buildTokenArrays,
    buildMezoComposeExecuteCalldata,
    buildSwapBatchTransaction,
    buildRouterSwapCalldata,
    buildRouterSwapTransaction,
    buildAllocateCalldata,
    buildAllocateBatchTransaction,
} from './utils/transactionBuilder';
export type {RouterSwapParams} from './utils/transactionBuilder';

// EIP-5792 Batch Calls (Atomic Transactions)
export {
    checkBatchCallsSupport,
    sendBatchCalls,
    getBatchCallStatus,
    waitForBatchCalls,
    executeBatchCalls,
} from './utils/batchCalls';
export type {Call, BatchCallsCapability, BatchCallStatus} from './utils/batchCalls';

// Contracts
export { MEZO_COMPOSE_CONTRACT, NATIVE_SENTINEL } from './contracts/MezoCompose';
export { MEZO_ROUTER, MEZO_ROUTER_ABI, MEZO_TESTNET_TOKENS, MEZO_TESTNET_POOLS, buildSwapRoute, isStablePool } from './contracts/MezoRouter';
export type { Route } from './contracts/MezoRouter';

// Wallet Adapters
export {RainbowKitAdapter} from './adapters/RainbowKitAdapter';
export {MetaMaskAdapter} from './adapters/MetaMaskAdapter';
export type {WalletProvider, WalletContext} from './types/wallet';

// Types
export type {
    TokenPrices,
    TokenBalances,
    AssetConfig,
    AllocationState,
    ProviderConfig,
    PriceService,
    BalanceService,
    AssetDataService,
    PurchaseItem,
    PurchasePayload,
    FeeCalculation,
    FeeConfig,
    BatchCall,
    TargetContract,
    SwapExecuteParams,
    SwapExecutionResult,
} from './types';

// Network Configurations
export {MEZO_TESTNET_CONFIG, MEZO_MAINNET_CONFIG} from './config';
export {MEZO_TESTNET_ASSETS} from './config';

// Formatters
export {formatCurrency, formatPrice, formatBalance, formatTokenBalance} from './utils/formatters';
