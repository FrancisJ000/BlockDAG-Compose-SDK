import { encodeFunctionData, type Address, type Hex } from 'viem';
import { MEZO_COMPOSE_CONTRACT, NATIVE_SENTINEL } from '../contracts/MezoCompose';
import { MEZO_ROUTER, MEZO_ROUTER_ABI, buildSwapRoute } from '../contracts/MezoRouter';
import type { PurchaseItem } from '../types';

// ERC20 minimal ABI for approvals
const IERC20_MIN_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export interface BatchCall {
  to: Address;
  data: Hex;
}

export interface SwapExecuteParams {
  inTokens: Address[];
  inAmounts: bigint[];
  target: Address;
  callData: Hex;
  paymentTokenAmount: bigint;
  minOut?: bigint;
}
/**
 * Builds approval transactions for ERC20 tokens
 */
export function buildApprovalTransactions(
  items: PurchaseItem[],
  spender: Address = MEZO_COMPOSE_CONTRACT.testnet.address,
  chainId: number = 31611 // Mezo testnet
): BatchCall[] {
  const approveCalls: BatchCall[] = [];
  const tokenAmounts = new Map<Address, bigint>();

  // Accumulate amounts by token (in case of duplicates)
  for (const item of items) {
    const tokenAddress = item.asset.contractAddress;
    if (!tokenAddress) continue; // Skip native tokens
    if (tokenAddress.toLowerCase() === NATIVE_SENTINEL.toLowerCase()) continue; // Skip native sentinel
    if (item.allocation.tokenAmountBig === 0n) continue; // Skip zero amounts

    const existing = tokenAmounts.get(tokenAddress as Address) ?? 0n;
    tokenAmounts.set(tokenAddress as Address, existing + item.allocation.tokenAmountBig);
  }

  // Create approval calls
  for (const [tokenAddress, amount] of tokenAmounts) {
    const data = encodeFunctionData({
      abi: IERC20_MIN_ABI,
      functionName: "approve",
      args: [spender, amount],
    });

    approveCalls.push({
      to: tokenAddress,
      data,
    });
  }

  return approveCalls;
}

/**
 * Builds token arrays for SwapPay execute function
 */
export function buildTokenArrays(items: PurchaseItem[]): {
  inTokens: Address[];
  inAmounts: bigint[];
} {
  console.error('🔍 Building token arrays from', items.length, 'items');
  const tokenMap = new Map<string, { address: Address; amount: bigint }>();

  // Accumulate by token address (preserving order of first appearance)
  for (const item of items) {
    const tokenAddress = item.asset.contractAddress;
    console.error(`📋 Processing ${item.asset.symbol}: ${tokenAddress}, amount: ${item.allocation.tokenAmountBig.toString()}`);
    
    if (!tokenAddress) {
      console.error(`⚠️ Skipping ${item.asset.symbol} - no contract address (native token)`);
      continue; // Skip native tokens
    }
    if (tokenAddress.toLowerCase() === NATIVE_SENTINEL.toLowerCase()) {
      console.error(`⚠️ Skipping ${item.asset.symbol} - native sentinel`);
      continue; // Skip native sentinel
    }
    if (item.allocation.tokenAmountBig === 0n) {
      console.error(`⚠️ Skipping ${item.asset.symbol} - zero amount`);
      continue; // Skip zero amounts
    }

    const key = tokenAddress.toLowerCase();
    const existing = tokenMap.get(key);
    
    if (existing) {
      console.error(`📈 Adding to existing ${item.asset.symbol}: ${existing.amount.toString()} + ${item.allocation.tokenAmountBig.toString()}`);
      existing.amount += item.allocation.tokenAmountBig;
    } else {
      console.error(`➕ Adding new token ${item.asset.symbol}: ${item.allocation.tokenAmountBig.toString()}`);
      tokenMap.set(key, {
        address: tokenAddress as Address,
        amount: item.allocation.tokenAmountBig,
      });
    }
  }

  // Convert to arrays
  const inTokens: Address[] = [];
  const inAmounts: bigint[] = [];

  for (const { address, amount } of tokenMap.values()) {
    inTokens.push(address);
    inAmounts.push(amount);
  }

  console.error('✅ Final token arrays:', {
    tokens: inTokens,
    amounts: inAmounts.map(a => a.toString())
  });

  return { inTokens, inAmounts };
}

/**
 * Builds MezoCompose execute function call data
 */
export function buildMezoComposeExecuteCalldata(
  params: SwapExecuteParams,
  chainId: number = 31611 // Mezo testnet
): Hex {
  const {
    inTokens,
    inAmounts,
    target,
    callData,
    paymentTokenAmount,
    minOut = 0n,
  } = params;

  // Validation
  if (inTokens.length !== inAmounts.length) {
    throw new Error("TOKEN_AMOUNT_MISMATCH: inTokens.length !== inAmounts.length");
  }
  if (inTokens.length === 0) {
    throw new Error("EMPTY_ARRAYS: no tokens selected");
  }
  if (paymentTokenAmount <= 0n) {
    throw new Error("INVALID_PAYMENT_AMOUNT: paymentTokenAmount must be > 0");
  }

  // Use Mezo testnet contract
  const contract = MEZO_COMPOSE_CONTRACT.testnet;

  return encodeFunctionData({
    abi: contract.abi,
    functionName: "execute",
    args: [inTokens, inAmounts, target, callData, paymentTokenAmount, minOut],
  });
}

/**
 * Builds complete batch transaction for swap execution
 */
export function buildSwapBatchTransaction(
  items: PurchaseItem[],
  target: Address,
  targetCallData: Hex,
  paymentTokenAmount: bigint,
  chainId: number = 31611 // Mezo testnet
): BatchCall[] {
  console.error('🔧 Building swap batch transaction...');
  console.error('📦 Input items:', items.length);
  console.error('🎯 Target contract:', target);
  console.error('💰 Payment amount:', paymentTokenAmount.toString());
  
  // Use Mezo testnet contract
  const contract = MEZO_COMPOSE_CONTRACT.testnet;
  
  // 1. Build approval transactions
  const approvalCalls = buildApprovalTransactions(items, contract.address, chainId);
  console.error('✅ Built', approvalCalls.length, 'approval transactions');

  // 2. Build token arrays
  const { inTokens, inAmounts } = buildTokenArrays(items);
  console.error('📋 Token arrays:', { inTokens, inAmounts: inAmounts.map(a => a.toString()) });

  // 3. Build MezoCompose execute call
  const executeData = buildMezoComposeExecuteCalldata({
    inTokens,
    inAmounts,
    target,
    callData: targetCallData,
    paymentTokenAmount,
  }, chainId);
  console.error('⚙️ MezoCompose execute data built, length:', executeData.length);

  // 4. Combine into batch
  const batchCalls: BatchCall[] = [
    ...approvalCalls, // ERC20 approvals first
    {
      to: contract.address,
      data: executeData,
    },
  ];

  console.error('🔗 Total batch calls:', batchCalls.length);
  batchCalls.forEach((call, i) => {
    console.error(`📋 Call ${i + 1}: ${call.to} (${call.data.slice(0, 10)}...)`);
  });

  return batchCalls;
}

/**
 * Router Swap Functions
 */

export interface RouterSwapParams {
  fromToken: Address;
  toToken: Address;
  amountIn: bigint;
  amountOutMin: bigint;
  recipient: Address;
  deadline?: bigint;
  chainId?: number;
}

/**
 * Builds calldata for Router.swapExactTokensForTokens
 */
export function buildRouterSwapCalldata(params: RouterSwapParams): Hex {
  const {
    fromToken,
    toToken,
    amountIn,
    amountOutMin,
    recipient,
    deadline = BigInt(Math.floor(Date.now() / 1000) + 1200), // 20 minutes
    chainId = 31611,
  } = params;

  // Build the swap route
  const routes = buildSwapRoute(fromToken, toToken);

  return encodeFunctionData({
    abi: MEZO_ROUTER_ABI,
    functionName: 'swapExactTokensForTokens',
    args: [amountIn, amountOutMin, routes, recipient, deadline],
  });
}

/**
 * Builds complete batch transaction for a single Router swap
 * (Approval + Swap)
 */
export function buildRouterSwapTransaction(
  params: RouterSwapParams,
  chainId: number = 31611
): BatchCall[] {
  const routerAddress = chainId === 31611
    ? MEZO_ROUTER.testnet.address
    : MEZO_ROUTER.mainnet.address;

  // 1. Build approval transaction
  const approvalData = encodeFunctionData({
    abi: IERC20_MIN_ABI,
    functionName: 'approve',
    args: [routerAddress, params.amountIn],
  });

  const approvalCall: BatchCall = {
    to: params.fromToken,
    data: approvalData,
  };

  // 2. Build swap transaction
  const swapData = buildRouterSwapCalldata(params);
  const swapCall: BatchCall = {
    to: routerAddress,
    data: swapData,
  };

  return [approvalCall, swapCall];
}

/**
 * Builds MezoCompose.allocate function call data
 * This is the simpler version that just transfers tokens to the contract
 */
export function buildAllocateCalldata(
  items: PurchaseItem[],
  chainId: number = 31611
): Hex {
  const { inTokens, inAmounts } = buildTokenArrays(items);

  // Validation
  if (inTokens.length !== inAmounts.length) {
    throw new Error("TOKEN_AMOUNT_MISMATCH");
  }
  if (inTokens.length === 0) {
    throw new Error("EMPTY_ARRAYS");
  }

  const contract = MEZO_COMPOSE_CONTRACT.testnet;

  return encodeFunctionData({
    abi: contract.abi,
    functionName: 'allocate',
    args: [inTokens, inAmounts],
  });
}

/**
 * Builds complete batch transaction for allocation
 * (Approvals + Allocate)
 */
export function buildAllocateBatchTransaction(
  items: PurchaseItem[],
  chainId: number = 31611
): BatchCall[] {
  const contract = MEZO_COMPOSE_CONTRACT.testnet;

  // 1. Build approval transactions
  const approvalCalls = buildApprovalTransactions(items, contract.address, chainId);

  // 2. Build allocate call
  const allocateData = buildAllocateCalldata(items, chainId);
  const allocateCall: BatchCall = {
    to: contract.address,
    data: allocateData,
  };

  return [...approvalCalls, allocateCall];
}
