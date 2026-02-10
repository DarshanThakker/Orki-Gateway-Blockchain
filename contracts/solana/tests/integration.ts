// // // import * as anchor from "@coral-xyz/anchor";
// // // import { Program } from "@coral-xyz/anchor";
// // // import { OrkiGateway } from "../target/types/orki_gateway";
// // // import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
// // // import { createMint, createAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID, getAccount } from "@solana/spl-token";
// // // import { assert } from "chai";

// // // describe("Orki Gateway - Integration", () => {
// // //     anchor.setProvider(anchor.AnchorProvider.env());

// // //     const program = anchor.workspace.OrkiGateway as Program<OrkiGateway>;
// // //     const provider = anchor.getProvider();

// // //     // Accounts
// // //     let globalStatePda: PublicKey;
// // //     const merchantOwner = Keypair.generate();
// // //     const merchantWallet = Keypair.generate();
// // //     const feeWallet = Keypair.generate();
// // //     const payer = Keypair.generate();

// // //     const feeBps = 100; // 1%
// // //     const solMerchantName = "SolanaShopInt";
// // //     const splMerchantName = "TokenStoreInt";

// // //     let mint: PublicKey;
// // //     let payerTokenAccount: PublicKey;
// // //     let merchantTokenAccount: PublicKey;
// // //     let feeTokenAccount: PublicKey;

// // //     let solMerchantPda: PublicKey;
// // //     let splMerchantPda: PublicKey;

// // //     before(async () => {
// // //         // 1. Airdrops
// // //         const latestBlockHash = await provider.connection.getLatestBlockhash();
// // //         await provider.connection.confirmTransaction({
// // //             blockhash: latestBlockHash.blockhash,
// // //             lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
// // //             signature: await provider.connection.requestAirdrop(payer.publicKey, 5 * LAMPORTS_PER_SOL)
// // //         });
// // //         await provider.connection.confirmTransaction({
// // //             blockhash: latestBlockHash.blockhash,
// // //             lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
// // //             signature: await provider.connection.requestAirdrop(merchantOwner.publicKey, 1 * LAMPORTS_PER_SOL)
// // //         });

// // //         // 2. PDAs
// // //         [globalStatePda] = PublicKey.findProgramAddressSync(
// // //             [Buffer.from("global_state")],
// // //             program.programId
// // //         );

// // //         [solMerchantPda] = PublicKey.findProgramAddressSync(
// // //             [Buffer.from("merchant"), merchantOwner.publicKey.toBuffer(), Buffer.from(solMerchantName)],
// // //             program.programId
// // //         );

// // //         [splMerchantPda] = PublicKey.findProgramAddressSync(
// // //             [Buffer.from("merchant"), merchantOwner.publicKey.toBuffer(), Buffer.from(splMerchantName)],
// // //             program.programId
// // //         );

// // //         // 3. Initialize Global State (if not already - though tests ideally run in isolation, localnet persists unless reset. 
// // //         // Anchor tests usually share state if consecutive? No, usually fresh if `anchor test` restarts validator. 
// // //         // But `anchor test` runs against localnet which might be preserved. 
// // //         // Safest is to try init, catch "already initialized" error, or just run init.
// // //         // For specific test files, we assume fresh state or re-init failure is ok.)

// // //         try {
// // //             await program.methods
// // //                 .initialize(feeBps, feeWallet.publicKey)
// // //                 .accountsStrict({
// // //                     globalState: globalStatePda,
// // //                     admin: provider.publicKey,
// // //                     systemProgram: SystemProgram.programId,
// // //                 })
// // //                 .rpc();
// // //         } catch (e: any) {
// // //             // Assume already initialized if error
// // //             console.log("Global state might be already initialized");
// // //         }

// // //         // 4. Register Merchants
// // //         await program.methods
// // //             .registerMerchant(merchantWallet.publicKey, PublicKey.default, solMerchantName)
// // //             .accountsStrict({
// // //                 merchant: solMerchantPda,
// // //                 owner: merchantOwner.publicKey,
// // //                 systemProgram: SystemProgram.programId,
// // //             })
// // //             .signers([merchantOwner])
// // //             .rpc();

// // //         // 5. Setup SPL
// // //         mint = await createMint(provider.connection, payer, payer.publicKey, null, 6);
// // //         payerTokenAccount = await createAssociatedTokenAccount(provider.connection, payer, mint, payer.publicKey);
// // //         merchantTokenAccount = await createAssociatedTokenAccount(provider.connection, payer, mint, merchantWallet.publicKey);
// // //         feeTokenAccount = await createAssociatedTokenAccount(provider.connection, payer, mint, feeWallet.publicKey);
// // //         await mintTo(provider.connection, payer, mint, payerTokenAccount, payer, 1_000_000);

// // //         await program.methods
// // //             .registerMerchant(merchantWallet.publicKey, mint, splMerchantName)
// // //             .accountsStrict({
// // //                 merchant: splMerchantPda,
// // //                 owner: merchantOwner.publicKey,
// // //                 systemProgram: SystemProgram.programId,
// // //             })
// // //             .signers([merchantOwner])
// // //             .rpc();
// // //     });

// // //     it("Process Payment (SOL)", async () => {
// // //         const amount = new anchor.BN(1 * LAMPORTS_PER_SOL);
// // //         const paymentId = new anchor.BN(Date.now());

// // //         const [paymentHistoryPda] = PublicKey.findProgramAddressSync(
// // //             [Buffer.from("payment"), payer.publicKey.toBuffer(), paymentId.toArrayLike(Buffer, "le", 8)],
// // //             program.programId
// // //         );

// // //         const fee = amount.mul(new anchor.BN(feeBps)).div(new anchor.BN(10000));
// // //         const merchantAmt = amount.sub(fee);

// // //         const initialMerchantBalance = await provider.connection.getBalance(merchantWallet.publicKey);
// // //         const initialFeeBalance = await provider.connection.getBalance(feeWallet.publicKey);

// // //         await program.methods
// // //             .processPayment(amount, paymentId, solMerchantName)
// // //             .accountsStrict({
// // //                 globalState: globalStatePda,
// // //                 merchant: solMerchantPda,
// // //                 payer: payer.publicKey,
// // //                 merchantWallet: merchantWallet.publicKey,
// // //                 feeWallet: feeWallet.publicKey,
// // //                 paymentHistory: paymentHistoryPda,
// // //                 systemProgram: SystemProgram.programId,
// // //                 tokenProgram: null,
// // //                 mint: null,
// // //                 payerTokenAccount: null,
// // //                 merchantTokenAccount: null,
// // //                 feeTokenAccount: null,
// // //             })
// // //             .signers([payer])
// // //             .rpc();

// // //         const balanceMerchant = await provider.connection.getBalance(merchantWallet.publicKey);
// // //         const balanceFee = await provider.connection.getBalance(feeWallet.publicKey);

// // //         assert.equal(balanceMerchant, initialMerchantBalance + merchantAmt.toNumber());
// // //         assert.equal(balanceFee, initialFeeBalance + fee.toNumber());
// // //     });

// // //     it("Process Payment (SPL)", async () => {
// // //         const amount = new anchor.BN(100_000);
// // //         const paymentId = new anchor.BN(Date.now() + 1);

// // //         const [paymentHistoryPda] = PublicKey.findProgramAddressSync(
// // //             [Buffer.from("payment"), payer.publicKey.toBuffer(), paymentId.toArrayLike(Buffer, "le", 8)],
// // //             program.programId
// // //         );

// // //         const fee = amount.mul(new anchor.BN(feeBps)).div(new anchor.BN(10000));
// // //         const merchantAmt = amount.sub(fee);

// // //         const merchantAcctBefore = await getAccount(provider.connection, merchantTokenAccount);
// // //         const feeAcctBefore = await getAccount(provider.connection, feeTokenAccount);

// // //         await program.methods
// // //             .processPayment(amount, paymentId, splMerchantName)
// // //             .accountsStrict({
// // //                 globalState: globalStatePda,
// // //                 merchant: splMerchantPda,
// // //                 payer: payer.publicKey,
// // //                 merchantWallet: merchantWallet.publicKey,
// // //                 feeWallet: feeWallet.publicKey,
// // //                 paymentHistory: paymentHistoryPda,
// // //                 systemProgram: SystemProgram.programId,
// // //                 tokenProgram: TOKEN_PROGRAM_ID,
// // //                 mint: mint,
// // //                 payerTokenAccount: payerTokenAccount,
// // //                 merchantTokenAccount: merchantTokenAccount,
// // //                 feeTokenAccount: feeTokenAccount,
// // //             })
// // //             .signers([payer])
// // //             .rpc();

// // //         const merchantAcct = await getAccount(provider.connection, merchantTokenAccount);
// // //         const feeAcct = await getAccount(provider.connection, feeTokenAccount);

// // //         assert.equal(
// // //             merchantAcct.amount.toString(),
// // //             (BigInt(merchantAcctBefore.amount.toString()) + BigInt(merchantAmt.toString())).toString()
// // //         );
// // //         assert.equal(
// // //             feeAcct.amount.toString(),
// // //             (BigInt(feeAcctBefore.amount.toString()) + BigInt(fee.toString())).toString()
// // //         );
// // //     });

// // //     it("Fail: Duplicate Payment ID", async () => {
// // //         const amount = new anchor.BN(10_000);
// // //         const paymentId = new anchor.BN(99999);
// // //         const [paymentHistoryPda] = PublicKey.findProgramAddressSync(
// // //             [Buffer.from("payment"), payer.publicKey.toBuffer(), paymentId.toArrayLike(Buffer, "le", 8)],
// // //             program.programId
// // //         );

// // //         // Initial Payment
// // //         await program.methods
// // //             .processPayment(amount, paymentId, solMerchantName)
// // //             .accountsStrict({
// // //                 globalState: globalStatePda,
// // //                 merchant: solMerchantPda,
// // //                 payer: payer.publicKey,
// // //                 merchantWallet: merchantWallet.publicKey,
// // //                 feeWallet: feeWallet.publicKey,
// // //                 paymentHistory: paymentHistoryPda,
// // //                 systemProgram: SystemProgram.programId,
// // //                 tokenProgram: null,
// // //                 mint: null,
// // //                 payerTokenAccount: null,
// // //                 merchantTokenAccount: null,
// // //                 feeTokenAccount: null,
// // //             })
// // //             .signers([payer])
// // //             .rpc();

// // //         // Duplicate Payment
// // //         try {
// // //             await program.methods
// // //                 .processPayment(amount, paymentId, solMerchantName)
// // //                 // ... accounts ...
// // //                 .accountsStrict({
// // //                     globalState: globalStatePda,
// // //                     merchant: solMerchantPda,
// // //                     payer: payer.publicKey,
// // //                     merchantWallet: merchantWallet.publicKey,
// // //                     feeWallet: feeWallet.publicKey,
// // //                     paymentHistory: paymentHistoryPda,
// // //                     systemProgram: SystemProgram.programId,
// // //                     tokenProgram: null,
// // //                     mint: null,
// // //                     payerTokenAccount: null,
// // //                     merchantTokenAccount: null,
// // //                     feeTokenAccount: null,
// // //                 })
// // //                 .signers([payer])
// // //                 .rpc();
// // //             assert.fail("Duplicate payment should have failed");
// // //         } catch (e: any) {
// // //             assert.ok(e.message.includes("already in use") || e.logs?.toString().includes("already in use"));
// // //         }
// // //     });

// // //     it("Fail: Payment Amount 0", async () => {
// // //         const amount = new anchor.BN(0);
// // //         const paymentId = new anchor.BN(Date.now() + 200);
// // //         const [paymentHistoryPda] = PublicKey.findProgramAddressSync(
// // //             [Buffer.from("payment"), payer.publicKey.toBuffer(), paymentId.toArrayLike(Buffer, "le", 8)],
// // //             program.programId
// // //         );

// // //         try {
// // //             await program.methods
// // //                 .processPayment(amount, paymentId, solMerchantName)
// // //                 .accountsStrict({
// // //                     globalState: globalStatePda,
// // //                     merchant: solMerchantPda,
// // //                     payer: payer.publicKey,
// // //                     merchantWallet: merchantWallet.publicKey,
// // //                     feeWallet: feeWallet.publicKey,
// // //                     paymentHistory: paymentHistoryPda,
// // //                     systemProgram: SystemProgram.programId,
// // //                     tokenProgram: null,
// // //                     mint: null,
// // //                     payerTokenAccount: null,
// // //                     merchantTokenAccount: null,
// // //                     feeTokenAccount: null,
// // //                 })
// // //                 .signers([payer])
// // //                 .rpc();
// // //             assert.fail("Should have failed");
// // //         } catch (e: any) {
// // //             assert.ok(e.message.includes("Invalid amount") || e.logs?.toString().includes("Invalid amount"));
// // //         }
// // //     });

// // //     it("Fail: Invalid Fee Wallet", async () => {
// // //         const amount = new anchor.BN(1 * LAMPORTS_PER_SOL);
// // //         const paymentId = new anchor.BN(Date.now() + 300);
// // //         const [paymentHistoryPda] = PublicKey.findProgramAddressSync(
// // //             [Buffer.from("payment"), payer.publicKey.toBuffer(), paymentId.toArrayLike(Buffer, "le", 8)],
// // //             program.programId
// // //         );
// // //         const fakeFeeWallet = Keypair.generate();

// // //         try {
// // //             await program.methods
// // //                 .processPayment(amount, paymentId, solMerchantName)
// // //                 .accountsStrict({
// // //                     globalState: globalStatePda,
// // //                     merchant: solMerchantPda,
// // //                     payer: payer.publicKey,
// // //                     merchantWallet: merchantWallet.publicKey,
// // //                     feeWallet: fakeFeeWallet.publicKey, // Wrong wallet
// // //                     paymentHistory: paymentHistoryPda,
// // //                     systemProgram: SystemProgram.programId,
// // //                     tokenProgram: null,
// // //                     mint: null,
// // //                     payerTokenAccount: null,
// // //                     merchantTokenAccount: null,
// // //                     feeTokenAccount: null,
// // //                 })
// // //                 .signers([payer])
// // //                 .rpc();
// // //             assert.fail("Should have failed");
// // //         } catch (e: any) {
// // //             assert.ok(e.message.includes("Invalid fee wallet") || e.logs?.toString().includes("Invalid fee wallet"));
// // //         }
// // //     });

// // //     it("Fail: Invalid Merchant Wallet", async () => {
// // //         const amount = new anchor.BN(1 * LAMPORTS_PER_SOL);
// // //         const paymentId = new anchor.BN(Date.now() + 400);
// // //         const [paymentHistoryPda] = PublicKey.findProgramAddressSync(
// // //             [Buffer.from("payment"), payer.publicKey.toBuffer(), paymentId.toArrayLike(Buffer, "le", 8)],
// // //             program.programId
// // //         );
// // //         const fakeMerchantWallet = Keypair.generate();

// // //         try {
// // //             await program.methods
// // //                 .processPayment(amount, paymentId, solMerchantName)
// // //                 .accountsStrict({
// // //                     globalState: globalStatePda,
// // //                     merchant: solMerchantPda,
// // //                     payer: payer.publicKey,
// // //                     merchantWallet: fakeMerchantWallet.publicKey, // Wrong wallet
// // //                     feeWallet: feeWallet.publicKey,
// // //                     paymentHistory: paymentHistoryPda,
// // //                     systemProgram: SystemProgram.programId,
// // //                     tokenProgram: null,
// // //                     mint: null,
// // //                     payerTokenAccount: null,
// // //                     merchantTokenAccount: null,
// // //                     feeTokenAccount: null,
// // //                 })
// // //                 .signers([payer])
// // //                 .rpc();
// // //             assert.fail("Should have failed");
// // //         } catch (e: any) {
// // //             assert.ok(e.message.includes("Invalid merchant wallet") || e.logs?.toString().includes("Invalid merchant wallet"));
// // //         }
// // //     });

// // //     it("Fail: Payment with Wrong Mint", async () => {
// // //         const amount = new anchor.BN(1000);
// // //         const paymentId = new anchor.BN(Date.now() + 500);
// // //         const [paymentHistoryPda] = PublicKey.findProgramAddressSync(
// // //             [Buffer.from("payment"), payer.publicKey.toBuffer(), paymentId.toArrayLike(Buffer, "le", 8)],
// // //             program.programId
// // //         );

// // //         const wrongMint = await createMint(provider.connection, payer, payer.publicKey, null, 6);
// // //         const wrongPayerTa = await createAssociatedTokenAccount(provider.connection, payer, wrongMint, payer.publicKey);
// // //         const wrongMerchantTa = await createAssociatedTokenAccount(provider.connection, payer, wrongMint, merchantWallet.publicKey);
// // //         const wrongFeeTa = await createAssociatedTokenAccount(provider.connection, payer, wrongMint, feeWallet.publicKey);

// // //         await mintTo(provider.connection, payer, wrongMint, wrongPayerTa, payer, 10000);

// // //         try {
// // //             await program.methods
// // //                 .processPayment(amount, paymentId, splMerchantName)
// // //                 .accountsStrict({
// // //                     globalState: globalStatePda,
// // //                     merchant: splMerchantPda, // Expects 'mint' but we provide 'wrongMint'
// // //                     payer: payer.publicKey,
// // //                     merchantWallet: merchantWallet.publicKey,
// // //                     feeWallet: feeWallet.publicKey,
// // //                     paymentHistory: paymentHistoryPda,
// // //                     systemProgram: SystemProgram.programId,
// // //                     tokenProgram: TOKEN_PROGRAM_ID,
// // //                     mint: wrongMint,
// // //                     payerTokenAccount: wrongPayerTa,
// // //                     merchantTokenAccount: wrongMerchantTa,
// // //                     feeTokenAccount: wrongFeeTa,
// // //                 })
// // //                 .signers([payer])
// // //                 .rpc();
// // //             assert.fail("Should have failed");
// // //         } catch (e: any) {
// // //             assert.ok(e.message.includes("Invalid token") || e.logs?.toString().includes("Invalid token"));
// // //         }
// // //     });

// // //     it("Fail: Process Payment When Paused", async () => {
// // //         // Pause Contract
// // //         await program.methods
// // //             .setPaused(true)
// // //             .accountsStrict({
// // //                 globalState: globalStatePda,
// // //                 admin: provider.publicKey,
// // //             })
// // //             .rpc();

// // //         const amount = new anchor.BN(1 * LAMPORTS_PER_SOL);
// // //         const paymentId = new anchor.BN(Date.now() + 600);

// // //         const [paymentHistoryPda] = PublicKey.findProgramAddressSync(
// // //             [Buffer.from("payment"), payer.publicKey.toBuffer(), paymentId.toArrayLike(Buffer, "le", 8)],
// // //             program.programId
// // //         );

// // //         try {
// // //             await program.methods
// // //                 .processPayment(amount, paymentId, solMerchantName)
// // //                 .accountsStrict({
// // //                     globalState: globalStatePda,
// // //                     merchant: solMerchantPda,
// // //                     payer: payer.publicKey,
// // //                     merchantWallet: merchantWallet.publicKey,
// // //                     feeWallet: feeWallet.publicKey,
// // //                     paymentHistory: paymentHistoryPda,
// // //                     systemProgram: SystemProgram.programId,
// // //                     tokenProgram: null,
// // //                     mint: null,
// // //                     payerTokenAccount: null,
// // //                     merchantTokenAccount: null,
// // //                     feeTokenAccount: null,
// // //                 })
// // //                 .signers([payer])
// // //                 .rpc();
// // //             assert.fail("Should have failed due to pause");
// // //         } catch (e: any) {
// // //             assert.ok(e.message.includes("Contract is paused") || e.logs?.toString().includes("Contract is paused"));
// // //         }

// // //         // Cleanup: Unpause for any future tests
// // //         await program.methods
// // //             .setPaused(false)
// // //             .accountsStrict({
// // //                 globalState: globalStatePda,
// // //                 admin: provider.publicKey,
// // //             })
// // //             .rpc();
// // //     });

// // // });



// // // tests/integration.test.ts
// // import * as anchor from "@coral-xyz/anchor";
// // import { Program } from "@coral-xyz/anchor";
// // import { OrkiGateway } from "../target/types/orki_gateway";
// // import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
// // import { assert } from "chai";
// // import { TestHelper } from "./utils/helpers";
// // import { TOKEN_PROGRAM_ID, getAccount } from "@solana/spl-token";

// // describe("Orki Gateway - Integration Tests", () => {
// //   const testId = TestHelper.generateTestId("integration");
// //   console.log(`Running integration tests with ID: ${testId}`);
  
// //   anchor.setProvider(anchor.AnchorProvider.env());
// //   const program = anchor.workspace.OrkiGateway as Program<OrkiGateway>;
// //   const helper = new TestHelper(program, testId);
// //   const provider = anchor.getProvider();

// //   // Core accounts
// //   const admin = Keypair.generate();
// //   const feeWallet = Keypair.generate();
// //   const newFeeWallet = Keypair.generate();

// //   // Merchant 1 (SOL)
// //   const merchant1Owner = Keypair.generate();
// //   const merchant1Wallet = Keypair.generate();
// //   const merchant1Name = "SOLStore";

// //   // Merchant 2 (SPL)
// //   const merchant2Owner = Keypair.generate();
// //   const merchant2Wallet = Keypair.generate();
// //   const merchant2Name = "TokenStore";

// //   // Customers
// //   const customer1 = Keypair.generate();
// //   const customer2 = Keypair.generate();

// //   // SPL setup
// //   let splMint: PublicKey;
// //   let customer1TokenAccount: PublicKey;
// //   let merchant2TokenAccount: PublicKey;
// //   let feeTokenAccount: PublicKey;

// //   before(async () => {
// //     console.log(`Test ID: ${testId}`);
    
// //     // Airdrop SOL to all accounts
// //     const accounts = [
// //       admin, feeWallet, newFeeWallet,
// //       merchant1Owner, merchant1Wallet,
// //       merchant2Owner, merchant2Wallet,
// //       customer1, customer2
// //     ];
    
// //     for (const account of accounts) {
// //       await helper.airdrop(account.publicKey, 2 * LAMPORTS_PER_SOL);
// //     }
// //   });

// //   it("should perform full E2E flow with multiple merchants", async () => {
// //     console.log("\n=== Starting E2E Integration Test ===\n");

// //     // 1. Initialize global state
// //     console.log("1. Initializing global state...");
// //     const [globalStatePda] = await helper.getGlobalState();
// //     await program.methods
// //       .initialize(150, feeWallet.publicKey) // 1.5% fee
// //       .accountsStrict({
// //         globalState: globalStatePda,
// //         admin: admin.publicKey,
// //         systemProgram: SystemProgram.programId,
// //       })
// //       .signers([admin])
// //       .rpc();

// //     // 2. Register SOL merchant
// //     console.log("2. Registering SOL merchant...");
// //     const [merchant1Pda] = helper.getMerchantPda(merchant1Owner.publicKey, merchant1Name);
// //     await program.methods
// //       .registerMerchant(merchant1Wallet.publicKey, PublicKey.default, merchant1Name)
// //       .accountsStrict({
// //         merchant: merchant1Pda,
// //         owner: merchant1Owner.publicKey,
// //         systemProgram: SystemProgram.programId,
// //       })
// //       .signers([merchant1Owner])
// //       .rpc();
      

// //     // 3. Setup SPL token for merchant 2
// //     console.log("3. Setting up SPL token...");
// //     splMint = await helper.createTokenMint(customer1);
// //     customer1TokenAccount = await helper.createTokenAccount(splMint, customer1.publicKey, customer1);
// //     merchant2TokenAccount = await helper.createTokenAccount(splMint, merchant2Wallet.publicKey, customer1);
// //     feeTokenAccount = await helper.createTokenAccount(splMint, feeWallet.publicKey, customer1);
    
// //     await helper.mintTokens(splMint, customer1TokenAccount, 10_000_000, customer1);

// //     // 4. Register SPL merchant
// //     console.log("4. Registering SPL merchant...");
// //     const merchant2Pda = helper.getMerchantPda(merchant2Owner.publicKey, merchant2Name);
// //     await program.methods
// //       .registerMerchant(merchant2Wallet.publicKey, splMint, merchant2Name)
// //       .accountsStrict({
// //         merchant: merchant2Pda,
// //         owner: merchant2Owner.publicKey,
// //         systemProgram: SystemProgram.programId,
// //       })
// //       .signers([merchant2Owner])
// //       .rpc();

// //     // 5. Process SOL payment (Customer 1 -> Merchant 1)
// //     console.log("5. Processing SOL payment...");
// //     const solAmount = new anchor.BN(0.5 * LAMPORTS_PER_SOL);
// //     const solPaymentId = new anchor.BN(Date.now());
// //     const solPaymentPda = helper.getPaymentPda(customer1.publicKey, solPaymentId);

// //     const merchant1BalanceBefore = await provider.connection.getBalance(merchant1Wallet.publicKey);
// //     const feeBalanceBefore = await provider.connection.getBalance(feeWallet.publicKey);

// //     await program.methods
// //       .processPayment(solAmount, solPaymentId, merchant1Name)
// //       .accountsStrict({
// //         globalState: globalStatePda,
// //         merchant: merchant1Pda,
// //         payer: customer1.publicKey,
// //         merchantWallet: merchant1Wallet.publicKey,
// //         feeWallet: feeWallet.publicKey,
// //         paymentHistory: solPaymentPda,
// //         systemProgram: SystemProgram.programId,
// //         tokenProgram: null,
// //         mint: null,
// //         payerTokenAccount: null,
// //         merchantTokenAccount: null,
// //         feeTokenAccount: null,
// //       })
// //       .signers([customer1])
// //       .rpc();

// //     // Verify SOL payment
// //     const merchant1BalanceAfter = await provider.connection.getBalance(merchant1Wallet.publicKey);
// //     const feeBalanceAfter = await provider.connection.getBalance(feeWallet.publicKey);
    
// //     const expectedFee = solAmount.mul(new anchor.BN(150)).div(new anchor.BN(10000));
// //     const expectedMerchantAmount = solAmount.sub(expectedFee);

// //     assert.equal(
// //       merchant1BalanceAfter - merchant1BalanceBefore,
// //       expectedMerchantAmount.toNumber()
// //     );
// //     assert.equal(
// //       feeBalanceAfter - feeBalanceBefore,
// //       expectedFee.toNumber()
// //     );

// //     // 6. Process SPL payment (Customer 1 -> Merchant 2)
// //     console.log("6. Processing SPL payment...");
// //     const splAmount = new anchor.BN(500_000);
// //     const splPaymentId = new anchor.BN(Date.now() + 1);
// //     const splPaymentPda = helper.getPaymentPda(customer1.publicKey, splPaymentId);

// //     const merchant2BalanceBefore = await getAccount(provider.connection, merchant2TokenAccount);
// //     const feeTokenBalanceBefore = await getAccount(provider.connection, feeTokenAccount);

// //     await program.methods
// //       .processPayment(splAmount, splPaymentId, merchant2Name)
// //       .accountsStrict({
// //         globalState: globalStatePda,
// //         merchant: merchant2Pda,
// //         payer: customer1.publicKey,
// //         merchantWallet: merchant2Wallet.publicKey,
// //         feeWallet: feeWallet.publicKey,
// //         paymentHistory: splPaymentPda,
// //         systemProgram: SystemProgram.programId,
// //         tokenProgram: TOKEN_PROGRAM_ID,
// //         mint: splMint,
// //         payerTokenAccount: customer1TokenAccount,
// //         merchantTokenAccount: merchant2TokenAccount,
// //         feeTokenAccount: feeTokenAccount,
// //       })
// //       .signers([customer1])
// //       .rpc();

// //     // Verify SPL payment
// //     const merchant2BalanceAfter = await getAccount(provider.connection, merchant2TokenAccount);
// //     const feeTokenBalanceAfter = await getAccount(provider.connection, feeTokenAccount);

// //     const splExpectedFee = splAmount.mul(new anchor.BN(150)).div(new anchor.BN(10000));
// //     const splExpectedMerchantAmount = splAmount.sub(splExpectedFee);

// //     assert.equal(
// //       BigInt(merchant2BalanceAfter.amount.toString()),
// //       BigInt(merchant2BalanceBefore.amount.toString()) + BigInt(splExpectedMerchantAmount.toString())
// //     );
// //     assert.equal(
// //       BigInt(feeTokenBalanceAfter.amount.toString()),
// //       BigInt(feeTokenBalanceBefore.amount.toString()) + BigInt(splExpectedFee.toString())
// //     );

// //     // 7. Admin updates fee
// //     console.log("7. Admin updating fee...");
// //     await program.methods
// //       .setFee(200) // 2%
// //       .accountsStrict({
// //         globalState: globalStatePda,
// //         admin: admin.publicKey,
// //       })
// //       .signers([admin])
// //       .rpc();

// //     const state = await program.account.globalState.fetch(globalStatePda);
// //     assert.equal(state.feeBps, 200);

// //     // 8. Merchant updates their settings
// //     console.log("8. Merchant updating settings...");
// //     const newMerchantName = "UpdatedTokenStore";
// //     await program.methods
// //       .updateMerchant(
// //         merchant2Name,
// //         newMerchantName,
// //         null,
// //         null,
// //         true // Enable swap
// //       )
// //       .accountsStrict({
// //         merchant: merchant2Pda,
// //         owner: merchant2Owner.publicKey,
// //       })
// //       .signers([merchant2Owner])
// //       .rpc();

// //     const updatedMerchant = await program.account.merchant.fetch(merchant2Pda);
// //     assert.equal(updatedMerchant.name, newMerchantName);
// //     assert.equal(updatedMerchant.swapEnabled, true);

// //     // 9. Transfer admin rights
// //     console.log("9. Transferring admin rights...");
// //     const newAdmin = Keypair.generate();
// //     await helper.airdrop(newAdmin.publicKey);

// //     await program.methods
// //       .updateAdmin(newAdmin.publicKey)
// //       .accountsStrict({
// //         globalState: globalStatePda,
// //         admin: admin.publicKey,
// //       })
// //       .signers([admin])
// //       .rpc();

// //     const finalState = await program.account.globalState.fetch(globalStatePda);
// //     assert.ok(finalState.admin.equals(newAdmin.publicKey));

// //     console.log("\n=== E2E Integration Test Completed Successfully ===\n");
// //   });

// //   it("should handle edge cases", async () => {
// //     // Test duplicate payment prevention
// //     const amount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
// //     const paymentId = new anchor.BN(999999);
// //     const merchant1Pda = helper.getMerchantPda(merchant1Owner.publicKey, merchant1Name);
// //     const paymentPda = helper.getPaymentPda(customer2.publicKey, paymentId);

// //     // First payment should succeed
// //     await program.methods
// //       .processPayment(amount, paymentId, merchant1Name)
// //       .accountsStrict({
// //         globalState: globalStatePda,
// //         merchant: merchant1Pda,
// //         payer: customer2.publicKey,
// //         merchantWallet: merchant1Wallet.publicKey,
// //         feeWallet: feeWallet.publicKey,
// //         paymentHistory: paymentPda,
// //         systemProgram: SystemProgram.programId,
// //         tokenProgram: null,
// //         mint: null,
// //         payerTokenAccount: null,
// //         merchantTokenAccount: null,
// //         feeTokenAccount: null,
// //       })
// //       .signers([customer2])
// //       .rpc();

// //     // Second payment with same ID should fail
// //     try {
// //       await program.methods
// //         .processPayment(amount, paymentId, merchant1Name)
// //         .accountsStrict({
// //           globalState: helper.globalStatePda,
// //           merchant: merchant1Pda,
// //           payer: customer2.publicKey,
// //           merchantWallet: merchant1Wallet.publicKey,
// //           feeWallet: feeWallet.publicKey,
// //           paymentHistory: paymentPda,
// //           systemProgram: SystemProgram.programId,
// //           tokenProgram: null,
// //           mint: null,
// //           payerTokenAccount: null,
// //           merchantTokenAccount: null,
// //           feeTokenAccount: null,
// //         })
// //         .signers([customer2])
// //         .rpc();
// //       assert.fail("Duplicate payment should have failed");
// //     } catch (e: any) {
// //       assert.ok(e.message.includes("already in use"));
// //     }
// //   });
// // });




// import * as anchor from "@coral-xyz/anchor";
// import { Program } from "@coral-xyz/anchor";
// import { OrkiGateway } from "../target/types/orki_gateway";
// import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
// import { assert } from "chai";
// import { TestHelper } from "./utils/helpers";
// import { TOKEN_PROGRAM_ID, getAccount } from "@solana/spl-token";

// describe("Orki Gateway - Integration Tests", () => {
//   const testId = TestHelper.generateTestId("integration");
//   console.log(`Running integration tests with ID: ${testId}`);
  
//   anchor.setProvider(anchor.AnchorProvider.env());
//   const program = anchor.workspace.OrkiGateway as Program<OrkiGateway>;
//   const helper = new TestHelper(program, testId);
//   const provider = anchor.getProvider();

//   // Core accounts
//   const admin = Keypair.generate();
//   const feeWallet = Keypair.generate();
//   const newFeeWallet = Keypair.generate();

//   // Merchant 1 (SOL)
//   const merchant1Owner = Keypair.generate();
//   const merchant1Wallet = Keypair.generate();
//   const merchant1Name = "SOLStore";

//   // Merchant 2 (SPL)
//   const merchant2Owner = Keypair.generate();
//   const merchant2Wallet = Keypair.generate();
//   const merchant2Name = "TokenStore";

//   // Customers
//   const customer1 = Keypair.generate();
//   const customer2 = Keypair.generate();

//   // SPL setup
//   let splMint: PublicKey;
//   let customer1TokenAccount: PublicKey;
//   let merchant2TokenAccount: PublicKey;
//   let feeTokenAccount: PublicKey;

//   // Store PDAs at suite level
//   let globalStatePda: PublicKey;
//   let merchant1Pda: PublicKey;
//   let merchant2Pda: PublicKey;

//   before(async () => {
//     console.log(`Test ID: ${testId}`);
    
//     // Airdrop SOL to all accounts
//     const accounts = [
//       admin, feeWallet, newFeeWallet,
//       merchant1Owner, merchant1Wallet,
//       merchant2Owner, merchant2Wallet,
//       customer1, customer2
//     ];
    
//     for (const account of accounts) {
//       await helper.airdrop(account.publicKey, 2 * LAMPORTS_PER_SOL);
//     }
    
//     // Calculate PDAs once
//     [globalStatePda] = await helper.getGlobalState(); // Extract just PublicKey
//     [merchant1Pda] = helper.getMerchantPda(merchant1Owner.publicKey, merchant1Name);
//     [merchant2Pda] = helper.getMerchantPda(merchant2Owner.publicKey, merchant2Name);
//   });

//   it("should perform full E2E flow with multiple merchants", async () => {
//     console.log("\n=== Starting E2E Integration Test ===\n");

//     // 1. Initialize global state
//     console.log("1. Initializing global state...");
//     await program.methods
//       .initialize(150, feeWallet.publicKey) // 1.5% fee
//       .accountsStrict({
//         globalState: globalStatePda, // Just PublicKey, not tuple
//         admin: admin.publicKey,
//         systemProgram: SystemProgram.programId,
//       })
//       .signers([admin])
//       .rpc();

//     // 2. Register SOL merchant
//     console.log("2. Registering SOL merchant...");
//     await program.methods
//       .registerMerchant(merchant1Wallet.publicKey, PublicKey.default, merchant1Name)
//       .accountsStrict({
//         merchant: merchant1Pda, // Just PublicKey, not tuple
//         owner: merchant1Owner.publicKey,
//         systemProgram: SystemProgram.programId,
//       })
//       .signers([merchant1Owner])
//       .rpc();

//     // 3. Setup SPL token for merchant 2
//     console.log("3. Setting up SPL token...");
//     splMint = await helper.createTokenMint(customer1);
//     customer1TokenAccount = await helper.createTokenAccount(splMint, customer1.publicKey, customer1);
//     merchant2TokenAccount = await helper.createTokenAccount(splMint, merchant2Wallet.publicKey, customer1);
//     feeTokenAccount = await helper.createTokenAccount(splMint, feeWallet.publicKey, customer1);
    
//     await helper.mintTokens(splMint, customer1TokenAccount, 10_000_000, customer1);

//     // 4. Register SPL merchant
//     console.log("4. Registering SPL merchant...");
//     await program.methods
//       .registerMerchant(merchant2Wallet.publicKey, splMint, merchant2Name)
//       .accountsStrict({
//         merchant: merchant2Pda, // Just PublicKey, not tuple
//         owner: merchant2Owner.publicKey,
//         systemProgram: SystemProgram.programId,
//       })
//       .signers([merchant2Owner])
//       .rpc();

//     // 5. Process SOL payment (Customer 1 -> Merchant 1)
//     console.log("5. Processing SOL payment...");
//     const solAmount = new anchor.BN(0.5 * LAMPORTS_PER_SOL);
//     const solPaymentId = new anchor.BN(Date.now());
//     const [solPaymentPda] = helper.getPaymentPda(customer1.publicKey, solPaymentId); // Extract PublicKey

//     const merchant1BalanceBefore = await provider.connection.getBalance(merchant1Wallet.publicKey);
//     const feeBalanceBefore = await provider.connection.getBalance(feeWallet.publicKey);

//     await program.methods
//       .processPayment(solAmount, solPaymentId, merchant1Name)
//       .accountsStrict({
//         globalState: globalStatePda,
//         merchant: merchant1Pda,
//         payer: customer1.publicKey,
//         merchantWallet: merchant1Wallet.publicKey,
//         feeWallet: feeWallet.publicKey,
//         paymentHistory: solPaymentPda, // Just PublicKey
//         systemProgram: SystemProgram.programId,
//         tokenProgram: null,
//         mint: null,
//         payerTokenAccount: null,
//         merchantTokenAccount: null,
//         feeTokenAccount: null,
//       })
//       .signers([customer1])
//       .rpc();

//     // Verify SOL payment
//     const merchant1BalanceAfter = await provider.connection.getBalance(merchant1Wallet.publicKey);
//     const feeBalanceAfter = await provider.connection.getBalance(feeWallet.publicKey);
    
//     const expectedFee = solAmount.mul(new anchor.BN(150)).div(new anchor.BN(10000));
//     const expectedMerchantAmount = solAmount.sub(expectedFee);

//     assert.equal(
//       merchant1BalanceAfter - merchant1BalanceBefore,
//       expectedMerchantAmount.toNumber()
//     );
//     assert.equal(
//       feeBalanceAfter - feeBalanceBefore,
//       expectedFee.toNumber()
//     );

//     // 6. Process SPL payment (Customer 1 -> Merchant 2)
//     console.log("6. Processing SPL payment...");
//     const splAmount = new anchor.BN(500_000);
//     const splPaymentId = new anchor.BN(Date.now() + 1);
//     const [splPaymentPda] = helper.getPaymentPda(customer1.publicKey, splPaymentId); // Extract PublicKey

//     const merchant2BalanceBefore = await getAccount(provider.connection, merchant2TokenAccount);
//     const feeTokenBalanceBefore = await getAccount(provider.connection, feeTokenAccount);

//     await program.methods
//       .processPayment(splAmount, splPaymentId, merchant2Name)
//       .accountsStrict({
//         globalState: globalStatePda,
//         merchant: merchant2Pda,
//         payer: customer1.publicKey,
//         merchantWallet: merchant2Wallet.publicKey,
//         feeWallet: feeWallet.publicKey,
//         paymentHistory: splPaymentPda, // Just PublicKey
//         systemProgram: SystemProgram.programId,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         mint: splMint,
//         payerTokenAccount: customer1TokenAccount,
//         merchantTokenAccount: merchant2TokenAccount,
//         feeTokenAccount: feeTokenAccount,
//       })
//       .signers([customer1])
//       .rpc();

//     // Verify SPL payment
//     const merchant2BalanceAfter = await getAccount(provider.connection, merchant2TokenAccount);
//     const feeTokenBalanceAfter = await getAccount(provider.connection, feeTokenAccount);

//     const splExpectedFee = splAmount.mul(new anchor.BN(150)).div(new anchor.BN(10000));
//     const splExpectedMerchantAmount = splAmount.sub(splExpectedFee);

//     assert.equal(
//       BigInt(merchant2BalanceAfter.amount.toString()),
//       BigInt(merchant2BalanceBefore.amount.toString()) + BigInt(splExpectedMerchantAmount.toString())
//     );
//     assert.equal(
//       BigInt(feeTokenBalanceAfter.amount.toString()),
//       BigInt(feeTokenBalanceBefore.amount.toString()) + BigInt(splExpectedFee.toString())
//     );

//     // 7. Admin updates fee
//     console.log("7. Admin updating fee...");
//     await program.methods
//       .setFee(200) // 2%
//       .accountsStrict({
//         globalState: globalStatePda,
//         admin: admin.publicKey,
//       })
//       .signers([admin])
//       .rpc();

//     const state = await program.account.globalState.fetch(globalStatePda);
//     assert.equal(state.feeBps, 200);

//     // 8. Merchant updates their settings
//     console.log("8. Merchant updating settings...");
//     const newMerchantName = "UpdatedTokenStore";
//     await program.methods
//       .updateMerchant(
//         merchant2Name,
//         newMerchantName,
//         null,
//         null,
//         true // Enable swap
//       )
//       .accountsStrict({
//         merchant: merchant2Pda,
//         owner: merchant2Owner.publicKey,
//       })
//       .signers([merchant2Owner])
//       .rpc();

//     const updatedMerchant = await program.account.merchant.fetch(merchant2Pda);
//     assert.equal(updatedMerchant.name, newMerchantName);
//     assert.equal(updatedMerchant.swapEnabled, true);

//     // 9. Transfer admin rights
//     console.log("9. Transferring admin rights...");
//     const newAdmin = Keypair.generate();
//     await helper.airdrop(newAdmin.publicKey);

//     await program.methods
//       .updateAdmin(newAdmin.publicKey)
//       .accountsStrict({
//         globalState: globalStatePda,
//         admin: admin.publicKey,
//       })
//       .signers([admin])
//       .rpc();

//     const finalState = await program.account.globalState.fetch(globalStatePda);
//     assert.ok(finalState.admin.equals(newAdmin.publicKey));

//     console.log("\n=== E2E Integration Test Completed Successfully ===\n");
//   });

//   it("should handle edge cases", async () => {
//     // Test duplicate payment prevention
//     const amount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
//     const paymentId = new anchor.BN(999999);
//     const [paymentPda] = helper.getPaymentPda(customer2.publicKey, paymentId); // Extract PublicKey

//     // First payment should succeed
//     await program.methods
//       .processPayment(amount, paymentId, merchant1Name)
//       .accountsStrict({
//         globalState: globalStatePda,
//         merchant: merchant1Pda,
//         payer: customer2.publicKey,
//         merchantWallet: merchant1Wallet.publicKey,
//         feeWallet: feeWallet.publicKey,
//         paymentHistory: paymentPda, // Just PublicKey
//         systemProgram: SystemProgram.programId,
//         tokenProgram: null,
//         mint: null,
//         payerTokenAccount: null,
//         merchantTokenAccount: null,
//         feeTokenAccount: null,
//       })
//       .signers([customer2])
//       .rpc();

//     // Second payment with same ID should fail
//     try {
//       await program.methods
//         .processPayment(amount, paymentId, merchant1Name)
//         .accountsStrict({
//           globalState: globalStatePda,
//           merchant: merchant1Pda,
//           payer: customer2.publicKey,
//           merchantWallet: merchant1Wallet.publicKey,
//           feeWallet: feeWallet.publicKey,
//           paymentHistory: paymentPda, // Just PublicKey
//           systemProgram: SystemProgram.programId,
//           tokenProgram: null,
//           mint: null,
//           payerTokenAccount: null,
//           merchantTokenAccount: null,
//           feeTokenAccount: null,
//         })
//         .signers([customer2])
//         .rpc();
//       assert.fail("Duplicate payment should have failed");
//     } catch (e: any) {
//       assert.ok(e.message.includes("already in use"));
//     }
//   });
// });




import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { OrkiGateway } from "../target/types/orki_gateway";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
import { TestHelper } from "./utils/helpers";
import { TOKEN_PROGRAM_ID, getAccount } from "@solana/spl-token";

describe("Orki Gateway - Integration Tests", () => {
    const testId = TestHelper.generateTestId("integration");
    console.log(`Running integration tests with ID: ${testId}`);

    anchor.setProvider(anchor.AnchorProvider.env());
    const program = anchor.workspace.OrkiGateway as Program<OrkiGateway>;
    const helper = new TestHelper(program, testId);
    const provider = anchor.getProvider();

    // Core accounts
    const admin = helper.getAdminKeypair(); // Use shared deterministic admin
    const feeWallet = Keypair.generate();
    const newFeeWallet = Keypair.generate();

    // Merchant 1 (SOL)
    const merchant1Owner = Keypair.generate();
    const merchant1Wallet = Keypair.generate();
    const merchant1Name = "SOLStore";

    // Merchant 2 (SPL)
    const merchant2Owner = Keypair.generate();
    const merchant2Wallet = Keypair.generate();
    const merchant2Name = "TokenStore";

    // Customers
    const customer1 = Keypair.generate();
    const customer2 = Keypair.generate();

    // SPL setup
    let splMint: PublicKey;
    let customer1TokenAccount: PublicKey;
    let merchant2TokenAccount: PublicKey;
    let feeTokenAccount: PublicKey;

    // Store PDAs at suite level
    let globalStatePda: PublicKey;
    let merchant1Pda: PublicKey;
    let merchant2Pda: PublicKey;

    before(async () => {
        console.log(`Test ID: ${testId}`);

        // Airdrop SOL to all accounts
        const accounts = [
            admin, feeWallet, newFeeWallet,
            merchant1Owner, merchant1Wallet,
            merchant2Owner, merchant2Wallet,
            customer1, customer2
        ];

        for (const account of accounts) {
            await helper.airdrop(account.publicKey, 2 * LAMPORTS_PER_SOL);
        }

        // Calculate PDAs once
        [globalStatePda] = await helper.getGlobalState(); // Extract just PublicKey
        [merchant1Pda] = helper.getMerchantPda(merchant1Owner.publicKey, merchant1Name);
        [merchant2Pda] = helper.getMerchantPda(merchant2Owner.publicKey, merchant2Name);

        // Ensure Global State is Configured correctly for this test suite
        try {
            await program.methods
                .initialize(150, feeWallet.publicKey) // 1.5% fee
                .accountsStrict({
                    globalState: globalStatePda,
                    admin: admin.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([admin])
                .rpc();
        } catch (e: any) {
            if (e.message.includes("already in use") || e.logs?.some((l: string) => l.includes("already in use")) || e.toString().includes("already in use")) {
                console.log("Global State exists. Updating config...");
                // Update Fee and Wallet to match this test's expectations
                await program.methods.setFee(150).accountsStrict({ globalState: globalStatePda, admin: admin.publicKey }).signers([admin]).rpc();
                await program.methods.setFeeWallet(feeWallet.publicKey).accountsStrict({ globalState: globalStatePda, admin: admin.publicKey }).signers([admin]).rpc();
                await program.methods.setPaused(false).accountsStrict({ globalState: globalStatePda, admin: admin.publicKey }).signers([admin]).rpc();
            } else {
                throw e;
            }
        }
    });

    it("should perform full E2E flow with multiple merchants", async () => {
        console.log("\n=== Starting E2E Integration Test ===\n");

        // 1. Initialize global state
        // 1. Initialize global state (Already done in before hook)
        console.log("1. Global state verification...");
        const initialState = await program.account.globalState.fetch(globalStatePda);
        assert.equal(initialState.feeBps, 150);

        // 2. Register SOL merchant
        console.log("2. Registering SOL merchant...");
        await program.methods
            .registerMerchant(merchant1Wallet.publicKey, PublicKey.default, merchant1Name)
            .accountsStrict({
                merchant: merchant1Pda, // Just PublicKey, not tuple
                owner: merchant1Owner.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([merchant1Owner])
            .rpc();

        // 3. Setup SPL token for merchant 2
        console.log("3. Setting up SPL token...");
        splMint = await helper.createTokenMint(customer1);
        customer1TokenAccount = await helper.createTokenAccount(splMint, customer1.publicKey, customer1);
        merchant2TokenAccount = await helper.createTokenAccount(splMint, merchant2Wallet.publicKey, customer1);
        feeTokenAccount = await helper.createTokenAccount(splMint, feeWallet.publicKey, customer1);

        await helper.mintTokens(splMint, customer1TokenAccount, 10_000_000, customer1);

        // 4. Register SPL merchant
        console.log("4. Registering SPL merchant...");
        await program.methods
            .registerMerchant(merchant2Wallet.publicKey, splMint, merchant2Name)
            .accountsStrict({
                merchant: merchant2Pda, // Just PublicKey, not tuple
                owner: merchant2Owner.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([merchant2Owner])
            .rpc();

        // 5. Process SOL payment (Customer 1 -> Merchant 1)
        console.log("5. Processing SOL payment...");
        const solAmount = new anchor.BN(0.5 * LAMPORTS_PER_SOL);
        const solPaymentId = new anchor.BN(Date.now());
        const [solPaymentPda] = helper.getPaymentPda(customer1.publicKey, solPaymentId); // Extract PublicKey

        const merchant1BalanceBefore = await provider.connection.getBalance(merchant1Wallet.publicKey);
        const feeBalanceBefore = await provider.connection.getBalance(feeWallet.publicKey);

        await program.methods
            .processPayment(solAmount, solPaymentId, merchant1Name)
            .accountsStrict({
                globalState: globalStatePda,
                merchant: merchant1Pda,
                payer: customer1.publicKey,
                merchantWallet: merchant1Wallet.publicKey,
                feeWallet: feeWallet.publicKey,
                paymentHistory: solPaymentPda, // Just PublicKey
                systemProgram: SystemProgram.programId,
                tokenProgram: null,
                mint: null,
                payerTokenAccount: null,
                merchantTokenAccount: null,
                feeTokenAccount: null,
            })
            .signers([customer1])
            .rpc();

        // Verify SOL payment
        const merchant1BalanceAfter = await provider.connection.getBalance(merchant1Wallet.publicKey);
        const feeBalanceAfter = await provider.connection.getBalance(feeWallet.publicKey);

        const expectedFee = solAmount.mul(new anchor.BN(150)).div(new anchor.BN(10000));
        const expectedMerchantAmount = solAmount.sub(expectedFee);

        assert.equal(
            merchant1BalanceAfter - merchant1BalanceBefore,
            expectedMerchantAmount.toNumber()
        );
        assert.equal(
            feeBalanceAfter - feeBalanceBefore,
            expectedFee.toNumber()
        );

        // 6. Process SPL payment (Customer 1 -> Merchant 2)
        console.log("6. Processing SPL payment...");
        const splAmount = new anchor.BN(500_000);
        const splPaymentId = new anchor.BN(Date.now() + 1);
        const [splPaymentPda] = helper.getPaymentPda(customer1.publicKey, splPaymentId); // Extract PublicKey

        const merchant2BalanceBefore = await getAccount(provider.connection, merchant2TokenAccount);
        const feeTokenBalanceBefore = await getAccount(provider.connection, feeTokenAccount);

        await program.methods
            .processPayment(splAmount, splPaymentId, merchant2Name)
            .accountsStrict({
                globalState: globalStatePda,
                merchant: merchant2Pda,
                payer: customer1.publicKey,
                merchantWallet: merchant2Wallet.publicKey,
                feeWallet: feeWallet.publicKey,
                paymentHistory: splPaymentPda, // Just PublicKey
                systemProgram: SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                mint: splMint,
                payerTokenAccount: customer1TokenAccount,
                merchantTokenAccount: merchant2TokenAccount,
                feeTokenAccount: feeTokenAccount,
            })
            .signers([customer1])
            .rpc();

        // Verify SPL payment
        const merchant2BalanceAfter = await getAccount(provider.connection, merchant2TokenAccount);
        const feeTokenBalanceAfter = await getAccount(provider.connection, feeTokenAccount);

        const splExpectedFee = splAmount.mul(new anchor.BN(150)).div(new anchor.BN(10000));
        const splExpectedMerchantAmount = splAmount.sub(splExpectedFee);

        assert.equal(
            BigInt(merchant2BalanceAfter.amount.toString()),
            BigInt(merchant2BalanceBefore.amount.toString()) + BigInt(splExpectedMerchantAmount.toString())
        );
        assert.equal(
            BigInt(feeTokenBalanceAfter.amount.toString()),
            BigInt(feeTokenBalanceBefore.amount.toString()) + BigInt(splExpectedFee.toString())
        );

        // 7. Admin updates fee
        console.log("7. Admin updating fee...");
        await program.methods
            .setFee(200) // 2%
            .accountsStrict({
                globalState: globalStatePda,
                admin: admin.publicKey,
            })
            .signers([admin])
            .rpc();

        const state = await program.account.globalState.fetch(globalStatePda);
        assert.equal(state.feeBps, 200);

        // 8. Merchant updates their settings
        console.log("8. Merchant updating settings...");
        const newMerchantName = "UpdatedTokenStore";
        await program.methods
            .updateMerchant(
                merchant2Name,
                newMerchantName,
                null,
                null,
                true // Enable swap
            )
            .accountsStrict({
                merchant: merchant2Pda,
                owner: merchant2Owner.publicKey,
            })
            .signers([merchant2Owner])
            .rpc();

        const updatedMerchant = await program.account.merchant.fetch(merchant2Pda);
        assert.equal(updatedMerchant.name, newMerchantName);
        assert.equal(updatedMerchant.swapEnabled, true);

        // 9. Transfer admin rights
        console.log("9. Transferring admin rights...");
        const newAdmin = Keypair.generate();
        await helper.airdrop(newAdmin.publicKey);

        await program.methods
            .updateAdmin(newAdmin.publicKey)
            .accountsStrict({
                globalState: globalStatePda,
                admin: admin.publicKey,
            })
            .signers([admin])
            .rpc();

        const finalState = await program.account.globalState.fetch(globalStatePda);
        assert.ok(finalState.admin.equals(newAdmin.publicKey));


        console.log("Restoring admin rights in integration test...");
        await program.methods
            .updateAdmin(admin.publicKey)
            .accountsStrict({
                globalState: globalStatePda,
                admin: newAdmin.publicKey,
            })
            .signers([newAdmin])
            .rpc();

        const restoredState = await program.account.globalState.fetch(globalStatePda);
        assert.ok(restoredState.admin.equals(admin.publicKey));

        console.log("\n=== E2E Integration Test Completed Successfully ===\n");
    });

    it("should handle edge cases", async () => {
        // Test duplicate payment prevention
        const amount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
        const paymentId = new anchor.BN(999999);
        const [paymentPda] = helper.getPaymentPda(customer2.publicKey, paymentId); // Extract PublicKey

        // First payment should succeed
        await program.methods
            .processPayment(amount, paymentId, merchant1Name)
            .accountsStrict({
                globalState: globalStatePda,
                merchant: merchant1Pda,
                payer: customer2.publicKey,
                merchantWallet: merchant1Wallet.publicKey,
                feeWallet: feeWallet.publicKey,
                paymentHistory: paymentPda, // Just PublicKey
                systemProgram: SystemProgram.programId,
                tokenProgram: null,
                mint: null,
                payerTokenAccount: null,
                merchantTokenAccount: null,
                feeTokenAccount: null,
            })
            .signers([customer2])
            .rpc();

        // Second payment with same ID should fail
        try {
            await program.methods
                .processPayment(amount, paymentId, merchant1Name)
                .accountsStrict({
                    globalState: globalStatePda,
                    merchant: merchant1Pda,
                    payer: customer2.publicKey,
                    merchantWallet: merchant1Wallet.publicKey,
                    feeWallet: feeWallet.publicKey,
                    paymentHistory: paymentPda, // Just PublicKey
                    systemProgram: SystemProgram.programId,
                    tokenProgram: null,
                    mint: null,
                    payerTokenAccount: null,
                    merchantTokenAccount: null,
                    feeTokenAccount: null,
                })
                .signers([customer2])
                .rpc();
            assert.fail("Duplicate payment should have failed");
        } catch (e: any) {
            assert.ok(e.message.includes("already in use"));
        }
    });
});