use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("C9k2E4oE3SWB7wuCm5YwaLeYJg5DCqxBXFUDoDpzdDp9");

#[program]
pub mod orki_gateway {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>, 
        fee_bps: u16,
        fee_wallet: Pubkey
    ) -> Result<()> {
        require!(fee_bps <= 10000, ErrorCode::InvalidFee);
        let state = &mut ctx.accounts.global_state;
        state.admin = ctx.accounts.admin.key();
        state.fee_bps = fee_bps;
        state.fee_wallet = fee_wallet;
        state.paused = false;
        state.bump = ctx.bumps.global_state;
        Ok(())
    }

    
    pub fn register_merchant(
        ctx: Context<RegisterMerchant>,
        settlement_wallet: Pubkey,
        settlement_token: Pubkey,
        name: String, // We use this string as a seed now
    ) -> Result<()> {
        require!(name.len() <= 32, ErrorCode::NameTooLong);
        
        let merchant = &mut ctx.accounts.merchant;
        merchant.owner = ctx.accounts.owner.key();
        merchant.settlement_wallet = settlement_wallet;
        merchant.settlement_token = settlement_token;
        merchant.swap_enabled = false; 
        merchant.name = name;
        merchant.bump = ctx.bumps.merchant;
        Ok(())
    }


#[derive(Accounts)]
#[instruction(settlement_wallet: Pubkey, settlement_token: Pubkey, name: String)]
pub struct RegisterMerchant<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + Merchant::INIT_SPACE,
        // Added 'name' to the seeds to allow multiple profiles
        seeds = [b"merchant", owner.key().as_ref(), name.as_bytes()], 
        bump
    )]
    pub merchant: Account<'info, Merchant>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn update_merchant(
    ctx: Context<UpdateMerchant>,
    name: String,                  // PDA seed name (required)
    new_name: Option<String>,      // optional update
    settlement_wallet: Option<Pubkey>,
    settlement_token: Option<Pubkey>,
    swap_enabled: Option<bool>,
) -> Result<()> {
    let merchant = &mut ctx.accounts.merchant;

    if let Some(n) = new_name {
        merchant.name = n;
    }

    if let Some(wallet) = settlement_wallet {
        merchant.settlement_wallet = wallet;
    }

    if let Some(token) = settlement_token {
        merchant.settlement_token = token;
    }

    if let Some(enabled) = swap_enabled {
        merchant.swap_enabled = enabled;
    }

    Ok(())
}


    
    pub fn set_fee(ctx: Context<AdminAuth>, new_fee_bps: u16) -> Result<()> {
        require!(new_fee_bps <= 10000, ErrorCode::InvalidFee);
        let state = &mut ctx.accounts.global_state;
        state.fee_bps = new_fee_bps;
        Ok(())
    }

    pub fn set_fee_wallet(ctx: Context<AdminAuth>, new_fee_wallet: Pubkey) -> Result<()> {
        let state = &mut ctx.accounts.global_state;
        state.fee_wallet = new_fee_wallet;
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
        payment_id: u64,
        name: String,
    ) -> Result<()> {
        let state = &ctx.accounts.global_state;
        let merchant = &ctx.accounts.merchant;

        require!(!state.paused, ErrorCode::Paused);
        require!(amount > 0, ErrorCode::InvalidAmount);
        
        
        // Calculate Fee
        let fee = (amount as u128)
            .checked_mul(state.fee_bps as u128)
            .ok_or(ErrorCode::CalculationError)?
            .checked_div(10000)
            .ok_or(ErrorCode::CalculationError)? as u64;
        
        let merchant_amount = amount
            .checked_sub(fee)
            .ok_or(ErrorCode::CalculationError)?;

        // Check if using SPL tokens
        if ctx.accounts.token_program.is_some() {
            // --- SPL TOKEN PAYMENT ---
            
            // Get required accounts
            let token_program = ctx.accounts.token_program.as_ref().unwrap();
            let mint = ctx.accounts.mint.as_ref().ok_or(ErrorCode::MissingMint)?;
            let payer_ta = ctx.accounts.payer_token_account.as_ref().ok_or(ErrorCode::MissingAccount)?;
            let merchant_ta = ctx.accounts.merchant_token_account.as_ref().ok_or(ErrorCode::MissingAccount)?;
            let fee_ta = ctx.accounts.fee_token_account.as_ref().ok_or(ErrorCode::MissingAccount)?;

            // Validate mint matches merchant's settlement token
            if merchant.settlement_token != Pubkey::default() {
                require!(
                    mint.key() == merchant.settlement_token,
                    ErrorCode::InvalidToken
                );
            }

            // Validate token accounts
            require!(payer_ta.mint == mint.key(), ErrorCode::InvalidTokenAccount);
            require!(merchant_ta.mint == mint.key(), ErrorCode::InvalidTokenAccount);
            require!(fee_ta.mint == mint.key(), ErrorCode::InvalidTokenAccount);
            require!(payer_ta.owner == ctx.accounts.payer.key(), ErrorCode::InvalidTokenAccount);

            // Check payer has enough balance
            require!(payer_ta.amount >= amount, ErrorCode::InsufficientBalance);

            // Transfer Fee to Fee Vault
            token::transfer(
                CpiContext::new(
                    token_program.to_account_info(),
                    Transfer {
                        from: payer_ta.to_account_info(),
                        to: fee_ta.to_account_info(),
                        authority: ctx.accounts.payer.to_account_info(),
                    },
                ),
                fee,
            )?;

            // Transfer Amount to Merchant
            token::transfer(
                CpiContext::new(
                    token_program.to_account_info(),
                    Transfer {
                        from: payer_ta.to_account_info(),
                        to: merchant_ta.to_account_info(),
                        authority: ctx.accounts.payer.to_account_info(),
                    },
                ),
                merchant_amount,
            )?;

        } else {
            // --- NATIVE SOL PAYMENT ---
            
            // If merchant expects specific token but got SOL
            if merchant.settlement_token != Pubkey::default() && !merchant.swap_enabled {
                return Err(ErrorCode::InvalidToken.into());
            }

            // Validate merchant wallet
            require!(
                ctx.accounts.merchant_wallet.key() == merchant.settlement_wallet,
                ErrorCode::InvalidMerchantWallet
            );

            // Validate fee wallet
            require!(
                ctx.accounts.fee_wallet.key() == state.fee_wallet,
                ErrorCode::InvalidFeeWallet
            );

            // Check payer has enough SOL
            require!(ctx.accounts.payer.lamports() >= amount, ErrorCode::InsufficientBalance);

            // Transfer Fee
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

            // Transfer Merchant Amount
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

        // Mark payment as processed
        {
            let mut data = ctx.accounts.payment_history.data.borrow_mut();
            data[0] = 1;
        }

        emit!(PaymentProcessed {
            payer: ctx.accounts.payer.key(),
            merchant: merchant.key(),
            amount,
            fee,
            token: ctx.accounts.mint.as_ref().map(|m| m.key()).unwrap_or(Pubkey::default()),
            payment_id,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }


#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + GlobalState::INIT_SPACE,
        seeds = [b"global_state"],
        bump
    )]
    pub global_state: Account<'info, GlobalState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
#[instruction(name: String)]
pub struct UpdateMerchant<'info> {
    #[account(
        mut,
        has_one = owner,
        seeds = [b"merchant", owner.key().as_ref(), name.as_bytes()],
        bump = merchant.bump
    )]
    pub merchant: Account<'info, Merchant>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminAuth<'info> {
    #[account(
        mut,
        seeds = [b"global_state"],
        bump = global_state.bump,
        constraint = global_state.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub global_state: Account<'info, GlobalState>,
    pub admin: Signer<'info>,
}


#[derive(Accounts)]
// We add 'name' here so we can use it in the seeds constraint for the merchant account
#[instruction(amount: u64, payment_id: u64, name: String)] 
pub struct ProcessPayment<'info> {
    #[account(
        seeds = [b"global_state"],
        bump = global_state.bump
    )]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(
        mut,
        // The PDA is now derived using the owner and the specific shop name
        seeds = [b"merchant", merchant.owner.as_ref(), name.as_bytes()],
        bump = merchant.bump
    )]
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

    #[account(
        init,
        payer = payer,
        // Using 8 (discriminator) + 1 (status byte) is safer for future upgrades
        space = 8 + 1, 
        seeds = [b"payment", payer.key().as_ref(), &payment_id.to_le_bytes()],
        bump
    )]
    /// CHECK: Payment history account to prevent duplicate payments
    pub payment_history: AccountInfo<'info>,

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


#[account]
#[derive(InitSpace)]
pub struct GlobalState {
    pub admin: Pubkey,
    pub fee_bps: u16,
    pub fee_wallet: Pubkey,
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Merchant {
    pub owner: Pubkey,
    pub settlement_wallet: Pubkey,
    pub settlement_token: Pubkey,
    pub swap_enabled: bool,
    #[max_len(32)]
    pub name: String,
    pub bump: u8,
}

#[event]
pub struct PaymentProcessed {
    pub payer: Pubkey,
    pub merchant: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub token: Pubkey,
    pub payment_id: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Contract is paused")]
    Paused,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid token for this merchant")]
    InvalidToken,
    #[msg("Invalid fee amount (must be 0-10000)")]
    InvalidFee,
    #[msg("Missing mint account")]
    MissingMint,
    #[msg("Missing necessary account")]
    MissingAccount,
    #[msg("Invalid merchant wallet provided")]
    InvalidMerchantWallet,
    #[msg("Invalid fee wallet provided")]
    InvalidFeeWallet,
    #[msg("Invalid token account")]
    InvalidTokenAccount,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Calculation error")]
    CalculationError,
    #[msg("Merchant name too long")]
    NameTooLong,
    #[msg("Duplicate payment detected")]
    DuplicatePayment,
}
}