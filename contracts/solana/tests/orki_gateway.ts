import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { OrkiGateway } from "../target/types/orki_gateway";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createMint, createAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID, getAccount } from "@solana/spl-token";
import { assert } from "chai";

describe("orki_gateway", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.OrkiGateway as Program<OrkiGateway>;
  const provider = anchor.getProvider();

  // Accounts
  let globalStatePda: PublicKey;
  const merchantOwner = Keypair.generate();
  const merchantWallet = Keypair.generate();
  const feeWallet = Keypair.generate();
  const payer = Keypair.generate();

  const feeBps = 100; // 1%
  const solMerchantName = "SolanaShop";
  const splMerchantName = "TokenStore";

  let mint: PublicKey;
  let payerTokenAccount: PublicKey;
  let merchantTokenAccount: PublicKey;
  let feeTokenAccount: PublicKey;

  let solMerchantPda: PublicKey;
  let splMerchantPda: PublicKey;

  before(async () => {
    console.log("Airdropping SOL to payer and merchant owner...");

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

    console.log("Deriving PDAs...");

    [globalStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("global_state")],
      program.programId
    );
    console.log("GlobalState PDA:", globalStatePda.toBase58());

    [solMerchantPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("merchant"), merchantOwner.publicKey.toBuffer(), Buffer.from(solMerchantName)],
      program.programId
    );
    console.log("SOL Merchant PDA:", solMerchantPda.toBase58());

    [splMerchantPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("merchant"), merchantOwner.publicKey.toBuffer(), Buffer.from(splMerchantName)],
      program.programId
    );
    console.log("SPL Merchant PDA:", splMerchantPda.toBase58());
  });

  it("Initialize Global State", async () => {
    console.log("Initializing global state...");

    await program.methods
      .initialize(feeBps, feeWallet.publicKey)
      .accountsStrict({
        globalState: globalStatePda,
        admin: provider.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.globalState.fetch(globalStatePda);
    console.log("Global state fetched:", state);
    assert.equal(state.feeBps, feeBps);
    assert.ok(state.feeWallet.equals(feeWallet.publicKey));
  });

  it("Register Merchant (SOL)", async () => {
    console.log("Registering SOL merchant:", solMerchantName);

    await program.methods
      .registerMerchant(merchantWallet.publicKey, PublicKey.default, solMerchantName)
      .accountsStrict({
        merchant: solMerchantPda,
        owner: merchantOwner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([merchantOwner])
      .rpc();

    const merchant = await program.account.merchant.fetch(solMerchantPda);
    console.log("SOL Merchant account:", merchant);
    assert.equal(merchant.name, solMerchantName);
    assert.ok(merchant.settlementWallet.equals(merchantWallet.publicKey));
    assert.equal(merchant.swapEnabled, false);
  });

  it("Process Payment (SOL)", async () => {
    const amount = new anchor.BN(1 * LAMPORTS_PER_SOL);
    const paymentId = new anchor.BN(Date.now());

    const [paymentHistoryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("payment"), payer.publicKey.toBuffer(), paymentId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    console.log("Processing SOL payment:", {
      amount: amount.toString(),
      paymentId: paymentId.toString(),
      paymentHistoryPda: paymentHistoryPda.toBase58()
    });

    const fee = amount.mul(new anchor.BN(feeBps)).div(new anchor.BN(10000));
    const merchantAmt = amount.sub(fee);

    const initialMerchantBalance = await provider.connection.getBalance(merchantWallet.publicKey);
    const initialFeeBalance = await provider.connection.getBalance(feeWallet.publicKey);

    console.log("Initial balances:", {
      merchant: initialMerchantBalance,
      fee: initialFeeBalance
    });

    await program.methods
      .processPayment(amount, paymentId, solMerchantName)
      .accountsStrict({
        globalState: globalStatePda,
        merchant: solMerchantPda,
        payer: payer.publicKey,
        merchantWallet: merchantWallet.publicKey,
        feeWallet: feeWallet.publicKey,
        paymentHistory: paymentHistoryPda,
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

    console.log("Updated balances:", {
      merchant: balanceMerchant,
      fee: balanceFee
    });

    assert.equal(balanceMerchant, initialMerchantBalance + merchantAmt.toNumber());
    assert.equal(balanceFee, initialFeeBalance + fee.toNumber());
  });

  it("Setup SPL", async () => {
    console.log("Creating SPL token mint and accounts...");

    mint = await createMint(provider.connection, payer, payer.publicKey, null, 6);
    payerTokenAccount = await createAssociatedTokenAccount(provider.connection, payer, mint, payer.publicKey);
    merchantTokenAccount = await createAssociatedTokenAccount(provider.connection, payer, mint, merchantWallet.publicKey);
    feeTokenAccount = await createAssociatedTokenAccount(provider.connection, payer, mint, feeWallet.publicKey);

    await mintTo(provider.connection, payer, mint, payerTokenAccount, payer, 1_000_000);

    console.log("SPL token mint:", mint.toBase58());
    console.log("Payer token account:", payerTokenAccount.toBase58());
  });

  it("Register Merchant (SPL)", async () => {
    console.log("Registering SPL merchant:", splMerchantName);

    await program.methods
      .registerMerchant(merchantWallet.publicKey, mint, splMerchantName)
      .accountsStrict({
        merchant: splMerchantPda,
        owner: merchantOwner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([merchantOwner])
      .rpc();

    const merchant = await program.account.merchant.fetch(splMerchantPda);
    console.log("SPL Merchant account:", merchant);
    assert.ok(merchant.settlementToken.equals(mint));
    assert.equal(merchant.name, splMerchantName);
    assert.equal(merchant.swapEnabled, false);
  });

  it("Process Payment (SPL)", async () => {
    const amount = new anchor.BN(100_000);
    const paymentId = new anchor.BN(Date.now() + 1);

    const [paymentHistoryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("payment"), payer.publicKey.toBuffer(), paymentId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    console.log("Processing SPL payment:", { amount: amount.toString(), paymentId: paymentId.toString() });

    const fee = amount.mul(new anchor.BN(feeBps)).div(new anchor.BN(10000));
    const merchantAmt = amount.sub(fee);

    const merchantAcctBefore = await getAccount(provider.connection, merchantTokenAccount);
    const feeAcctBefore = await getAccount(provider.connection, feeTokenAccount);

    console.log("Balances before payment:", {
      merchant: merchantAcctBefore.amount.toString(),
      fee: feeAcctBefore.amount.toString()
    });

    await program.methods
      .processPayment(amount, paymentId, splMerchantName)
      .accountsStrict({
        globalState: globalStatePda,
        merchant: splMerchantPda,
        payer: payer.publicKey,
        merchantWallet: merchantWallet.publicKey,
        feeWallet: feeWallet.publicKey,
        paymentHistory: paymentHistoryPda,
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

    console.log("Balances after payment:", {
      merchant: merchantAcct.amount.toString(),
      fee: feeAcct.amount.toString()
    });

    assert.equal(
      merchantAcct.amount.toString(),
      (BigInt(merchantAcctBefore.amount.toString()) + BigInt(merchantAmt.toString())).toString()
    );
    assert.equal(
      feeAcct.amount.toString(),
      (BigInt(feeAcctBefore.amount.toString()) + BigInt(fee.toString())).toString()
    );
  });

  it("Fail: Duplicate Payment ID", async () => {
    const amount = new anchor.BN(10_000);
    const paymentId = new anchor.BN(99999);

    const [paymentHistoryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("payment"), payer.publicKey.toBuffer(), paymentId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    console.log("Processing initial payment for duplicate test...");
    await program.methods
      .processPayment(amount, paymentId, solMerchantName)
      .accountsStrict({
        globalState: globalStatePda,
        merchant: solMerchantPda,
        payer: payer.publicKey,
        merchantWallet: merchantWallet.publicKey,
        feeWallet: feeWallet.publicKey,
        paymentHistory: paymentHistoryPda,
        systemProgram: SystemProgram.programId,
        tokenProgram: null,
        mint: null,
        payerTokenAccount: null,
        merchantTokenAccount: null,
        feeTokenAccount: null,
      })
      .signers([payer])
      .rpc();

    console.log("Attempting duplicate payment (should fail)...");
    try {
      await program.methods
        .processPayment(amount, paymentId, solMerchantName)
        .accountsStrict({
          globalState: globalStatePda,
          merchant: solMerchantPda,
          payer: payer.publicKey,
          merchantWallet: merchantWallet.publicKey,
          feeWallet: feeWallet.publicKey,
          paymentHistory: paymentHistoryPda,
          systemProgram: SystemProgram.programId,
          tokenProgram: null,
          mint: null,
          payerTokenAccount: null,
          merchantTokenAccount: null,
          feeTokenAccount: null,
        })
        .signers([payer])
        .rpc();
      assert.fail("Duplicate payment should have failed");
    } catch (e: any) {
      console.log("Caught expected duplicate payment error:", e.message || e);
      assert.ok(e.message.includes("already in use") || e.logs?.toString().includes("already in use"));
    }
  });
});

















// import * as anchor from "@coral-xyz/anchor";
// import { Program } from "@coral-xyz/anchor";
// import { OrkiGateway } from "../target/types/orki_gateway";
// import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
// import { createMint, createAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID, getAccount } from "@solana/spl-token";
// import { assert } from "chai";

// describe("orki_gateway", () => {
//   anchor.setProvider(anchor.AnchorProvider.env());

//   const program = anchor.workspace.OrkiGateway as Program<OrkiGateway>;
//   const provider = anchor.getProvider();

//   // Accounts
//   let globalStatePda: PublicKey;
//   const merchantOwner = Keypair.generate();
//   const merchantWallet = Keypair.generate();
//   const feeWallet = Keypair.generate();
//   const payer = Keypair.generate();

//   const feeBps = 100; // 1%
//   const solMerchantName = "SolanaShop";
//   const splMerchantName = "TokenStore";

//   let mint: PublicKey;
//   let payerTokenAccount: PublicKey;
//   let merchantTokenAccount: PublicKey;
//   let feeTokenAccount: PublicKey;

//   let solMerchantPda: PublicKey;
//   let splMerchantPda: PublicKey;

//   before(async () => {
//     const latestBlockHash = await provider.connection.getLatestBlockhash();
//     await provider.connection.confirmTransaction({
//       blockhash: latestBlockHash.blockhash,
//       lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
//       signature: await provider.connection.requestAirdrop(payer.publicKey, 5 * LAMPORTS_PER_SOL)
//     });
//     await provider.connection.confirmTransaction({
//       blockhash: latestBlockHash.blockhash,
//       lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
//       signature: await provider.connection.requestAirdrop(merchantOwner.publicKey, 1 * LAMPORTS_PER_SOL)
//     });

//     [globalStatePda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("global_state")],
//       program.programId
//     );

//     [solMerchantPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("merchant"), merchantOwner.publicKey.toBuffer(), Buffer.from(solMerchantName)],
//       program.programId
//     );
    
//     [splMerchantPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("merchant"), merchantOwner.publicKey.toBuffer(), Buffer.from(splMerchantName)],
//       program.programId
//     );
//   });

//   it("Is initialized!", async () => {
//     await program.methods
//       .initialize(feeBps, feeWallet.publicKey)
//       .accountsStrict({
//         globalState: globalStatePda,
//         admin: provider.publicKey,
//         systemProgram: SystemProgram.programId,
//       })
//       .rpc();

//     const state = await program.account.globalState.fetch(globalStatePda);
//     assert.equal(state.feeBps, feeBps);
//     assert.ok(state.feeWallet.equals(feeWallet.publicKey));
//   });

//   it("Register Merchant (SOL)", async () => {
//     await program.methods
//       .registerMerchant(merchantWallet.publicKey, PublicKey.default, solMerchantName)
//       .accountsStrict({
//         merchant: solMerchantPda,
//         owner: merchantOwner.publicKey,
//         systemProgram: SystemProgram.programId,
//       })
//       .signers([merchantOwner])
//       .rpc();

//     const merchant = await program.account.merchant.fetch(solMerchantPda);
//     assert.equal(merchant.name, solMerchantName);
//     assert.ok(merchant.settlementWallet.equals(merchantWallet.publicKey));
//   });

//   it("Process Payment (SOL)", async () => {
//     const amount = new anchor.BN(1 * LAMPORTS_PER_SOL);
//     const paymentId = new anchor.BN(Date.now()); 
    
//     const [paymentHistoryPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("payment"), payer.publicKey.toBuffer(), paymentId.toArrayLike(Buffer, "le", 8)],
//       program.programId
//     );

//     const fee = amount.mul(new anchor.BN(feeBps)).div(new anchor.BN(10000));
//     const merchantAmt = amount.sub(fee);

//     const initialMerchantBalance = await provider.connection.getBalance(merchantWallet.publicKey);
//     const initialFeeBalance = await provider.connection.getBalance(feeWallet.publicKey);

//     await program.methods
//       .processPayment(amount, paymentId, solMerchantName)
//       .accountsStrict({
//         globalState: globalStatePda,
//         merchant: solMerchantPda,
//         payer: payer.publicKey,
//         merchantWallet: merchantWallet.publicKey,
//         feeWallet: feeWallet.publicKey,
//         paymentHistory: paymentHistoryPda,
//         systemProgram: SystemProgram.programId,
//         tokenProgram: null,
//         mint: null,
//         payerTokenAccount: null,
//         merchantTokenAccount: null,
//         feeTokenAccount: null,
//       })
//       .signers([payer])
//       .rpc();

//     const balanceMerchant = await provider.connection.getBalance(merchantWallet.publicKey);
//     const balanceFee = await provider.connection.getBalance(feeWallet.publicKey);

//     assert.equal(balanceMerchant, initialMerchantBalance + merchantAmt.toNumber());
//     assert.equal(balanceFee, initialFeeBalance + fee.toNumber());
//   });

//   it("Setup SPL", async () => {
//     mint = await createMint(provider.connection, payer, payer.publicKey, null, 6);
//     payerTokenAccount = await createAssociatedTokenAccount(provider.connection, payer, mint, payer.publicKey);
//     merchantTokenAccount = await createAssociatedTokenAccount(provider.connection, payer, mint, merchantWallet.publicKey);
//     feeTokenAccount = await createAssociatedTokenAccount(provider.connection, payer, mint, feeWallet.publicKey);
    
//     await mintTo(provider.connection, payer, mint, payerTokenAccount, payer, 1_000_000);
//   });

//   it("Register Merchant (SPL)", async () => {
//     await program.methods
//       .registerMerchant(merchantWallet.publicKey, mint, splMerchantName)
//       .accountsStrict({
//         merchant: splMerchantPda,
//         owner: merchantOwner.publicKey,
//         systemProgram: SystemProgram.programId,
//       })
//       .signers([merchantOwner])
//       .rpc();

//     const merchant = await program.account.merchant.fetch(splMerchantPda);
//     assert.ok(merchant.settlementToken.equals(mint));
//   });

//   it("Process Payment (SPL)", async () => {
//     const amount = new anchor.BN(100_000); 
//     const paymentId = new anchor.BN(Date.now() + 1);
    
//     const [paymentHistoryPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("payment"), payer.publicKey.toBuffer(), paymentId.toArrayLike(Buffer, "le", 8)],
//       program.programId
//     );

//     const fee = amount.mul(new anchor.BN(feeBps)).div(new anchor.BN(10000));
//     const merchantAmt = amount.sub(fee);

//     const merchantAcctBefore = await getAccount(provider.connection, merchantTokenAccount);
//     const feeAcctBefore = await getAccount(provider.connection, feeTokenAccount);

//     await program.methods
//       .processPayment(amount, paymentId, splMerchantName)
//       .accountsStrict({
//         globalState: globalStatePda,
//         merchant: splMerchantPda,
//         payer: payer.publicKey,
//         merchantWallet: merchantWallet.publicKey, 
//         feeWallet: feeWallet.publicKey,
//         paymentHistory: paymentHistoryPda,
//         systemProgram: SystemProgram.programId,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         mint: mint,
//         payerTokenAccount: payerTokenAccount,
//         merchantTokenAccount: merchantTokenAccount,
//         feeTokenAccount: feeTokenAccount,
//       })
//       .signers([payer])
//       .rpc();

//     const merchantAcct = await getAccount(provider.connection, merchantTokenAccount);
//     const feeAcct = await getAccount(provider.connection, feeTokenAccount);

//     assert.equal(
//       merchantAcct.amount.toString(), 
//       (BigInt(merchantAcctBefore.amount.toString()) + BigInt(merchantAmt.toString())).toString()
//     );
//     assert.equal(
//       feeAcct.amount.toString(), 
//       (BigInt(feeAcctBefore.amount.toString()) + BigInt(fee.toString())).toString()
//     );
//   });

//   it("Fail: Duplicate Payment ID", async () => {
//     const amount = new anchor.BN(10_000);
//     const paymentId = new anchor.BN(99999);
    
//     const [paymentHistoryPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("payment"), payer.publicKey.toBuffer(), paymentId.toArrayLike(Buffer, "le", 8)],
//       program.programId
//     );

//     // Initial payment
//     await program.methods
//       .processPayment(amount, paymentId, solMerchantName)
//       .accountsStrict({
//         globalState: globalStatePda,
//         merchant: solMerchantPda,
//         payer: payer.publicKey,
//         merchantWallet: merchantWallet.publicKey,
//         feeWallet: feeWallet.publicKey,
//         paymentHistory: paymentHistoryPda,
//         systemProgram: SystemProgram.programId,
//         tokenProgram: null,
//         mint: null,
//         payerTokenAccount: null,
//         merchantTokenAccount: null,
//         feeTokenAccount: null,
//       })
//       .signers([payer])
//       .rpc();

//     // Duplicate attempt
//     try {
//       await program.methods
//         .processPayment(amount, paymentId, solMerchantName)
//         .accountsStrict({
//           globalState: globalStatePda,
//           merchant: solMerchantPda,
//           payer: payer.publicKey,
//           merchantWallet: merchantWallet.publicKey,
//           feeWallet: feeWallet.publicKey,
//           paymentHistory: paymentHistoryPda,
//           systemProgram: SystemProgram.programId,
//           tokenProgram: null,
//           mint: null,
//           payerTokenAccount: null,
//           merchantTokenAccount: null,
//           feeTokenAccount: null,
//         })
//         .signers([payer])
//         .rpc();
//       assert.fail("Should have failed");
//     } catch (e: any) {
//       assert.ok(e.message.includes("already in use") || e.logs?.toString().includes("already in use"));
//     }
//   });
// });