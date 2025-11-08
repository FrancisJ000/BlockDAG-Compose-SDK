# EIP-5792 Batch Transactions

Mezo Compose SDK supports atomic batch transactions via EIP-5792, enabling multiple transactions to be signed and executed as a single unit with MetaMask Smart Accounts.

## What are Batch Transactions?

Batch transactions allow you to:
- **Sign once, execute many** - Multiple transactions with a single signature
- **Atomic execution** - All transactions succeed or fail together
- **Lower gas costs** - Single transaction fee instead of multiple
- **Better UX** - One confirmation popup instead of many

## Prerequisites

MetaMask Smart Account is required for batch transactions. When you attempt a batch transaction, MetaMask will prompt users to upgrade their account if needed.

## Basic Usage

### 1. Check if Batch Calls are Supported

```typescript
import { checkBatchCallsSupport } from 'mezo-compose-sdk';
import { useWalletClient } from 'wagmi';

const { data: walletClient } = useWalletClient();

const isSupported = await checkBatchCallsSupport(walletClient);
// Returns true if status is 'supported' or 'ready'
// 'ready' means user needs to upgrade to MetaMask Smart Account
```

### 2. Send Batch Calls

```typescript
import { sendBatchCalls } from 'mezo-compose-sdk';
import type { Call } from 'mezo-compose-sdk';

// Prepare your calls
const calls: Call[] = [
  {
    to: '0x...', // Token address
    data: '0x...', // approve() calldata
    value: 0n
  },
  {
    to: '0x...', // Router address  
    data: '0x...', // swap() calldata
    value: 0n
  }
];

// Send atomically
const batchId = await sendBatchCalls(walletClient, calls, {
  atomicRequired: true // Ensure all-or-nothing execution
});

console.log('Batch ID:', batchId);
```

### 3. Track Batch Status

```typescript
import { getBatchCallStatus, waitForBatchCalls } from 'mezo-compose-sdk';

// Option A: Poll for status manually
const status = await getBatchCallStatus(walletClient, batchId);

if (status.status === 200) {
  console.log('✅ Confirmed!');
  console.log('Transaction:', status.receipts[0].transactionHash);
}

// Option B: Wait for confirmation automatically
const txHash = await waitForBatchCalls(walletClient, batchId, {
  timeout: 60000, // 60 seconds
  pollingInterval: 1000 // Check every second
});

console.log('Transaction hash:', txHash);
```

### 4. Execute with Automatic Fallback

```typescript
import { executeBatchCalls } from 'mezo-compose-sdk';

const result = await executeBatchCalls(walletClient, calls, {
  onFallback: () => {
    console.log('⚠️ Batch not supported, using sequential transactions');
  },
  onSuccess: (txHash) => {
    console.log('✅ Batch executed:', txHash);
  },
  onError: (error) => {
    console.error('❌ Error:', error);
  }
});

if (result.usedBatch) {
  console.log('Used atomic batch:', result.txHash);
} else {
  console.log('Fell back to sequential transactions');
}
```

## Real-World Example: Approve + Swap

Here's a practical example from our demo app:

```typescript
import { 
  checkBatchCallsSupport,
  executeBatchCalls,
  buildApprovalTransactions,
  buildRouterSwapTransaction
} from 'mezo-compose-sdk';
import { useWalletClient } from 'wagmi';

function SwapComponent() {
  const { data: walletClient } = useWalletClient();
  const [useBatch, setUseBatch] = useState(false);

  useEffect(() => {
    // Check support on mount
    if (walletClient) {
      checkBatchCallsSupport(walletClient).then(setUseBatch);
    }
  }, [walletClient]);

  const handleSwap = async () => {
    // Build approval transaction
    const approvalTxs = buildApprovalTransactions({
      tokens: [tokenIn],
      amounts: [amountIn],
      spender: MEZO_ROUTER.testnet,
      chainId: 31611
    });

    // Build swap transaction  
    const swapTx = buildRouterSwapTransaction({
      tokenIn,
      tokenOut,
      amountIn,
      amountOutMin,
      route,
      deadline,
      account: address
    });

    const calls = [
      {
        to: approvalTxs[0].to,
        data: approvalTxs[0].data,
        value: 0n
      },
      {
        to: swapTx.to,
        data: swapTx.data,
        value: swapTx.value || 0n
      }
    ];

    if (useBatch) {
      // Execute atomically
      await executeBatchCalls(walletClient, calls, {
        onSuccess: (txHash) => {
          console.log('✅ Swap completed:', txHash);
        },
        onFallback: () => {
          // Fallback to sequential if batch fails
          executeSequential();
        }
      });
    } else {
      // Execute sequentially
      await executeSequential();
    }
  };

  return (
    <button onClick={handleSwap}>
      {useBatch ? '⚡ Batch Swap' : 'Swap'}
    </button>
  );
}
```

## Status Codes

The `wallet_getCallsStatus` method returns HTTP-style status codes:

| Status | Meaning |
|--------|---------|
| `200` | Confirmed - Transaction successful |
| `400+` | Error - Transaction failed |
| Other | Pending - Still processing |

## Type Definitions

```typescript
interface Call {
  to: Address;
  data: `0x${string}`;
  value?: bigint;
}

interface BatchCallStatus {
  version: string;
  chainId: string;
  id: string;
  status: number; // 200 = confirmed
  atomic: boolean; // Whether executed atomically
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
```

## Best Practices

1. **Always check support first** - Not all wallets/networks support batch calls
2. **Provide fallback** - Use `executeBatchCalls` for automatic fallback
3. **Handle upgrades gracefully** - Let users know if they need to upgrade to Smart Account
4. **Test on testnet** - Verify batch behavior before mainnet deployment
5. **Monitor status** - Use `waitForBatchCalls` for better UX

## Limitations

- Requires MetaMask Smart Account (user will be prompted to upgrade)
- Not supported on all networks
- Third-party smart contract accounts may not be compatible
- Atomic execution only (no sequential mode via `wallet_sendCalls`)

## Network Support Status

### Current Status

**Mezo Testnet (Chain ID: 31611):** EIP-5792 not yet deployed
- The SDK automatically uses **sequential mode** (standard approvals)
- All functionality works normally, just with multiple signatures
- When EIP-5792 becomes available, the SDK will automatically detect and switch to batch mode

### Future Support

The SDK is fully ready for batch transactions and will automatically enable them when:
- Mezo Testnet/Mainnet deploys EIP-5792 support
- MetaMask Smart Accounts become available on the network
- Other EVM chains with EIP-5792 support

Check MetaMask's documentation for the latest list of supported networks.

## Learn More

- [EIP-5792 Specification](https://eips.ethereum.org/EIPS/eip-5792)
- [MetaMask Batch Transactions Guide](https://docs.metamask.io/wallet/how-to/send-batch-transactions/)
- [MetaMask Smart Accounts](https://docs.metamask.io/delegation-toolkit/)
- [ERC-4337 Account Abstraction](https://eips.ethereum.org/EIPS/eip-4337)

