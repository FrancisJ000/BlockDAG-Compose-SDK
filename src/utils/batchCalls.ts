/**
 * EIP-5792 Wallet Batch Calls Support
 * 
 * Enables atomic multi-transaction execution with a single signature.
 * Falls back to sequential transactions for non-supporting wallets.
 */

import type { Address, WalletClient } from 'viem';

export interface Call {
  to: Address;
  data: `0x${string}`;
  value?: bigint;
}

export interface BatchCallsCapability {
  supported: boolean;
}

export interface BatchCallStatus {
  version: string;
  chainId: string;
  id: string;
  status: number; // HTTP-style status code: 200 = confirmed, 400+ = error
  atomic: boolean; // Whether the calls were executed atomically
  receipts?: Array<{
    logs: Array<{
      address: string;
      topics: string[];
      data: string;
    }>;
    status: string;
    blockHash: string;
    blockNumber: string;
    gasUsed: string;
    transactionHash: string;
  }>;
}

/**
 * Check if wallet supports EIP-5792 batch calls
 * Based on MetaMask's implementation
 */
export async function checkBatchCallsSupport(
  walletClient: WalletClient
): Promise<boolean> {
  try {
    if (!walletClient.account?.address) {
      return false;
    }

    // Check for wallet_getCapabilities as per MetaMask spec
    const capabilities = await walletClient.request({
      method: 'wallet_getCapabilities' as any,
      params: [walletClient.account.address] as any,
    }) as Record<string, {
      atomic?: {
        status: 'supported' | 'ready';
      };
    }>;

    const chainId = await walletClient.getChainId();
    const chainIdHex = `0x${chainId.toString(16)}`;
    const chainCaps = capabilities?.[chainIdHex];
    
    // MetaMask uses "atomic" with "status" field
    const atomicStatus = chainCaps?.atomic?.status;
    return atomicStatus === 'supported' || atomicStatus === 'ready';
  } catch (error) {
    console.log('EIP-5792 not supported, using sequential transactions');
    return false;
  }
}

/**
 * Send multiple transactions atomically using EIP-5792
 * Returns batch ID for tracking status
 * Based on MetaMask's specification
 */
export async function sendBatchCalls(
  walletClient: WalletClient,
  calls: Call[],
  options?: {
    atomicRequired?: boolean; // Whether atomicity is required (default: true)
  }
): Promise<string> {
  if (!walletClient.account?.address) {
    throw new Error('Wallet not connected');
  }

  try {
    const chainId = await walletClient.getChainId();
    
    const batchCallId = await walletClient.request({
      method: 'wallet_sendCalls' as any,
      params: [
        {
          version: '2.0.0', // MetaMask uses version 2.0.0
          chainId: `0x${chainId.toString(16)}`,
          from: walletClient.account.address,
          atomicRequired: options?.atomicRequired ?? true, // MetaMask requires this field
          calls: calls.map(call => ({
            to: call.to,
            data: call.data,
            value: call.value ? `0x${call.value.toString(16)}` : '0x0',
          })),
        },
      ] as any,
    });

    console.log('✅ Batch calls submitted, ID:', batchCallId);
    return batchCallId as string;
  } catch (error) {
    console.error('❌ Batch calls failed:', error);
    throw error;
  }
}

/**
 * Get the status of a batch call
 * Based on MetaMask's specification
 */
export async function getBatchCallStatus(
  walletClient: WalletClient,
  batchCallId: string
): Promise<BatchCallStatus> {
  try {
    const result = await walletClient.request({
      method: 'wallet_getCallsStatus' as any,
      params: [batchCallId] as any,
    });

    console.log('📊 Batch call status:', result);
    return result as BatchCallStatus;
  } catch (error) {
    console.error('❌ Failed to get batch call status:', error);
    throw error;
  }
}

/**
 * Wait for batch calls to be confirmed
 * Based on MetaMask's specification (status code 200 = confirmed)
 */
export async function waitForBatchCalls(
  walletClient: WalletClient,
  batchCallId: string,
  options: {
    timeout?: number; // ms
    pollingInterval?: number; // ms
  } = {}
): Promise<string> {
  const { timeout = 60000, pollingInterval = 1000 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const status = await getBatchCallStatus(walletClient, batchCallId);

    // Status code 200 means confirmed
    if (status.status === 200) {
      const txHash = status.receipts?.[0]?.transactionHash;
      if (txHash) {
        console.log('✅ Batch confirmed:', txHash);
        return txHash;
      }
      throw new Error('Batch confirmed but no transaction hash found');
    }
    
    // Check for error status codes (4xx, 5xx)
    if (status.status >= 400) {
      throw new Error(`Batch call failed with status code: ${status.status}`);
    }

    await new Promise(resolve => setTimeout(resolve, pollingInterval));
  }

  throw new Error('Batch call confirmation timeout');
}

/**
 * Helper to execute batch calls with automatic fallback
 */
export async function executeBatchCalls(
  walletClient: WalletClient,
  calls: Call[],
  options?: {
    onFallback?: () => void;
    onSuccess?: (txHash: string) => void;
    onError?: (error: Error) => void;
  }
): Promise<{ usedBatch: boolean; txHash?: string }> {
  // Check support
  const supported = await checkBatchCallsSupport(walletClient);

  if (supported) {
    try {
      const batchId = await sendBatchCalls(walletClient, calls);
      const txHash = await waitForBatchCalls(walletClient, batchId);
      options?.onSuccess?.(txHash);
      return { usedBatch: true, txHash };
    } catch (error) {
      console.error('Batch execution failed, falling back to sequential:', error);
      options?.onFallback?.();
      return { usedBatch: false };
    }
  } else {
    options?.onFallback?.();
    return { usedBatch: false };
  }
}

