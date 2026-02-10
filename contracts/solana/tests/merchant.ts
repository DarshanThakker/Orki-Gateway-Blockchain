import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { OrkiGateway } from "../target/types/orki_gateway";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
import { TestHelper } from "./utils/helpers";

describe("Merchant Operations", () => {
    const testId = TestHelper.generateTestId("merchant");
    console.log(`Running merchant tests with ID: ${testId}`);

    anchor.setProvider(anchor.AnchorProvider.env());
    const program = anchor.workspace.OrkiGateway as Program<OrkiGateway>;
    const helper = new TestHelper(program, testId);
    const provider = anchor.getProvider();

    const admin = helper.getAdminKeypair(); // Use shared deterministic admin
    const merchantOwner = Keypair.generate();
    const merchantWallet = Keypair.generate();
    const merchantName = "TestShop";
    let merchantPda: PublicKey;

    before(async () => {
        // Setup test environment
        await helper.airdrop(admin.publicKey, 2 * LAMPORTS_PER_SOL);
        await helper.airdrop(merchantOwner.publicKey, 1 * LAMPORTS_PER_SOL);

        // Initialize global state - use helper.globalStatePda directly
        try {
            await program.methods
                .initialize(100, merchantWallet.publicKey)
                .accountsStrict({
                    globalState: helper.globalStatePda, // Use helper.globalStatePda
                    admin: admin.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([admin])
                .rpc();
        } catch (e: any) {
            if (!e.logs?.some((l: string) => l.includes("already in use")) && !e.toString().includes("already in use")) {
                throw e;
            }
        }
    });

    describe("Merchant Registration", () => {
        it("should register a new merchant with SOL settlement", async () => {
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

            const merchant = await program.account.merchant.fetch(merchantPda);

            assert.equal(merchant.name, merchantName);
            assert.ok(merchant.owner.equals(merchantOwner.publicKey));
            assert.ok(merchant.settlementWallet.equals(merchantWallet.publicKey));
            assert.ok(merchant.settlementToken.equals(PublicKey.default));
            assert.equal(merchant.swapEnabled, false);
        });

        it("should fail to register merchant with same name", async () => {
            try {
                await program.methods
                    .registerMerchant(merchantWallet.publicKey, PublicKey.default, merchantName)
                    .accountsStrict({
                        merchant: merchantPda,
                        owner: merchantOwner.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([merchantOwner])
                    .rpc();
                assert.fail("Should have failed");
            } catch (e: any) {
                assert.ok(e.message.includes("already in use"));
            }
        });

        it("should fail if merchant name is too long", async () => {
            const longName = "a".repeat(33); // Max is 32
            try {
                // Determine PDA manually or expect failure during derivation if using helper
                const [longMerchantPda] = helper.getMerchantPda(merchantOwner.publicKey, longName);

                await program.methods
                    .registerMerchant(merchantWallet.publicKey, PublicKey.default, longName)
                    .accountsStrict({
                        merchant: longMerchantPda,
                        owner: merchantOwner.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([merchantOwner])
                    .rpc();
                assert.fail("Should have failed");
            } catch (e: any) {
                // Client-side check for seed length happens before RPC
                if (e.message.includes("Max seed length exceeded")) {
                    assert.ok(true);
                } else {
                    // Fallback if somehow it reaches contract (unlikely for seeds)
                    assert.ok(e.message.includes("NameTooLong") || e.message.includes("ConstraintSeeds"));
                }
            }
        });
    });

    describe("Merchant Updates", () => {
        it("should update merchant settlement wallet", async () => {
            const newWallet = Keypair.generate().publicKey;

            await program.methods
                .updateMerchant(
                    merchantName,
                    null, // name not changed
                    newWallet,
                    null, // token not changed
                    null  // swap not changed
                )
                .accountsStrict({
                    merchant: merchantPda,
                    owner: merchantOwner.publicKey,
                })
                .signers([merchantOwner])
                .rpc();

            const merchant = await program.account.merchant.fetch(merchantPda);
            assert.ok(merchant.settlementWallet.equals(newWallet));
        });

        it("should update merchant name", async () => {
            const newName = "UpdatedShop";
            const [newMerchantPda] = helper.getMerchantPda(merchantOwner.publicKey, newName); // Extract PublicKey

            await program.methods
                .updateMerchant(
                    merchantName,
                    newName,
                    null,
                    null,
                    null
                )
                .accountsStrict({
                    merchant: merchantPda,
                    owner: merchantOwner.publicKey,
                })
                .signers([merchantOwner])
                .rpc();

            const merchant = await program.account.merchant.fetch(merchantPda);
            assert.equal(merchant.name, newName);
        });

        it("should fail if non-owner tries to update", async () => {
            const impostor = Keypair.generate();
            await helper.airdrop(impostor.publicKey);

            try {
                await program.methods
                    .updateMerchant(
                        merchantName,
                        null,
                        Keypair.generate().publicKey,
                        null,
                        null
                    )
                    .accountsStrict({
                        merchant: merchantPda,
                        owner: impostor.publicKey,
                    })
                    .signers([impostor])
                    .rpc();
                assert.fail("Should have failed");
            } catch (e: any) {
                // Since PDA is derived from owner, using a different owner triggers a seed constraint violation
                // before the has_one check can even run.
                assert.ok(e.message.includes("ConstraintSeeds") || e.message.includes("2006") || e.message.includes("has_one"));
            }
        });
    });
});
