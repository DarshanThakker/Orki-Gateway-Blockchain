# Orki Gateway Architecture

## Contract Map

Customer Wallet
    |
    v
PaymentProcessor (per chain)
    |         \
    |          -> FeeVault
    v
Merchant Wallet
    |
(Optional SwapAdapter)
    |
Jupiter / Uniswap

## Components

PaymentProcessor:
Receives payment, executes optional swap, deducts fees, forwards funds.

MerchantRegistry:
Stores merchant wallet, accepted tokens, settlement token, swaps flag.

FeeVault:
Receives Orki platform fees.

SwapAdapter:
Abstract interface for Jupiter (Solana) and Uniswap (EVM).

## Admin Controls

Multisig can:
- Upgrade contracts
- Pause payments
- Update fees
- Change fee wallet
