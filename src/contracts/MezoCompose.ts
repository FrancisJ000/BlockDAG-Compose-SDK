export const MEZO_COMPOSE_CONTRACT = {
  testnet: {
    address: "0x201b0a661d692Bd4938e4A7Ce957209b4288B259" as const,
    abi: [
      // MezoCompose ABI - multi-asset allocation & swaps
      {
        inputs: [
          {
            internalType: "address[]",
            name: "_tokens",
            type: "address[]",
          },
          {
            internalType: "uint256[]",
            name: "_amounts",
            type: "uint256[]",
          },
        ],
        name: "allocate",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
      {
        inputs: [
          {
            internalType: "address[]",
            name: "_tokens",
            type: "address[]",
          },
          {
            internalType: "uint256[]",
            name: "_amounts",
            type: "uint256[]",
          },
          {
            internalType: "address",
            name: "_target",
            type: "address",
          },
          {
            internalType: "bytes",
            name: "_callData",
            type: "bytes",
          },
          {
            internalType: "uint256",
            name: "_paymentAmount",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "_minOut",
            type: "uint256",
          },
        ],
        name: "execute",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
      {
        inputs: [],
        name: "owner",
        outputs: [{ internalType: "address", name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
      },
    ] as const,
  },
} as const;

// Native token sentinel value
export const NATIVE_SENTINEL = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;
