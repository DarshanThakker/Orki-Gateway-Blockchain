# Orki Gateway Blockchain Setup Guide

This guide covers how to set up, build, and run tests for the Orki Gateway Blockchain project, which includes both **Solana** and **EVM** contracts.

## Prerequisites

Ensure you have the following installed:

1.  **Git**: [Install Git](https://git-scm.com/downloads)
2.  **Node.js & Yarn**: [Install Node.js](https://nodejs.org/) and `npm install -g yarn`
3.  **Rust**: [Install Rust](https://www.rust-lang.org/tools/install)
4.  **Solana Tool Suite**: [Install Solana CLI](https://docs.solanalabs.com/cli/install)
5.  **Anchor Framework**: [Install Anchor](https://www.anchor-lang.com/docs/installation) (Version 0.30.1 recommended or latest compatible)
6.  **Foundry**: [Install Foundry](https://book.getfoundry.sh/getting-started/installation) (Run `force install` if you already have it)

## cloning the Repository

```bash
git clone https://github.com/DarshanThakker/Orki-Gateway-Blockchain.git
cd Orki-Gateway-Blockchain
```

---

## 1. Solana Setup (Contracts & Tests)

The Solana contracts are located in `contracts/solana`.

### Installation

1.  Navigate to the Solana directory:
    ```bash
    cd contracts/solana
    ```
2.  Install Node dependencies:
    ```bash
    yarn install
    # or
    npm install
    ```

### Build

To build the Solana programs:

```bash
anchor build
```

This command generates the keypairs and IDLs in `target/`.

### Run Tests

To run the full test suite (which starts a local validator automatically):

```bash
anchor test
```

**Troubleshooting Tests:**
- If you see dependency errors, ensure `@solana/spl-token` is installed: `yarn add @solana/spl-token`
- Ensure your `Anchor.toml` is configured for `localnet`.

---

## 2. EVM Setup (Contracts & Tests)

The EVM contracts use **Foundry** and are located in `contracts/evm`.

### Installation

1.  Navigate to the EVM directory:
    ```bash
    cd contracts/evm
    ```
2.  Install dependencies (submodules/libs):
    ```bash
    forge install
    ```

### Build

Compile the smart contracts:

```bash
forge build
```

### Run Tests

Run all EVM tests:

```bash
forge test
```

To see verbose output (logs/traces):

```bash
forge test -vvv
```

---

## Summary of Common Commands

| Action | Solana (in `contracts/solana`) | EVM (in `contracts/evm`) |
| :--- | :--- | :--- |
| **Install** | `yarn install` | `forge install` |
| **Build** | `anchor build` | `forge build` |
| **Test** | `anchor test` | `forge test` |
