// // // // // tests/utils/helpers.ts
// // // // import * as anchor from "@coral-xyz/anchor";
// // // // import { Program } from "@coral-xyz/anchor";
// // // // import { OrkiGateway } from "../../target/types/orki_gateway";
// // // // import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";

// // // // import { createMint, createAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";

// // // // export class TestHelper {
// // // //   program: Program<OrkiGateway>;
// // // //   provider: anchor.AnchorProvider;

// // // //   constructor(program: Program<OrkiGateway>) {
// // // //     this.program = program;
// // // //     this.provider = anchor.getProvider() as anchor.AnchorProvider;
// // // //   }

// // // //   async airdrop(to: PublicKey, amount = 1 * LAMPORTS_PER_SOL) {
// // // //     const latestBlockHash = await this.provider.connection.getLatestBlockhash();
// // // //     const sig = await this.provider.connection.requestAirdrop(to, amount);
// // // //     await this.provider.connection.confirmTransaction({
// // // //       blockhash: latestBlockHash.blockhash,
// // // //       lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
// // // //       signature: sig
// // // //     });
// // // //   }

// // // //   async getGlobalStatePda(): Promise<PublicKey> {
// // // //     const [pda] = PublicKey.findProgramAddressSync(
// // // //       [Buffer.from("global_state")],
// // // //       this.program.programId
// // // //     );
// // // //     return pda;
// // // //   }

// // // //   getMerchantPda(owner: PublicKey, name: string): PublicKey {
// // // //     const [pda] = PublicKey.findProgramAddressSync(
// // // //       [Buffer.from("merchant"), owner.toBuffer(), Buffer.from(name)],
// // // //       this.program.programId
// // // //     );
// // // //     return pda;
// // // //   }

// // // //   getPaymentPda(payer: PublicKey, paymentId: anchor.BN): PublicKey {
// // // //     const [pda] = PublicKey.findProgramAddressSync(
// // // //       [Buffer.from("payment"), payer.toBuffer(), paymentId.toArrayLike(Buffer, "le", 8)],
// // // //       this.program.programId
// // // //     );
// // // //     return pda;
// // // //   }

// // // //   async createTokenMint(admin: Keypair, decimals = 6): Promise<PublicKey> {
// // // //     return await createMint(
// // // //       this.provider.connection,
// // // //       admin,
// // // //       admin.publicKey,
// // // //       null,
// // // //       decimals
// // // //     );
// // // //   }

// // // //   async createTokenAccount(
// // // //     mint: PublicKey,
// // // //     owner: PublicKey,
// // // //     payer: Keypair
// // // //   ): Promise<PublicKey> {
// // // //     return await createAssociatedTokenAccount(
// // // //       this.provider.connection,
// // // //       payer,
// // // //       mint,
// // // //       owner
// // // //     );
// // // //   }

// // // //   async mintTokens(
// // // //     mint: PublicKey,
// // // //     to: PublicKey,
// // // //     amount: number,
// // // //     payer: Keypair
// // // //   ) {
// // // //     await mintTo(
// // // //       this.provider.connection,
// // // //       payer,
// // // //       mint,
// // // //       to,
// // // //       payer,
// // // //       amount
// // // //     );
// // // //   }
// // // // }


// // // // tests/utils/helpers.ts - UPDATED
// // // import * as anchor from "@coral-xyz/anchor";
// // // import { Program } from "@coral-xyz/anchor";
// // // import { OrkiGateway } from "../../target/types/orki_gateway";
// // // import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
// // // import { createMint, createAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";

// // // export class TestHelper {
// // //   program: Program<OrkiGateway>;
// // //   provider: anchor.AnchorProvider;
// // //   testId: string;
  
// // //   // Store PDAs for easy access
// // //   globalStatePda: PublicKey; // SHARED across all tests
// // //   globalStateBump: number;

// // //   constructor(program: Program<OrkiGateway>, testId: string = "") {
// // //     this.program = program;
// // //     this.provider = anchor.getProvider() as anchor.AnchorProvider;
// // //     this.testId = testId || TestHelper.generateTestId();
    
// // //     // IMPORTANT: Global state uses ORIGINAL seeds (no testId)
// // //     [this.globalStatePda, this.globalStateBump] = PublicKey.findProgramAddressSync(
// // //       [Buffer.from("global_state")], // NO testId here!
// // //       this.program.programId
// // //     );
// // //   }

// // //   async airdrop(to: PublicKey, amount = 1 * LAMPORTS_PER_SOL) {
// // //     const latestBlockHash = await this.provider.connection.getLatestBlockhash();
// // //     const sig = await this.provider.connection.requestAirdrop(to, amount);
// // //     await this.provider.connection.confirmTransaction({
// // //       blockhash: latestBlockHash.blockhash,
// // //       lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
// // //       signature: sig
// // //     });
// // //   }

// // //   async getGlobalState(): Promise<[PublicKey, number]> {
// // //     return [this.globalStatePda, this.globalStateBump];
// // //   }

// // //   getMerchantPda(owner: PublicKey, name: string): [PublicKey, number] {
// // //     // Merchants use testId for isolation
// // //     return PublicKey.findProgramAddressSync(
// // //       [
// // //         Buffer.from("merchant"), 
// // //         owner.toBuffer(), 
// // //         Buffer.from(name),
// // //         Buffer.from(this.testId) // testId here for isolation
// // //       ],
// // //       this.program.programId
// // //     );
// // //   }

// // //   getPaymentPda(payer: PublicKey, paymentId: anchor.BN): [PublicKey, number] {
// // //     // Payments use testId for isolation
// // //     return PublicKey.findProgramAddressSync(
// // //       [
// // //         Buffer.from("payment"), 
// // //         payer.toBuffer(), 
// // //         paymentId.toArrayLike(Buffer, "le", 8),
// // //         Buffer.from(this.testId) // testId here for isolation
// // //       ],
// // //       this.program.programId
// // //     );
// // //   }
// // //   async createTokenMint(admin: Keypair, decimals = 6): Promise<PublicKey> {
// // //     return await createMint(
// // //       this.provider.connection,
// // //       admin,
// // //       admin.publicKey,
// // //       null,
// // //       decimals
// // //     );
// // //   }

// // //   async createTokenAccount(
// // //     mint: PublicKey,
// // //     owner: PublicKey,
// // //     payer: Keypair
// // //   ): Promise<PublicKey> {
// // //     return await createAssociatedTokenAccount(
// // //       this.provider.connection,
// // //       payer,
// // //       mint,
// // //       owner
// // //     );
// // //   }

// // //   async mintTokens(
// // //     mint: PublicKey,
// // //     to: PublicKey,
// // //     amount: number,
// // //     payer: Keypair
// // //   ) {
// // //     await mintTo(
// // //       this.provider.connection,
// // //       payer,
// // //       mint,
// // //       to,
// // //       payer,
// // //       amount
// // //     );
// // //   }

// // //   // Helper to generate SHORT unique test ID
// // //   static generateTestId(suiteName: string): string {
// // //     // Keep it short! Max 32 characters total
// // //     const timestamp = Date.now().toString(36); // Base36 is shorter
// // //     const random = Math.random().toString(36).substr(2, 8);
    
// // //     // Shorten suite name to 4 chars
// // //     const shortSuite = suiteName.substring(0, 4).toLowerCase();
    
// // //     // Format: s4_t8_r8 (4 + 1 + 8 + 1 + 8 = 22 chars max)
// // //     return `${shortSuite}_${timestamp}_${random}`;
// // //   }
  
// // //   // Even shorter version for PDAs
// // //   static generateShortTestId(): string {
// // //     // Just timestamp + random, no suite name
// // //     const timestamp = Date.now().toString(36);
// // //     const random = Math.random().toString(36).substr(2, 6);
// // //     return `${timestamp}_${random}`; // ~15 chars
// // //   }
// // // }


// // // tests/utils/helpers.ts
// // import * as anchor from "@coral-xyz/anchor";
// // import { Program } from "@coral-xyz/anchor";
// // import { OrkiGateway } from "../../target/types/orki_gateway";
// // import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
// // import { createMint, createAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";

// // export class TestHelper {
// //   program: Program<OrkiGateway>;
// //   provider: anchor.AnchorProvider;
// //   testId: string;
  
// //   // Store PDAs for easy access
// //   globalStatePda: PublicKey; // SHARED across all tests
// //   globalStateBump: number;

// //   constructor(program: Program<OrkiGateway>, testId: string = "") {
// //     this.program = program;
// //     this.provider = anchor.getProvider() as anchor.AnchorProvider;
    
// //     // Use provided testId or generate one
// //     this.testId = testId || TestHelper.generateTestId(); // Now works with optional param
    
// //     // IMPORTANT: Global state uses ORIGINAL seeds (no testId)
// //     [this.globalStatePda, this.globalStateBump] = PublicKey.findProgramAddressSync(
// //       [Buffer.from("global_state")], // NO testId here!
// //       this.program.programId
// //     );
// //   }

// //   async airdrop(to: PublicKey, amount = 1 * LAMPORTS_PER_SOL) {
// //     const latestBlockHash = await this.provider.connection.getLatestBlockhash();
// //     const sig = await this.provider.connection.requestAirdrop(to, amount);
// //     await this.provider.connection.confirmTransaction({
// //       blockhash: latestBlockHash.blockhash,
// //       lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
// //       signature: sig
// //     });
// //   }

// //   async getGlobalState(): Promise<[PublicKey, number]> {
// //     return [this.globalStatePda, this.globalStateBump];
// //   }

// //   getMerchantPda(owner: PublicKey, name: string): [PublicKey, number] {
// //     // Merchants use testId for isolation
// //     return PublicKey.findProgramAddressSync(
// //       [
// //         Buffer.from("merchant"), 
// //         owner.toBuffer(), 
// //         Buffer.from(name),
// //         Buffer.from(this.testId) // testId here for isolation
// //       ],
// //       this.program.programId
// //     );
// //   }

// //   getPaymentPda(payer: PublicKey, paymentId: anchor.BN): [PublicKey, number] {
// //     // Payments use testId for isolation
// //     return PublicKey.findProgramAddressSync(
// //       [
// //         Buffer.from("payment"), 
// //         payer.toBuffer(), 
// //         paymentId.toArrayLike(Buffer, "le", 8),
// //         Buffer.from(this.testId) // testId here for isolation
// //       ],
// //       this.program.programId
// //     );
// //   }

// //   async createTokenMint(admin: Keypair, decimals = 6): Promise<PublicKey> {
// //     return await createMint(
// //       this.provider.connection,
// //       admin,
// //       admin.publicKey,
// //       null,
// //       decimals
// //     );
// //   }

// //   async createTokenAccount(
// //     mint: PublicKey,
// //     owner: PublicKey,
// //     payer: Keypair
// //   ): Promise<PublicKey> {
// //     return await createAssociatedTokenAccount(
// //       this.provider.connection,
// //       payer,
// //       mint,
// //       owner
// //     );
// //   }

// //   async mintTokens(
// //     mint: PublicKey,
// //     to: PublicKey,
// //     amount: number,
// //     payer: Keypair
// //   ) {
// //     await mintTo(
// //       this.provider.connection,
// //       payer,
// //       mint,
// //       to,
// //       payer,
// //       amount
// //     );
// //   }

// //   // Helper to generate unique test ID with optional suite name
// //   static generateTestId(suiteName: string = "test"): string { // Default parameter
// //     const timestamp = Date.now().toString(36);
// //     const random = Math.random().toString(36).substr(2, 8);
// //     const shortSuite = suiteName.substring(0, 4).toLowerCase();
// //     return `${shortSuite}_${timestamp}_${random}`;
// //   }
// // }

// import * as anchor from "@coral-xyz/anchor";
// import { Program } from "@coral-xyz/anchor";
// import { OrkiGateway } from "../../target/types/orki_gateway";
// import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
// import { createMint, createAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";

// export class TestHelper {
//     program: Program<OrkiGateway>;
//     provider: anchor.AnchorProvider;
//     testId: string;

//     // Store PDAs for easy access
//     globalStatePda: PublicKey; // SHARED across all tests
//     globalStateBump: number;

//     constructor(program: Program<OrkiGateway>, testId: string = "") {
//         this.program = program;
//         this.provider = anchor.getProvider() as anchor.AnchorProvider;

//         // Use provided testId or generate one
//         this.testId = testId || TestHelper.generateTestId(); // Now works with optional param

//         // IMPORTANT: Global state uses ORIGINAL seeds (no testId)
//         [this.globalStatePda, this.globalStateBump] = PublicKey.findProgramAddressSync(
//             [Buffer.from("global_state")], // NO testId here!
//             this.program.programId
//         );
//     }

//     async airdrop(to: PublicKey, amount = 1 * LAMPORTS_PER_SOL) {
//         const latestBlockHash = await this.provider.connection.getLatestBlockhash();
//         const sig = await this.provider.connection.requestAirdrop(to, amount);
//         await this.provider.connection.confirmTransaction({
//             blockhash: latestBlockHash.blockhash,
//             lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
//             signature: sig
//         });
//     }

//     async getGlobalState(): Promise<[PublicKey, number]> {
//         return [this.globalStatePda, this.globalStateBump];
//     }

//     getMerchantPda(owner: PublicKey, name: string): [PublicKey, number] {
//         // Merchants use testId for isolation
//         return PublicKey.findProgramAddressSync(
//             [
//                 Buffer.from("merchant"),
//                 owner.toBuffer(),
//                 Buffer.from(name),
//                 Buffer.from(this.testId) // testId here for isolation
//             ],
//             this.program.programId
//         );
//     }

//     getPaymentPda(payer: PublicKey, paymentId: anchor.BN): [PublicKey, number] {
//         // Payments use testId for isolation
//         return PublicKey.findProgramAddressSync(
//             [
//                 Buffer.from("payment"),
//                 payer.toBuffer(),
//                 paymentId.toArrayLike(Buffer, "le", 8),
//                 Buffer.from(this.testId) // testId here for isolation
//             ],
//             this.program.programId
//         );
//     }

//     async createTokenMint(admin: Keypair, decimals = 6): Promise<PublicKey> {
//         return await createMint(
//             this.provider.connection,
//             admin,
//             admin.publicKey,
//             null,
//             decimals
//         );
//     }

//     async createTokenAccount(
//         mint: PublicKey,
//         owner: PublicKey,
//         payer: Keypair
//     ): Promise<PublicKey> {
//         return await createAssociatedTokenAccount(
//             this.provider.connection,
//             payer,
//             mint,
//             owner
//         );
//     }

//     async mintTokens(
//         mint: PublicKey,
//         to: PublicKey,
//         amount: number,
//         payer: Keypair
//     ) {
//         await mintTo(
//             this.provider.connection,
//             payer,
//             mint,
//             to,
//             payer,
//             amount
//         );
//     }

//     // Helper to generate unique test ID with optional suite name
//     static generateTestId(suiteName: string = "test"): string { // Default parameter
//         const timestamp = Date.now().toString(36);
//         const random = Math.random().toString(36).substr(2, 8);
//         const shortSuite = suiteName.substring(0, 4).toLowerCase();
//         return `${shortSuite}_${timestamp}_${random}`;
//     }

//     // Deterministic Admin Keypair for Singleton GlobalState
//     getAdminKeypair(): Keypair {
//         // Use a fixed seed for inconsistent test runs against persistent validator
//         const seed = Uint8Array.from([
//             1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
//             1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16
//         ]);
//         return Keypair.fromSeed(seed);
//     }
// }


import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { OrkiGateway } from "../../target/types/orki_gateway";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createMint, createAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";

export class TestHelper {
    program: Program<OrkiGateway>;
    provider: anchor.AnchorProvider;
    testId: string;

    // Store PDAs for easy access
    globalStatePda: PublicKey; // SHARED across all tests
    globalStateBump: number;

    constructor(program: Program<OrkiGateway>, testId: string = "") {
        this.program = program;
        this.provider = anchor.getProvider() as anchor.AnchorProvider;

        // Use provided testId or generate one
        this.testId = testId || TestHelper.generateTestId(); // Now works with optional param

        // IMPORTANT: Global state uses ORIGINAL seeds (no testId)
        [this.globalStatePda, this.globalStateBump] = PublicKey.findProgramAddressSync(
            [Buffer.from("global_state")], // NO testId here!
            this.program.programId
        );
    }

    async airdrop(to: PublicKey, amount = 1 * LAMPORTS_PER_SOL) {
        const latestBlockHash = await this.provider.connection.getLatestBlockhash();
        const sig = await this.provider.connection.requestAirdrop(to, amount);
        await this.provider.connection.confirmTransaction({
            blockhash: latestBlockHash.blockhash,
            lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
            signature: sig
        });
    }

    async getGlobalState(): Promise<[PublicKey, number]> {
        return [this.globalStatePda, this.globalStateBump];
    }

    getMerchantPda(owner: PublicKey, name: string): [PublicKey, number] {
        return PublicKey.findProgramAddressSync(
            [
                Buffer.from("merchant"),
                owner.toBuffer(),
                Buffer.from(name)
            ],
            this.program.programId
        );
    }

    getPaymentPda(payer: PublicKey, paymentId: anchor.BN): [PublicKey, number] {
        return PublicKey.findProgramAddressSync(
            [
                Buffer.from("payment"),
                payer.toBuffer(),
                paymentId.toArrayLike(Buffer, "le", 8)
            ],
            this.program.programId
        );
    }

    async createTokenMint(admin: Keypair, decimals = 6): Promise<PublicKey> {
        return await createMint(
            this.provider.connection,
            admin,
            admin.publicKey,
            null,
            decimals
        );
    }

    async createTokenAccount(
        mint: PublicKey,
        owner: PublicKey,
        payer: Keypair
    ): Promise<PublicKey> {
        return await createAssociatedTokenAccount(
            this.provider.connection,
            payer,
            mint,
            owner
        );
    }

    async mintTokens(
        mint: PublicKey,
        to: PublicKey,
        amount: number,
        payer: Keypair
    ) {
        await mintTo(
            this.provider.connection,
            payer,
            mint,
            to,
            payer,
            amount
        );
    }

    // Helper to generate unique test ID with optional suite name
    static generateTestId(suiteName: string = "test"): string { // Default parameter
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 8);
        const shortSuite = suiteName.substring(0, 4).toLowerCase();
        return `${shortSuite}_${timestamp}_${random}`;
    }

    // Deterministic Admin Keypair for Singleton GlobalState
    getAdminKeypair(): Keypair {
        // Use a fixed seed for inconsistent test runs against persistent validator
        const seed = Uint8Array.from([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16
        ]);
        return Keypair.fromSeed(seed);
    }
}