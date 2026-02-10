use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use crate::state::{GlobalState, Merchant, Payment};
use crate::events::PaymentProcessed;
use crate::errors::ErrorCode;

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
        space = 8 + Payment::INIT_SPACE, 
        seeds = [b"payment", payer.key().as_ref(), &payment_id.to_le_bytes()],
        bump
    )]
    pub payment_history: Account<'info, Payment>,

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
    let payment = &mut ctx.accounts.payment_history;
    payment.payer = ctx.accounts.payer.key();
    payment.merchant = ctx.accounts.merchant.key();
    payment.amount = amount;
    payment.payment_id = payment_id;
    payment.timestamp = Clock::get()?.unix_timestamp;
    payment.bump = ctx.bumps.payment_history;

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
