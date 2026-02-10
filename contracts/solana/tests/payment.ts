
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { OrkiGateway } from "../target/types/orki_gateway";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
import { TestHelper } from "./utils/helpers";
import { TOKEN_PROGRAM_ID, getAccount } from "@solana/spl-token";

describe("Payment Processing", () => {
    const testId = TestHelper.generateTestId("payments");
    console.log(`Running payment tests with ID: ${testId}`);

    anchor.setProvider(anchor.AnchorProvider.env());
    const program = anchor.workspace.OrkiGateway as Program<OrkiGateway>;
    const helper = new TestHelper(program, testId);
    const provider = anchor.getProvider();

    const admin = helper.getAdminKeypair(); // Use shared deterministic admin
    const merchantOwner = Keypair.generate();
    const merchantWallet = Keypair.generate();
    const feeWallet = Keypair.generate();
    const payer = Keypair.generate();

    const merchantName = "PaymentTestShop";

    // SPL setup
    let mint: PublicKey;
    let payerTokenAccount: PublicKey;
    let merchantTokenAccount: PublicKey;
    let feeTokenAccount: PublicKey;

    // Store PDAs at suite level
    let merchantPda: PublicKey;

    before(async () => {
        // Setup accounts
        await helper.airdrop(admin.publicKey, 2 * LAMPORTS_PER_SOL);
        await helper.airdrop(merchantOwner.publicKey);
        await helper.airdrop(merchantWallet.publicKey);
        await helper.airdrop(feeWallet.publicKey);
        await helper.airdrop(payer.publicKey, 5 * LAMPORTS_PER_SOL);

        // Initialize global state or update if exists
        try {
            await program.methods
                .initialize(100, feeWallet.publicKey)
                .accountsStrict({
                    globalState: helper.globalStatePda,
                    admin: admin.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([admin])
                .rpc();
        } catch (e: any) {
            if (e.message.includes("already in use") || e.logs?.some((l: string) => l.includes("already in use")) || e.toString().includes("already in use")) {
                console.log("Global State exists. Updating config...");
                await program.methods.setFee(100).accountsStrict({ globalState: helper.globalStatePda, admin: admin.publicKey }).signers([admin]).rpc();
                await program.methods.setFeeWallet(feeWallet.publicKey).accountsStrict({ globalState: helper.globalStatePda, admin: admin.publicKey }).signers([admin]).rpc();
                await program.methods.setPaused(false).accountsStrict({ globalState: helper.globalStatePda, admin: admin.publicKey }).signers([admin]).rpc();
            } else {
                throw e;
            }
        }

        // Register merchant
        [merchantPda] = helper.getMerchantPda(merchantOwner.publicKey, merchantName);
        await program.methods
            .registerMerchant(merchantWallet.publicKey, PublicKey.default, merchantName)
            .accountsStrict({
                merchant: merchantPda,
                owner: merchantOwner.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([merchantOwner])
            .rpc();

        // Setup SPL token
        mint = await helper.createTokenMint(payer);
        payerTokenAccount = await helper.createTokenAccount(mint, payer.publicKey, payer);
        merchantTokenAccount = await helper.createTokenAccount(mint, merchantWallet.publicKey, payer);
        feeTokenAccount = await helper.createTokenAccount(mint, feeWallet.publicKey, payer);

        await helper.mintTokens(mint, payerTokenAccount, 1_000_000, payer);
    });

    describe("SOL Payments", () => {
        it("should process SOL payment successfully", async () => {
            const amount = new anchor.BN(1 * LAMPORTS_PER_SOL);
            const paymentId = new anchor.BN(Date.now());
            const [paymentPda] = helper.getPaymentPda(payer.publicKey, paymentId); // Extract PublicKey

            const initialMerchantBalance = await provider.connection.getBalance(merchantWallet.publicKey);
            const initialFeeBalance = await provider.connection.getBalance(feeWallet.publicKey);

            // Calculate expected amounts
            const fee = amount.mul(new anchor.BN(100)).div(new anchor.BN(10000));
            const merchantAmount = amount.sub(fee);

            await program.methods
                .processPayment(amount, paymentId, merchantName)
                .accountsStrict({
                    globalState: helper.globalStatePda, // Use helper.globalStatePda
                    merchant: merchantPda, // Now accessible at suite level
                    payer: payer.publicKey,
                    merchantWallet: merchantWallet.publicKey,
                    feeWallet: feeWallet.publicKey,
                    paymentHistory: paymentPda,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: null,
                    mint: null,
                    payerTokenAccount: null,
                    merchantTokenAccount: null,
                    feeTokenAccount: null,
                })
                .signers([payer])
                .rpc();

            const finalMerchantBalance = await provider.connection.getBalance(merchantWallet.publicKey);
            const finalFeeBalance = await provider.connection.getBalance(feeWallet.publicKey);

            assert.equal(
                finalMerchantBalance,
                initialMerchantBalance + merchantAmount.toNumber()
            );
            assert.equal(
                finalFeeBalance,
                initialFeeBalance + fee.toNumber()
            );

            // Verify payment history
            const payment = await program.account.payment.fetch(paymentPda);
            assert.ok(payment.payer.equals(payer.publicKey));
            assert.equal(payment.amount.toString(), amount.toString());
        });

        it("should fail if contract is paused", async () => {
            // Pause contract
            await program.methods
                .setPaused(true)
                .accountsStrict({
                    globalState: helper.globalStatePda,
                    admin: admin.publicKey,
                })
                .signers([admin])
                .rpc();

            const amount = new anchor.BN(0.5 * LAMPORTS_PER_SOL);
            const paymentId = new anchor.BN(Date.now() + 1);
            const [paymentPda] = helper.getPaymentPda(payer.publicKey, paymentId); // Extract PublicKey

            try {
                await program.methods
                    .processPayment(amount, paymentId, merchantName)
                    .accountsStrict({
                        globalState: helper.globalStatePda,
                        merchant: merchantPda,
                        payer: payer.publicKey,
                        merchantWallet: merchantWallet.publicKey,
                        feeWallet: feeWallet.publicKey,
                        paymentHistory: paymentPda,
                        systemProgram: SystemProgram.programId,
                        tokenProgram: null,
                        mint: null,
                        payerTokenAccount: null,
                        merchantTokenAccount: null,
                        feeTokenAccount: null,
                    })
                    .signers([payer])
                    .rpc();
                assert.fail("Should have failed");
            } catch (e: any) {
                assert.ok(e.message.includes("Paused"));
            }

            // Unpause for other tests
            await program.methods
                .setPaused(false)
                .accountsStrict({
                    globalState: helper.globalStatePda,
                    admin: admin.publicKey,
                })
                .signers([admin])
                .rpc();
        });

        it("should fail with insufficient balance", async () => {
            const hugeAmount = new anchor.BN(1000 * LAMPORTS_PER_SOL);
            const paymentId = new anchor.BN(Date.now() + 2);
            const [paymentPda] = helper.getPaymentPda(payer.publicKey, paymentId); // Extract PublicKey

            try {
                await program.methods
                    .processPayment(hugeAmount, paymentId, merchantName)
                    .accountsStrict({
                        globalState: helper.globalStatePda,
                        merchant: merchantPda,
                        payer: payer.publicKey,
                        merchantWallet: merchantWallet.publicKey,
                        feeWallet: feeWallet.publicKey,
                        paymentHistory: paymentPda,
                        systemProgram: SystemProgram.programId,
                        tokenProgram: null,
                        mint: null,
                        payerTokenAccount: null,
                        merchantTokenAccount: null,
                        feeTokenAccount: null,
                    })
                    .signers([payer])
                    .rpc();
                assert.fail("Should have failed");
            } catch (e: any) {
                assert.ok(e.message.includes("InsufficientBalance"));
            }
        });
    });

    describe("SPL Payments", () => {
        let splMerchantName = "SPLShop";
        let splMerchantPda: PublicKey;

        before(async () => {
            // Register SPL merchant - Extract PublicKey from tuple
            [splMerchantPda] = helper.getMerchantPda(merchantOwner.publicKey, splMerchantName);
            await program.methods
                .registerMerchant(merchantWallet.publicKey, mint, splMerchantName)
                .accountsStrict({
                    merchant: splMerchantPda,
                    owner: merchantOwner.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([merchantOwner])
                .rpc();
        });

        it("should process SPL payment successfully", async () => {
            const amount = new anchor.BN(100_000);
            const paymentId = new anchor.BN(Date.now() + 3);
            const [paymentPda] = helper.getPaymentPda(payer.publicKey, paymentId); // Extract PublicKey

            const merchantAcctBefore = await getAccount(provider.connection, merchantTokenAccount);
            const feeAcctBefore = await getAccount(provider.connection, feeTokenAccount);

            const fee = amount.mul(new anchor.BN(100)).div(new anchor.BN(10000));
            const merchantAmount = amount.sub(fee);

            await program.methods
                .processPayment(amount, paymentId, splMerchantName)
                .accountsStrict({
                    globalState: helper.globalStatePda,
                    merchant: splMerchantPda,
                    payer: payer.publicKey,
                    merchantWallet: merchantWallet.publicKey,
                    feeWallet: feeWallet.publicKey,
                    paymentHistory: paymentPda,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    mint: mint,
                    payerTokenAccount: payerTokenAccount,
                    merchantTokenAccount: merchantTokenAccount,
                    feeTokenAccount: feeTokenAccount,
                })
                .signers([payer])
                .rpc();

            const merchantAcctAfter = await getAccount(provider.connection, merchantTokenAccount);
            const feeAcctAfter = await getAccount(provider.connection, feeTokenAccount);

            assert.equal(
                merchantAcctAfter.amount.toString(),
                (BigInt(merchantAcctBefore.amount.toString()) + BigInt(merchantAmount.toString())).toString()
            );
            assert.equal(
                feeAcctAfter.amount.toString(),
                (BigInt(feeAcctBefore.amount.toString()) + BigInt(fee.toString())).toString()
            );
        });

        it("should fail if wrong token is used", async () => {
            const wrongMint = await helper.createTokenMint(payer);
            const wrongTokenAccount = await helper.createTokenAccount(wrongMint, payer.publicKey, payer);

            const amount = new anchor.BN(10_000);
            const paymentId = new anchor.BN(Date.now() + 4);
            const [paymentPda] = helper.getPaymentPda(payer.publicKey, paymentId); // Extract PublicKey

            try {
                await program.methods
                    .processPayment(amount, paymentId, splMerchantName)
                    .accountsStrict({
                        globalState: helper.globalStatePda,
                        merchant: splMerchantPda,
                        payer: payer.publicKey,
                        merchantWallet: merchantWallet.publicKey,
                        feeWallet: feeWallet.publicKey,
                        paymentHistory: paymentPda,
                        systemProgram: SystemProgram.programId,
                        tokenProgram: TOKEN_PROGRAM_ID,
                        mint: wrongMint,
                        payerTokenAccount: wrongTokenAccount,
                        merchantTokenAccount: merchantTokenAccount,
                        feeTokenAccount: feeTokenAccount,
                    })
                    .signers([payer])
                    .rpc();
                assert.fail("Should have failed");
            } catch (e: any) {
                assert.ok(e.message.includes("InvalidToken"));
            }
        });
    });
});