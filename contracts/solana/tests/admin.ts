import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { OrkiGateway } from "../target/types/orki_gateway";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import { TestHelper } from "./utils/helpers";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

describe("Admin Operations", () => {
    const testId = TestHelper.generateTestId("admin");
    console.log(`Running admin tests with ID: ${testId}`);

    anchor.setProvider(anchor.AnchorProvider.env());
    const program = anchor.workspace.OrkiGateway as Program<OrkiGateway>;
    const helper = new TestHelper(program, testId);

    const admin = helper.getAdminKeypair(); // Use shared deterministic admin
    const newAdmin = Keypair.generate();
    const feeWallet = Keypair.generate();
    const newFeeWallet = Keypair.generate();

    before(async () => {
        await helper.airdrop(admin.publicKey, 2 * LAMPORTS_PER_SOL);
        await helper.airdrop(newAdmin.publicKey);
        await helper.airdrop(feeWallet.publicKey);
        await helper.airdrop(newFeeWallet.publicKey);

        // Initialize global state
        const [globalStatePda] = await helper.getGlobalState();
        try {
            await program.methods
                .initialize(100, feeWallet.publicKey)
                .accountsStrict({
                    globalState: globalStatePda,
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

    describe("Fee Management", () => {
        it("should update fee basis points", async () => {
            const [globalStatePda] = await helper.getGlobalState();
            const newFeeBps = 200; // 2%

            await program.methods
                .setFee(newFeeBps)
                .accountsStrict({
                    globalState: helper.globalStatePda,
                    admin: admin.publicKey,
                })
                .signers([admin])
                .rpc();

            const state = await program.account.globalState.fetch(globalStatePda);
            assert.equal(state.feeBps, newFeeBps);
        });
        it("should fail if non-admin tries to update fee", async () => {
            const impostor = Keypair.generate();
            await helper.airdrop(impostor.publicKey);

            try {
                await program.methods
                    .setFee(300)
                    .accountsStrict({
                        globalState: helper.globalStatePda,
                        admin: impostor.publicKey,
                    })
                    .signers([impostor])
                    .rpc();
                assert.fail("Should have failed");
            } catch (e: any) {
                assert.ok(e.message.includes("Unauthorized"));
            }
        });

        it("should fail if fee exceeds 10000 bps", async () => {
            try {
                await program.methods
                    .setFee(10001)
                    .accountsStrict({
                        globalState: helper.globalStatePda,
                        admin: admin.publicKey,
                    })
                    .signers([admin])
                    .rpc();
                assert.fail("Should have failed");
            } catch (e: any) {
                assert.ok(e.message.includes("InvalidFee"));
            }
        });
    });

    describe("Wallet Management", () => {
        it("should update fee wallet", async () => {
            await program.methods
                .setFeeWallet(newFeeWallet.publicKey)
                .accountsStrict({
                    globalState: helper.globalStatePda,
                    admin: admin.publicKey,
                })
                .signers([admin])
                .rpc();

            const state = await program.account.globalState.fetch(helper.globalStatePda);
            assert.ok(state.feeWallet.equals(newFeeWallet.publicKey));
        });
    });

    describe("Pause Management", () => {
        it("should pause the contract", async () => {
            await program.methods
                .setPaused(true)
                .accountsStrict({
                    globalState: helper.globalStatePda,
                    admin: admin.publicKey,
                })
                .signers([admin])
                .rpc();

            const state = await program.account.globalState.fetch(helper.globalStatePda);
            assert.equal(state.paused, true);
        });

        it("should unpause the contract", async () => {
            await program.methods
                .setPaused(false)
                .accountsStrict({
                    globalState: helper.globalStatePda,
                    admin: admin.publicKey,
                })
                .signers([admin])
                .rpc();

            const state = await program.account.globalState.fetch(helper.globalStatePda);
            assert.equal(state.paused, false);
        });
    });

    describe("Admin Management", () => {
        it("should transfer admin rights", async () => {
            await program.methods
                .updateAdmin(newAdmin.publicKey)
                .accountsStrict({
                    globalState: helper.globalStatePda,
                    admin: admin.publicKey,
                })
                .signers([admin])
                .rpc();

            const state = await program.account.globalState.fetch(helper.globalStatePda);
            assert.ok(state.admin.equals(newAdmin.publicKey));
        });

        it("new admin should be able to perform admin actions", async () => {
            await program.methods
                .setFee(150)
                .accountsStrict({
                    globalState: helper.globalStatePda,
                    admin: newAdmin.publicKey,
                })
                .signers([newAdmin])
                .rpc();

            const state = await program.account.globalState.fetch(helper.globalStatePda);
            assert.equal(state.feeBps, 150);
        });

        it("old admin should no longer have rights", async () => {
            try {
                await program.methods
                    .setFee(250)
                    .accountsStrict({
                        globalState: helper.globalStatePda,
                        admin: admin.publicKey,
                    })
                    .signers([admin])
                    .rpc();
                assert.fail("Should have failed");
            } catch (e: any) {
                assert.ok(e.message.includes("Unauthorized"));
            }
        });

        // CRITICAL: Restore admin rights to the shared Admin keypair so other tests can run
        after(async () => {
            console.log("Restoring admin rights to shared Admin...");
            await program.methods
                .updateAdmin(admin.publicKey)
                .accountsStrict({
                    globalState: helper.globalStatePda,
                    admin: newAdmin.publicKey,
                })
                .signers([newAdmin])
                .rpc();

            const state = await program.account.globalState.fetch(helper.globalStatePda);
            assert.ok(state.admin.equals(admin.publicKey), "Admin restoration failed");
        });
    });
});