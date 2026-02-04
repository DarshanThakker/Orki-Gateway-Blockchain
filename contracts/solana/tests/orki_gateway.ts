import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { OrkiGateway } from "../target/types/orki_gateway";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createMint, createAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID, getAccount } from "@solana/spl-token";
import { assert } from "chai";

describe("orki_gateway", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.orkiGateway as Program<OrkiGateway>;
  const provider = anchor.getProvider();

  // Accounts
  const globalStateKp = Keypair.generate();
  const merchantOwner = Keypair.generate();
  const merchantState = Keypair.generate(); // For SOL merchant
  const merchantSplState = Keypair.generate(); // For SPL merchant
  const merchantWallet = Keypair.generate();
  const feeWallet = Keypair.generate();
  const payer = Keypair.generate();

  const feeBps = 100; // 1%

  let mint: PublicKey;
  let payerTokenAccount: PublicKey;
  let merchantTokenAccount: PublicKey;
  let feeTokenAccount: PublicKey;

  before(async () => {
    // Airdrop SOL to payer and merchantOwner
    const latestBlockHash = await provider.connection.getLatestBlockhash();

    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: await provider.connection.requestAirdrop(payer.publicKey, 5 * LAMPORTS_PER_SOL)
    });

    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: await provider.connection.requestAirdrop(merchantOwner.publicKey, 1 * LAMPORTS_PER_SOL)
    });
  });

  it("Is initialized!", async () => {
    await program.methods
      .initialize(feeBps)
      .accounts({
        globalState: globalStateKp.publicKey,
        admin: provider.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([globalStateKp])
      .rpc();

    const state = await program.account.globalState.fetch(globalStateKp.publicKey);
    assert.ok(state.feeBps === feeBps);
    assert.ok(state.admin.equals(provider.publicKey));
  });

  it("Register Merchant (SOL)", async () => {
    await program.methods
      .registerMerchant(merchantWallet.publicKey, PublicKey.default)
      .accounts({
        merchant: merchantState.publicKey,
        owner: merchantOwner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([merchantOwner, merchantState])
      .rpc();

    const merchant = await program.account.merchant.fetch(merchantState.publicKey);
    assert.ok(merchant.owner.equals(merchantOwner.publicKey));
    assert.ok(merchant.settlementWallet.equals(merchantWallet.publicKey));
    // Default pubkey check might vary slightly in object comparisons, but equals handles it.
  });

  it("Process Payment (SOL)", async () => {
    const amount = new anchor.BN(1 * LAMPORTS_PER_SOL);
    const fee = amount.mul(new anchor.BN(feeBps)).div(new anchor.BN(10000));
    const merchantAmt = amount.sub(fee);

    // Note: In lib.rs we check merchant.settlement_token match.
    // Since we passed PublicKey.default in register, passing null/None for mint means it matches Native route.
    // In Anchor JS, optional accounts can be null.

    await program.methods
      .processPayment(amount)
      .accounts({
        globalState: globalStateKp.publicKey,
        merchant: merchantState.publicKey,
        payer: payer.publicKey,
        merchantWallet: merchantWallet.publicKey,
        feeWallet: feeWallet.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: null,
        mint: null,
        payerTokenAccount: null,
        merchantTokenAccount: null,
        feeTokenAccount: null,
      })
      .signers([payer])
      .rpc();

    const balanceMerchant = await provider.connection.getBalance(merchantWallet.publicKey);
    const balanceFee = await provider.connection.getBalance(feeWallet.publicKey);

    // Since wallets started with 0 (Keypair.generate), checks are absolute
    assert.ok(new anchor.BN(balanceMerchant).eq(merchantAmt));
    assert.ok(new anchor.BN(balanceFee).eq(fee));
  });

  it("Setup SPL", async () => {
    mint = await createMint(provider.connection, payer, payer.publicKey, null, 6);

    payerTokenAccount = await createAssociatedTokenAccount(provider.connection, payer, mint, payer.publicKey);
    merchantTokenAccount = await createAssociatedTokenAccount(provider.connection, payer, mint, merchantWallet.publicKey);
    feeTokenAccount = await createAssociatedTokenAccount(provider.connection, payer, mint, feeWallet.publicKey);

    // Mint to payer
    await mintTo(provider.connection, payer, mint, payerTokenAccount, payer, 1000000);
  });

  it("Register Merchant (SPL)", async () => {
    await program.methods
      .registerMerchant(merchantWallet.publicKey, mint)
      .accounts({
        merchant: merchantSplState.publicKey,
        owner: merchantOwner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([merchantOwner, merchantSplState])
      .rpc();

    const merchant = await program.account.merchant.fetch(merchantSplState.publicKey);
    assert.ok(merchant.settlementToken.equals(mint));
  });

  it("Process Payment (SPL)", async () => {
    const amount = new anchor.BN(100000); // 0.1 tokens
    const fee = amount.mul(new anchor.BN(feeBps)).div(new anchor.BN(10000));
    const merchantAmt = amount.sub(fee);

    await program.methods
      .processPayment(amount)
      .accounts({
        globalState: globalStateKp.publicKey,
        merchant: merchantSplState.publicKey,
        payer: payer.publicKey,
        merchantWallet: merchantWallet.publicKey, // Passed for constraint check if needed, but in SPL logic it might be ignored or used differently
        feeWallet: feeWallet.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        mint: mint,
        payerTokenAccount: payerTokenAccount,
        merchantTokenAccount: merchantTokenAccount,
        feeTokenAccount: feeTokenAccount,
      })
      .signers([payer])
      .rpc();

    const merchantAcct = await getAccount(provider.connection, merchantTokenAccount);
    const feeAcct = await getAccount(provider.connection, feeTokenAccount);

    assert.ok(new anchor.BN(merchantAcct.amount.toString()).eq(merchantAmt));
    assert.ok(new anchor.BN(feeAcct.amount.toString()).eq(fee));
  });

  it("Fail: Payment with Incorrect Token", async () => {
    // Create a different mint that the merchant does not accept
    const wrongMint = await createMint(provider.connection, payer, payer.publicKey, null, 6);
    const wrongPayerTa = await createAssociatedTokenAccount(provider.connection, payer, wrongMint, payer.publicKey);
    await mintTo(provider.connection, payer, wrongMint, wrongPayerTa, payer, 1000);

    // We need accounts for this wrong mint
    // But we can't easily make a merchant token account for a token they haven't opted into (though we could force it)
    // The contract checks: require!(mint.key() == merchant.settlement_token)
    // So simply passing the wrong mint should fail before transfers are attempted.

    const wrongMerchantTa = await createAssociatedTokenAccount(provider.connection, payer, wrongMint, merchantWallet.publicKey);
    const wrongFeeTa = await createAssociatedTokenAccount(provider.connection, payer, wrongMint, feeWallet.publicKey);

    try {
      await program.methods
        .processPayment(new anchor.BN(100))
        .accounts({
          globalState: globalStateKp.publicKey,
          merchant: merchantSplState.publicKey, // Expects 'mint' (from previous test), not 'wrongMint'
          payer: payer.publicKey,
          merchantWallet: merchantWallet.publicKey,
          feeWallet: feeWallet.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          mint: wrongMint, // Mismatch!
          payerTokenAccount: wrongPayerTa,
          merchantTokenAccount: wrongMerchantTa,
          feeTokenAccount: wrongFeeTa,
        })
        .signers([payer])
        .rpc();
      assert.fail("Should have failed with InvalidToken");
    } catch (e: any) {
      assert.ok(e.message.includes("Invalid token for this merchant") || e.error?.errorCode?.code === "InvalidToken");
    }
  });
});
