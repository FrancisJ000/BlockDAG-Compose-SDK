import './App.css'
import {MezoOracleService} from "@/services/MezoOracleService.ts";
import {MEZO_TESTNET_CONFIG, MEZO_TESTNET_ASSETS} from "@/config";
import {Assets} from "@/components/Assets.tsx";
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId, useSwitchChain, useWriteContract, useWaitForTransactionReceipt, useWalletClient } from 'wagmi';
import { useEffect, useState } from 'react';
import { MEZO_COMPOSE_CONTRACT } from '@/contracts/MezoCompose';
import { MEZO_ROUTER, MEZO_ROUTER_ABI, buildSwapRoute } from '@/contracts/MezoRouter';
import { mezoSwapService } from '@/services/MezoSwapService';
import { executeBatchCalls, checkBatchCallsSupport } from '@/utils/batchCalls';
import type { PurchasePayload } from '@/types';
import { erc20Abi, encodeFunctionData } from 'viem';

/**
 * Mezo Compose SDK - NFT Purchase Demo
 * 
 * Demonstrates multi-asset payment for NFT purchases
 * Network: Mezo Testnet (Chain ID: 31611)
 * 
 * Features:
 * - Pay for NFTs using multiple tokens in one transaction
 * - Real-time price feeds from Skip Connect + Pyth oracles
 * - Multi-asset support (BTC, MUSD, mUSDC, mUSDT)
 * - Automatic network detection and switching
 * - Wallet integration via RainbowKit
 */
function App() {
    const service = new MezoOracleService(MEZO_TESTNET_CONFIG);
    const { isConnected, address } = useAccount();
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();
    const { data: walletClient } = useWalletClient();
    const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });
    
    const [txStatus, setTxStatus] = useState<'idle' | 'approving' | 'pending' | 'confirming' | 'success' | 'error'>('idle');
    const [lastPayload, setLastPayload] = useState<PurchasePayload | null>(null);
    const [currentApprovalIndex, setCurrentApprovalIndex] = useState<number>(-1);
    const [totalApprovals, setTotalApprovals] = useState<number>(0);
    const [mode, setMode] = useState<'allocate' | 'swap'>('allocate');
    const [swapTargetToken, setSwapTargetToken] = useState<string>(MEZO_TESTNET_ASSETS[1]?.contractAddress || '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503'); // MUSD by default
    const [batchCallsSupported, setBatchCallsSupported] = useState<boolean | null>(null);
    const [usingBatchCalls, setUsingBatchCalls] = useState(false);
    
    const MEZO_TESTNET_CHAIN_ID = 31611;
    const isWrongNetwork = isConnected && chainId !== MEZO_TESTNET_CHAIN_ID;
    
    // Create wallet object for Assets component
    const wallet = {
        isConnected,
        address: address || '',
        chainId
    };

    // Check EIP-5792 batch calls support when wallet connects
    useEffect(() => {
        async function checkSupport() {
            if (walletClient && walletClient.account?.address) {
                try {
                    // Get raw capabilities for debugging
                    const capabilities = await walletClient.request({
                        method: 'wallet_getCapabilities' as any,
                        params: [walletClient.account.address] as any,
                    }).catch(() => null);

                    console.log('🔍 wallet_getCapabilities response:', capabilities);
                    
                    const supported = await checkBatchCallsSupport(walletClient);
                    setBatchCallsSupported(supported);
                    
                    if (supported) {
                        console.log('✅ EIP-5792 batch calls supported - transactions will be atomic!');
                    } else {
                        console.log('ℹ️  EIP-5792 not supported on Mezo Testnet - using sequential transactions');
                        console.log('💡 This is expected - MetaMask Smart Accounts may not be available on this network yet');
                    }
                } catch (error) {
                    console.log('ℹ️  wallet_getCapabilities not available:', error);
                    setBatchCallsSupported(false);
                }
            }
        }
        checkSupport();
    }, [walletClient]);

    // Auto-switch to Mezo Testnet when connected to wrong network
    useEffect(() => {
        if (isWrongNetwork && switchChain) {
            console.log(`⚠️ Wrong network detected (Chain ID: ${chainId}). Switching to Mezo Testnet...`);
            switchChain({ chainId: MEZO_TESTNET_CHAIN_ID });
        }
    }, [isWrongNetwork, chainId, switchChain]);

    // Update transaction status
    useEffect(() => {
        if (isPending && txStatus !== 'approving') {
            setTxStatus('pending');
        } else if (isConfirming && txStatus === 'approving') {
            setTxStatus('confirming');
        } else if (isConfirmed && txStatus === 'confirming') {
            // Transaction just confirmed
            if (currentApprovalIndex >= 0 && lastPayload && totalApprovals > 0) {
                const nextIndex = currentApprovalIndex + 1;
                console.log(`✅ Approval ${currentApprovalIndex + 1}/${totalApprovals} confirmed`);
                
                if (nextIndex < totalApprovals) {
                    // More approvals needed - reset to approving state
                    console.log(`🔄 Moving to approval ${nextIndex + 1}/${totalApprovals}...`);
                    setTxStatus('approving');
                    setCurrentApprovalIndex(nextIndex);
                    // Small delay to ensure state is updated
                    setTimeout(() => approveNextToken(lastPayload, nextIndex, totalApprovals), 500);
                } else {
                    // All approvals done, execute based on mode
                    console.log(`✅ All approvals complete! Executing ${mode}...`);
                    setTxStatus('idle');
                    // Small delay to ensure state is updated
                    setTimeout(() => {
                        if (mode === 'swap') {
                            executeSwap(lastPayload);
                        } else {
                            executeAllocate(lastPayload);
                        }
                    }, 500);
                }
            } else {
                // Not in approval flow, mark as success
                setTxStatus('success');
            }
        } else if (writeError) {
            setTxStatus('error');
        }
    }, [isPending, isConfirming, isConfirmed, writeError]);

    // Approve a single token
    const approveNextToken = (payload: PurchasePayload, index: number, total: number) => {
        const item = payload.items[index];
        console.log(`🔓 Approving token ${index + 1}/${total}: ${item.asset.symbol}`);
        
        // Determine spender based on mode
        const spender = mode === 'swap' 
            ? MEZO_ROUTER.testnet.address 
            : MEZO_COMPOSE_CONTRACT.testnet.address;
        
        writeContract({
            address: item.asset.contractAddress as `0x${string}`,
            abi: erc20Abi,
            functionName: 'approve',
            args: [spender, item.allocation.tokenAmountBig],
        });
    };

    // Execute the allocate transaction
    const executeAllocate = (payload: PurchasePayload) => {
        console.log('✅ All approvals complete, executing allocate...');
        setTxStatus('idle');
        
        const tokens = payload.items.map(item => item.asset.contractAddress as `0x${string}`);
        const amounts = payload.items.map(item => item.allocation.tokenAmountBig);
        
        console.log('🔗 Calling MezoCompose.allocate():', {
            contract: MEZO_COMPOSE_CONTRACT.testnet.address,
            tokens,
            amounts: amounts.map(a => a.toString())
        });

        try {
            writeContract({
                address: MEZO_COMPOSE_CONTRACT.testnet.address,
                abi: MEZO_COMPOSE_CONTRACT.testnet.abi,
                functionName: 'allocate',
                args: [tokens, amounts],
            });
        } catch (err) {
            console.error('❌ Transaction failed:', err);
            setTxStatus('error');
        }
    };

    // Execute swap via Mezo Router
    const executeSwap = async (payload: PurchasePayload) => {
        console.log('✅ All approvals complete, executing swap...');
        setTxStatus('idle');

        try {
            // For now, swap the first item to the target token
            // In a full implementation, you'd handle multiple swaps
            const item = payload.items[0];
            
            if (!item) {
                console.error('❌ No items to swap');
                return;
            }

            const fromToken = item.asset.contractAddress || '';
            const targetSymbol = MEZO_TESTNET_ASSETS.find(a => a.contractAddress === swapTargetToken)?.symbol || 'Unknown';

            console.log('🔄 Attempting swap:', {
                from: item.asset.symbol,
                to: targetSymbol,
                amount: item.allocation.tokenAmountBig.toString(),
                fromAddress: fromToken,
                toAddress: swapTargetToken
            });

            // Build the swap route
            const routes = buildSwapRoute(fromToken, swapTargetToken);
            console.log('📍 Swap route:', routes);

            // Try to get quote, but continue even if it fails
            let minimumOutput = 0n;
            try {
                const quote = await mezoSwapService.getSwapQuote({
                    fromToken,
                    toToken: swapTargetToken,
                    amountIn: item.allocation.tokenAmountBig,
                    slippageTolerance: 1.0, // Increased to 1% for testnet
                    recipient: address,
                });

                minimumOutput = quote.minimumOutput;
                console.log('💱 Swap quote:', {
                    expectedOut: quote.outputAmount.toString(),
                    minimumOut: quote.minimumOutput.toString(),
                });
            } catch (quoteErr) {
                console.warn('⚠️ Could not get quote, proceeding without minimum:', quoteErr);
                // Set a very low minimum (1% of input) as fallback
                minimumOutput = item.allocation.tokenAmountBig / 100n;
            }

            const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 minutes

            console.log('🚀 Executing swap on Router...');
            writeContract({
                address: MEZO_ROUTER.testnet.address,
                abi: MEZO_ROUTER_ABI,
                functionName: 'swapExactTokensForTokens',
                args: [
                    item.allocation.tokenAmountBig,
                    minimumOutput,
                    routes as readonly { from: `0x${string}`; to: `0x${string}`; stable: boolean; }[],
                    address as `0x${string}`,
                    deadline
                ],
            });
        } catch (err) {
            console.error('❌ Swap failed:', err);
            setTxStatus('error');
        }
    };

    // Handle purchase/allocation execution
    const handlePurchase = async (payload: PurchasePayload) => {
        console.log('💰 Purchase triggered:', payload);
        
        // Filter out items with zero amounts
        const itemsToApprove = payload.items.filter(item => item.allocation.tokenAmountBig > 0n);
        
        if (itemsToApprove.length === 0) {
            console.warn('⚠️ No tokens to allocate');
            setTxStatus('idle');
            return;
        }

        const filteredPayload = { ...payload, items: itemsToApprove };
        
        // Try EIP-5792 batch calls first if supported
        if (batchCallsSupported && walletClient) {
            console.log('🚀 Attempting atomic batch execution via EIP-5792...');
            setTxStatus('pending');
            setUsingBatchCalls(true);
            
            try {
                // Determine spender based on mode
                const spender = mode === 'swap' 
                    ? MEZO_ROUTER.testnet.address 
                    : MEZO_COMPOSE_CONTRACT.testnet.address;
                
                // Build all calls
                const calls = [];
                
                // Add approval calls
                for (const item of itemsToApprove) {
                    const approvalData = encodeFunctionData({
                        abi: erc20Abi,
                        functionName: 'approve',
                        args: [spender, item.allocation.tokenAmountBig],
                    });
                    
                    calls.push({
                        to: item.asset.contractAddress as `0x${string}`,
                        data: approvalData,
                    });
                }
                
                // Add main transaction call
                if (mode === 'allocate') {
                    const tokens = itemsToApprove.map(item => item.asset.contractAddress as `0x${string}`);
                    const amounts = itemsToApprove.map(item => item.allocation.tokenAmountBig);
                    
                    const allocateData = encodeFunctionData({
                        abi: MEZO_COMPOSE_CONTRACT.testnet.abi,
                        functionName: 'allocate',
                        args: [tokens, amounts],
                    });
                    
                    calls.push({
                        to: MEZO_COMPOSE_CONTRACT.testnet.address,
                        data: allocateData,
                    });
                }
                
                const result = await executeBatchCalls(walletClient, calls, {
                    onSuccess: (txHash) => {
                        console.log('✅ Batch execution successful:', txHash);
                        setTxStatus('success');
                        setLastPayload(filteredPayload);
                    },
                    onError: (error) => {
                        console.error('❌ Batch execution failed:', error);
                        setTxStatus('error');
                        setUsingBatchCalls(false);
                    },
                    onFallback: () => {
                        console.log('⚠️ Falling back to sequential approvals');
                        setUsingBatchCalls(false);
                        startSequentialApprovals(filteredPayload);
                    },
                });
                
                if (!result.usedBatch) {
                    // Fallback was triggered
                    return;
                }
                
                return;
            } catch (error) {
                console.error('❌ Batch calls error:', error);
                setUsingBatchCalls(false);
                // Fall through to sequential
            }
        }
        
        // Sequential approval flow (fallback or when batch calls not supported)
        startSequentialApprovals(filteredPayload);
    };
    
    // Start sequential approval flow
    const startSequentialApprovals = (filteredPayload: PurchasePayload) => {
        const approvalCount = filteredPayload.items.length;
        console.log(`🔐 Starting sequential approval flow: ${approvalCount} tokens to approve`);
        
        setLastPayload(filteredPayload);
        setTotalApprovals(approvalCount);
        setCurrentApprovalIndex(0);
        setTxStatus('approving');
        
        // Start with first approval
        approveNextToken(filteredPayload, 0, approvalCount);
    };
    
    return (
        <>
            <div style={{
                maxWidth: '900px',
                margin: '0 auto',
                padding: '20px',
                fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
                <header style={{
                    marginBottom: '30px',
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '20px'
                    }}>
                        <div>
                            <h1 style={{
                                fontSize: '32px',
                                fontWeight: '700',
                                marginBottom: '8px'
                            }}>
                                Mezo Compose SDK
                            </h1>
                            <p style={{
                                color: '#666',
                                fontSize: '16px',
                                margin: 0
                            }}>
                                Multi-Asset NFT Purchases on Bitcoin
                            </p>
                        </div>
                        <ConnectButton />
                    </div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                    }}>
                        <div style={{
                            display: 'inline-block',
                            padding: '6px 12px',
                            background: isWrongNetwork ? '#fef3c7' : '#f0f7ff',
                            borderRadius: '6px',
                            fontSize: '14px',
                            color: isWrongNetwork ? '#92400e' : '#0066cc'
                        }}>
                            Mezo Testnet • Chain ID: 31611
                        </div>
                        {isWrongNetwork && (
                            <button
                                onClick={() => switchChain?.({ chainId: MEZO_TESTNET_CHAIN_ID })}
                                style={{
                                    padding: '6px 12px',
                                    background: '#f59e0b',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    fontWeight: '500'
                                }}
                            >
                                Switch to Mezo Testnet
                            </button>
                        )}
                    </div>
                </header>

                {isWrongNetwork && (
                    <div style={{
                        marginBottom: '20px',
                        padding: '16px',
                        background: '#fef3c7',
                        border: '1px solid #f59e0b',
                        borderRadius: '8px',
                        fontSize: '14px',
                        color: '#92400e'
                    }}>
                        <strong>Wrong Network Detected</strong>
                        <p style={{ margin: '8px 0 0 0' }}>
                            You're currently on Chain ID: {chainId}. Please switch to Mezo Testnet (Chain ID: 31611) to use this app.
                        </p>
                    </div>
                )}

                {/* NFT Preview Card */}
                <div style={{
                    marginBottom: '24px',
                    background: 'white',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    gap: '24px',
                    padding: '24px'
                }}>
                    <div style={{ 
                        flex: '0 0 280px',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        background: '#f1f5f9',
                        height: '280px'
                    }}>
                        <img 
                            src="https://artlogic-res.cloudinary.com/w_1200,c_limit,f_auto,fl_lossy,q_auto/ws-artlogicwebsite0889/usr/images/news/main_image/6/nft-bored-ape-yacht-club.png"
                            alt="Bored Ape Yacht Club NFT"
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover'
                            }}
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.parentElement!.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#64748b;font-size:48px;">NFT Image</div>';
                            }}
                        />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                                <div>
                                    <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: '#1e293b' }}>
                                        Bored Ape #3749
                                    </h2>
                                    <p style={{ fontSize: '15px', color: '#64748b', margin: 0 }}>
                                        Bored Ape Yacht Club Collection
                                    </p>
                                </div>
                                <div style={{
                                    padding: '8px 16px',
                                    background: '#dcfce7',
                                    color: '#166534',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    fontWeight: '600',
                                    border: '1px solid #86efac'
                                }}>
                                    Available
                                </div>
                            </div>
                            <div style={{
                                marginTop: '16px',
                                padding: '12px 16px',
                                background: '#f8fafc',
                                borderRadius: '8px',
                                fontSize: '13px',
                                color: '#475569',
                                border: '1px solid #e2e8f0'
                            }}>
                                <strong>Pay with multiple tokens:</strong> Use BTC, MUSD, mUSDC, or mUSDT in any combination to reach the purchase price
                            </div>
                        </div>
                        <div style={{
                            padding: '20px',
                            background: '#667eea',
                            borderRadius: '12px'
                        }}>
                            <div style={{ fontSize: '13px', color: '#e0e7ff', marginBottom: '4px' }}>
                                Purchase Price
                            </div>
                            <div style={{ fontSize: '36px', fontWeight: '700', color: 'white' }}>
                                $1,000.00
                            </div>
                        </div>
                    </div>
                </div>

                {/* Payment Method Selection */}
                <div style={{
                    marginBottom: '20px',
                    padding: '20px',
                    background: '#f8fafc',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0'
                }}>
                    <div style={{ marginBottom: '12px', fontWeight: '600', color: '#1e293b' }}>
                        Payment Method:
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: mode === 'swap' ? '16px' : '0' }}>
                        <button
                            onClick={() => setMode('allocate')}
                            style={{
                                flex: 1,
                                padding: '12px 24px',
                                background: mode === 'allocate' ? '#3b82f6' : 'white',
                                color: mode === 'allocate' ? 'white' : '#64748b',
                                border: `2px solid ${mode === 'allocate' ? '#3b82f6' : '#e2e8f0'}`,
                                borderRadius: '8px',
                                fontSize: '14px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            Pay with Multiple Tokens
                        </button>
                        <button
                            onClick={() => setMode('swap')}
                            style={{
                                flex: 1,
                                padding: '12px 24px',
                                background: mode === 'swap' ? '#3b82f6' : 'white',
                                color: mode === 'swap' ? 'white' : '#64748b',
                                border: `2px solid ${mode === 'swap' ? '#3b82f6' : '#e2e8f0'}`,
                                borderRadius: '8px',
                                fontSize: '14px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            Swap Then Pay
                        </button>
                    </div>
                    
                    {/* Swap Target Selection */}
                    {mode === 'swap' && (
                        <div style={{ 
                            marginTop: '12px', 
                            padding: '12px', 
                            background: 'white', 
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0'
                        }}>
                            <div style={{ marginBottom: '8px', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                                Swap To:
                            </div>
                            <select
                                value={swapTargetToken}
                                onChange={(e) => setSwapTargetToken(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    fontSize: '14px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '6px',
                                    background: 'white',
                                    cursor: 'pointer'
                                }}
                            >
                                {MEZO_TESTNET_ASSETS.map(asset => (
                                    <option key={asset.contractAddress} value={asset.contractAddress}>
                                        {asset.symbol} - {asset.name}
                                    </option>
                                ))}
                            </select>
                            <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
                                Swaps through Mezo Pools (Tigris DEX) with 1% slippage tolerance
                            </div>
                            <div style={{ marginTop: '8px', padding: '8px', background: '#fef3c7', borderRadius: '4px', fontSize: '11px', color: '#92400e' }}>
                                <strong>Testnet Tip:</strong> MUSD ↔ mUSDC/mUSDT swaps work best (stable pools). BTC pools may have limited liquidity.
                            </div>
                        </div>
                    )}
                    
                    <div style={{ marginTop: '12px', fontSize: '13px', color: '#64748b' }}>
                        {mode === 'allocate' 
                            ? 'Pay directly using any combination of BTC, MUSD, mUSDC, or mUSDT from your wallet'
                            : 'First swap your tokens to the desired payment token, then complete the NFT purchase'}
                    </div>

                    {/* EIP-5792 Batch Calls Status */}
                    {batchCallsSupported !== null && (
                        <div style={{ 
                            marginTop: '12px', 
                            padding: '10px', 
                            background: batchCallsSupported ? '#dcfce7' : '#fef3c7',
                            borderRadius: '6px',
                            fontSize: '12px',
                            color: batchCallsSupported ? '#166534' : '#92400e'
                        }}>
                            {batchCallsSupported ? (
                                <span><strong>Batch Mode Active:</strong> All approvals + transaction in one signature</span>
                            ) : (
                                <span><strong>Standard Mode:</strong> Sequential approvals (EIP-5792 atomic batching coming soon to Mezo)</span>
                            )}
                        </div>
                    )}
                </div>

                {/* Transaction Status */}
                {txStatus !== 'idle' && (
                    <div style={{
                        marginBottom: '20px',
                        padding: '16px',
                        background: txStatus === 'success' ? '#dcfce7' : 
                                   txStatus === 'error' ? '#fee2e2' : '#f0f7ff',
                        border: `1px solid ${txStatus === 'success' ? '#22c55e' : 
                                            txStatus === 'error' ? '#ef4444' : '#3b82f6'}`,
                        borderRadius: '8px',
                        fontSize: '14px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            {txStatus === 'approving' && (
                                <span>Approving token {currentApprovalIndex + 1} of {totalApprovals}...</span>
                            )}
                            {txStatus === 'pending' && (
                                <span>
                                    {usingBatchCalls ? 'Waiting for batch signature...' : 'Waiting for wallet approval...'}
                                </span>
                            )}
                            {txStatus === 'confirming' && (
                                <span>
                                    {usingBatchCalls ? 'Confirming atomic batch...' : 'Confirming transaction...'}
                                </span>
                            )}
                            {txStatus === 'success' && (
                                <span>
                                    {usingBatchCalls ? 'Batch transaction confirmed!' : 'Transaction confirmed!'}
                                </span>
                            )}
                            {txStatus === 'error' && <span>Transaction failed</span>}
                        </div>
                        {hash && (
                            <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                                <strong>TX:</strong>{' '}
                                <a 
                                    href={`https://explorer.test.mezo.org/tx/${hash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: '#3b82f6', textDecoration: 'underline' }}
                                >
                                    {hash.slice(0, 10)}...{hash.slice(-8)}
                                </a>
                            </div>
                        )}
                        {writeError && (
                            <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '8px' }}>
                                {writeError.message}
                            </div>
                        )}
                        {lastPayload && txStatus === 'success' && (
                            <div style={{ fontSize: '12px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                                <strong>NFT Payment Complete!</strong>
                                <div style={{ marginTop: '8px', color: '#166534' }}>
                                    You paid with:
                                </div>
                                <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                                    {lastPayload.items.map(item => (
                                        <li key={item.asset.symbol}>
                                            {item.allocation.tokenAmount.toFixed(6)} {item.asset.symbol} 
                                            ({item.allocation.usdAmount.toFixed(2)} USD)
                                        </li>
                                    ))}
                                </ul>
                                <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
                                    In a real NFT marketplace, the NFT would now be transferred to your wallet!
                                </div>
                            </div>
                        )}
                    </div>
                )}

        <Assets
            service={service}
                    assets={MEZO_TESTNET_ASSETS}
                    wallet={wallet}
            targetAmount={1000}
            onAllocationChange={(state) => {
                        console.log('📊 Allocation changed:', state);
                    }}
                    onPurchase={handlePurchase}
                />

                <footer style={{
                    marginTop: '40px',
                    padding: '20px',
                    borderTop: '1px solid #e5e7eb',
                    fontSize: '14px',
                    color: '#666'
                }}>
                    <h3 style={{fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#333'}}>
                        About This Demo
                    </h3>
                    <p style={{marginBottom: '16px', lineHeight: '1.6', color: '#555'}}>
                        This demonstrates <strong>multi-asset NFT payments</strong> using the Mezo Compose SDK. Instead of requiring a single token, buyers can combine BTC, MUSD, mUSDC, and mUSDT to reach the purchase price — all in one atomic transaction.
                    </p>
                    <ul style={{listStyle: 'none', padding: 0, lineHeight: '1.8'}}>
                        <li><strong>Use Case:</strong> Pay $1,000 for an NFT using any token combination</li>
                        <li><strong>Multi-Asset Payments:</strong> Combine BTC, MUSD, mUSDC, mUSDT in one transaction</li>
                        <li><strong>Atomic Execution:</strong> All approvals + payment succeed or fail together</li>
                        <li><strong>Real-Time Pricing:</strong> Skip Connect (BTC) + Pyth Network (stablecoins)</li>
                        <li><strong>Optional Swap:</strong> Convert tokens via Mezo Pools before payment</li>
                        <li><strong>EIP-5792 Ready:</strong> Single signature for all transactions (when network supports it)</li>
                    </ul>
                    
                    <div style={{marginTop: '16px', padding: '12px', background: '#dcfce7', borderRadius: '6px'}}>
                        <strong>Live on Mezo Testnet</strong> 
                        <div style={{marginTop: '8px', fontSize: '13px'}}>
                            <div>Oracles: Skip Connect (BTC) + Pyth Network (MUSD, USDC, USDT)</div>
                            <div>Contract: <a href={`https://explorer.test.mezo.org/address/${MEZO_COMPOSE_CONTRACT.testnet.address}`} target="_blank" rel="noopener noreferrer" style={{color: '#16a34a', fontFamily: 'monospace'}}>{MEZO_COMPOSE_CONTRACT.testnet.address}</a></div>
                        </div>
                    </div>
                </footer>
            </div>
    </>
  )
}

export default App

