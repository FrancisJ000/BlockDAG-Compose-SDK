import type {ProviderConfig} from '../types';
import {MEZO_TESTNET_ASSETS} from './assets';

/**
 * Mezo Network Configurations
 */

export const MEZO_TESTNET_CONFIG: ProviderConfig = {
    chainId: 31611, // Mezo testnet
    rpcUrl: "https://rpc.test.mezo.org",
    contractAddress: "0x201b0a661d692Bd4938e4A7Ce957209b4288B259", // MezoSwapPay contract (v2 - fixed allocate function)
    supportedAssets: MEZO_TESTNET_ASSETS,
};

// Mezo Mainnet configuration (for future use)
export const MEZO_MAINNET_CONFIG: ProviderConfig = {
    chainId: 31612, // Mezo mainnet
    rpcUrl: "https://rpc-http.mezo.boar.network",
    contractAddress: "0x195a3D95e94aA38D5549bdD50b30428ADfF97991", // TODO: Update with mainnet contract
    supportedAssets: [], // TODO: Add mainnet assets when available
};
