// Generated subset of ArcadeEscrow ABI. Update from Arcade Foundry artifact.
export const arcadeAbi = [
  {
    type: 'function',
    name: 'fundBounty',
    inputs: [
      {
        name: 'id',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'amount',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getMatch',
    inputs: [
      {
        name: 'id',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct ArcadeEscrow.MatchAccount',
        components: [
          {
            name: 'terms',
            type: 'tuple',
            internalType: 'struct ArcadeEscrow.Terms',
            components: [
              {
                name: 'token',
                type: 'address',
                internalType: 'contract IERC20',
              },
              {
                name: 'resolver',
                type: 'address',
                internalType: 'address',
              },
              {
                name: 'treasury',
                type: 'address',
                internalType: 'address',
              },
              {
                name: 'fundingDeadline',
                type: 'uint64',
                internalType: 'uint64',
              },
              {
                name: 'settlementDeadline',
                type: 'uint64',
                internalType: 'uint64',
              },
              {
                name: 'feeBps',
                type: 'uint16',
                internalType: 'uint16',
              },
              {
                name: 'stake',
                type: 'uint256',
                internalType: 'uint256',
              },
              {
                name: 'bounties',
                type: 'bool',
                internalType: 'bool',
              },
              {
                name: 'betting',
                type: 'bool',
                internalType: 'bool',
              },
              {
                name: 'rulesHash',
                type: 'bytes32',
                internalType: 'bytes32',
              },
              {
                name: 'creator',
                type: 'address',
                internalType: 'address',
              },
              {
                name: 'creatorShareBps',
                type: 'uint16',
                internalType: 'uint16',
              },
              {
                name: 'royalties',
                type: 'tuple[]',
                internalType: 'struct ArcadeEscrow.RoyaltyShare[]',
                components: [
                  {
                    name: 'recipient',
                    type: 'address',
                    internalType: 'address',
                  },
                  {
                    name: 'bps',
                    type: 'uint16',
                    internalType: 'uint16',
                  },
                ],
              },
            ],
          },
          {
            name: 'status',
            type: 'uint8',
            internalType: 'enum ArcadeEscrow.Status',
          },
          {
            name: 'prizePool',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'betPool',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'paidSeats',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'winner',
            type: 'bytes32',
            internalType: 'bytes32',
          },
          {
            name: 'resultHash',
            type: 'bytes32',
            internalType: 'bytes32',
          },
          {
            name: 'remainingBetShares',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'remainingBetPayout',
            type: 'uint256',
            internalType: 'uint256',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'placeBet',
    inputs: [
      {
        name: 'id',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'seatId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'amount',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'recipient',
    inputs: [
      {
        name: '',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: '',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'stake',
    inputs: [
      {
        name: 'id',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'seatId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;
