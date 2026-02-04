use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("C9k2E4oE3SWB7wuCm5YwaLeYJg5DCqxBXFUDoDpzdDp9");

#[program]
pub mod orki_gateway {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, fee_bps: u16) -> Result<()> {
        let state = &mut ctx.accounts.global_state;
        state.admin = ctx.accounts.admin.key();
        state.fee_bps = fee_bps;
        state.paused = false;
        Ok(())
    }

    pub fn register_merchant(
        ctx: Context<RegisterMerchant>,
        settlement_wallet: Pubkey,
        settlement_token: Pubkey,
    ) -> Result<()> {
        let merchant = &mut ctx.accounts.merchant;
        merchant.owner = ctx.accounts.owner.key();
        merchant.settlement_wallet = settlement_wallet;
        merchant.settlement_token = settlement_token;
        merchant.swap_enabled = false;
        Ok(())
    }

    pub fn update_merchant(
        ctx: Context<UpdateMerchant>,
        settlement_wallet: Pubkey,
        settlement_token: Pubkey,
        swap_enabled: bool
    ) -> Result<()> {
        let merchant = &mut ctx.accounts.merchant;
        // Verify owner
        require!(merchant.owner == ctx.accounts.owner.key(), ErrorCode::Unauthorized);
        
        merchant.settlement_wallet = settlement_wallet;
        merchant.settlement_token = settlement_token;
        merchant.swap_enabled = swap_enabled;
        Ok(())
    }

    // Admin functions
    pub fn set_fee(ctx: Context<AdminAuth>, new_fee_bps: u16) -> Result<()> {
        let state = &mut ctx.accounts.global_state;
        state.fee_bps = new_fee_bps;
        Ok(())
    }

    pub fn set_paused(ctx: Context<AdminAuth>, paused: bool) -> Result<()> {
        let state = &mut ctx.accounts.global_state;
        state.paused = paused;
        Ok(())
    }

    pub fn update_admin(ctx: Context<AdminAuth>, new_admin: Pubkey) -> Result<()> {
        let state = &mut ctx.accounts.global_state;
        state.admin = new_admin;
        Ok(())
    }

    pub fn process_payment(
        ctx: Context<ProcessPayment>,
        amount: u64,
    ) -> Result<()> {
        let state = &ctx.accounts.global_state;
        let merchant = &ctx.accounts.merchant;

        require!(!state.paused, ErrorCode::Paused);

        // Calculate Fee
        let fee = amount * state.fee_bps as u64 / 10_000;
        let merchant_amount = amount - fee;

        if let Some(mint) = &ctx.accounts.mint {
            // --- SPL TOKEN PAYMENT ---
            
            // 1. Validation
            // Ensure merchant accepts this token (or if not set, they accept SOL, so fail if they expect SOL but got Token)
            // User req: "Enforce: if merchant.settlement_token is set, mint must match"
            if merchant.settlement_token != Pubkey::default() {
                 require!(mint.key() == merchant.settlement_token, ErrorCode::InvalidToken);
            } else {
                 // Merchant expects SOL (settlement_token is default), but we got Token
                 // For V1, no swap, so we must error if mismatch
                 return Err(ErrorCode::InvalidToken.into());
            }

            let token_program = ctx.accounts.token_program.as_ref().ok_or(ErrorCode::MissingTokenProgram)?;
            let payer_ta = ctx.accounts.payer_token_account.as_ref().ok_or(ErrorCode::MissingAccount)?;
            let merchant_ta = ctx.accounts.merchant_token_account.as_ref().ok_or(ErrorCode::MissingAccount)?;
            let fee_ta = ctx.accounts.fee_token_account.as_ref().ok_or(ErrorCode::MissingAccount)?;

            // 2. Transfer Fee to Fee Vault
            let cpi_accounts_fee = Transfer {
                from: payer_ta.to_account_info(),
                to: fee_ta.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            };
            token::transfer(CpiContext::new(token_program.to_account_info(), cpi_accounts_fee), fee)?;

            // 3. Transfer Amount to Merchant
            let cpi_accounts_merchant = Transfer {
                from: payer_ta.to_account_info(),
                to: merchant_ta.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            };
            token::transfer(CpiContext::new(token_program.to_account_info(), cpi_accounts_merchant), merchant_amount)?;

        } else {
            // --- NATIVE SOL PAYMENT ---
            
            // 1. Validation
            // If merchant expects Token, but got SOL
            if merchant.settlement_token != Pubkey::default() {
                return Err(ErrorCode::InvalidToken.into());
            }

            // Ensure passed wallets match expected
            require!(ctx.accounts.merchant_wallet.key() == merchant.settlement_wallet, ErrorCode::InvalidMerchantWallet);
            
            // 2. Transfer Fee
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.payer.to_account_info(),
                        to: ctx.accounts.fee_wallet.to_account_info(),
                    },
                ),
                fee,
            )?;

            // 3. Transfer Merchant Amount
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.payer.to_account_info(),
                        to: ctx.accounts.merchant_wallet.to_account_info(),
                    },
                ),
                merchant_amount,
            )?;
        }

        emit!(PaymentProcessed {
            payer: ctx.accounts.payer.key(),
            merchant: ctx.accounts.merchant.key(),
            amount,
            fee,
            token: ctx.accounts.mint.as_ref().map(|m| m.key()).unwrap_or(Pubkey::default()),
        });

        Ok(())
    }
}

#[account]
pub struct GlobalState {
    pub admin: Pubkey,
    pub fee_bps: u16,
    pub paused: bool,
}

#[account]
pub struct Merchant {
    pub owner: Pubkey,
    pub settlement_wallet: Pubkey,
    pub settlement_token: Pubkey,
    pub swap_enabled: bool,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32 + 2 + 1)]
    pub global_state: Account<'info, GlobalState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterMerchant<'info> {
    #[account(init, payer = owner, space = 8 + 32 + 32 + 32 + 1)]
    pub merchant: Account<'info, Merchant>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateMerchant<'info> {
    #[account(mut)]
    pub merchant: Account<'info, Merchant>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminAuth<'info> {
    #[account(mut, has_one = admin)]
    pub global_state: Account<'info, GlobalState>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct ProcessPayment<'info> {
    pub global_state: Account<'info, GlobalState>,
    pub merchant: Account<'info, Merchant>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    
    /// CHECK: Merchant wallet to receive funds (For SOL payment)
    #[account(mut)]
    pub merchant_wallet: AccountInfo<'info>,
    
    /// CHECK: Fee wallet to receive fees (For SOL payment)
    #[account(mut)]
    pub fee_wallet: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,

    // --- Optional Accounts for SPL ---
    pub token_program: Option<Program<'info, Token>>,
    pub mint: Option<Account<'info, Mint>>,
    #[account(mut)]
    pub payer_token_account: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub merchant_token_account: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub fee_token_account: Option<Account<'info, TokenAccount>>,
}

#[event]
pub struct PaymentProcessed {
    pub payer: Pubkey,
    pub merchant: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub token: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Contract is paused")]
    Paused,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid token for this merchant")]
    InvalidToken,
    #[msg("Missing token program")]
    MissingTokenProgram,
    #[msg("Missing necessary account")]
    MissingAccount,
    #[msg("Invalid merchant wallet provided")]
    InvalidMerchantWallet,
}