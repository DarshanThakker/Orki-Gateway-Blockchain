use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkgPoxhZxvSMP");

#[program]
pub mod orki_gateway {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.admin = ctx.accounts.admin.key();
        state.paused = false;
        state.fee_bps = 100; // 1% default fee
        state.treasury = ctx.accounts.admin.key(); // Default treasury is admin
        Ok(())
    }

    pub fn register_merchant(ctx: Context<RegisterMerchant>, name: String, wallet: Pubkey) -> Result<()> {
        // Check that the admin is calling this
        require!(
            ctx.accounts.admin.key() == ctx.accounts.state.admin,
            GatewayError::Unauthorized
        );
        
        let merchant = &mut ctx.accounts.merchant;
        merchant.name = name;
        merchant.wallet = wallet;
        merchant.active = true;
        Ok(())
    }

    pub fn set_pause(ctx: Context<SetPause>, pause: bool) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.state.admin,
            GatewayError::Unauthorized
        );
        
        ctx.accounts.state.paused = pause;
        Ok(())
    }

    pub fn update_fees(ctx: Context<UpdateFees>, fee_bps: u16) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.state.admin,
            GatewayError::Unauthorized
        );
        
        require!(fee_bps <= 10000, GatewayError::InvalidFee); // Max 100% fee
        ctx.accounts.state.fee_bps = fee_bps;
        Ok(())
    }

    pub fn process_payment(
        ctx: Context<ProcessPayment>, 
        amount: u64
    ) -> Result<()> {
        // Check if gateway is paused
        require!(!ctx.accounts.state.paused, GatewayError::GatewayPaused);
        
        // Check if merchant is active
        require!(ctx.accounts.merchant.active, GatewayError::MerchantInactive);
        
        // Verify the merchant wallet matches
        require!(
            ctx.accounts.merchant_wallet.key() == ctx.accounts.merchant.wallet,
            GatewayError::InvalidMerchantWallet
        );
        
        // Calculate fee (fee_bps = basis points, e.g., 100 = 1%)
        let fee = amount
            .checked_mul(ctx.accounts.state.fee_bps as u64)
            .ok_or(GatewayError::CalculationError)?
            .checked_div(10000)
            .ok_or(GatewayError::CalculationError)?;
        
        let merchant_amount = amount
            .checked_sub(fee)
            .ok_or(GatewayError::CalculationError)?;
        
        // Transfer funds to merchant (minus fee)
        let transfer_to_merchant = anchor_lang::system_program::Transfer {
            from: ctx.accounts.payer.to_account_info(),
            to: ctx.accounts.merchant_wallet.to_account_info(),
        };
        
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                transfer_to_merchant,
            ),
            merchant_amount,
        )?;
        
        // Transfer fee to treasury (if fee > 0)
        if fee > 0 {
            let transfer_to_treasury = anchor_lang::system_program::Transfer {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            };
            
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    transfer_to_treasury,
                ),
                fee,
            )?;
        }
        
        // Emit an event
        emit!(PaymentProcessed {
            payer: ctx.accounts.payer.key(),
            merchant: ctx.accounts.merchant.key(),
            merchant_wallet: ctx.accounts.merchant.wallet,
            amount,
            fee,
            merchant_amount,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + GatewayState::INIT_SPACE,
        seeds = [b"gateway_state"],
        bump
    )]
    pub state: Account<'info, GatewayState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterMerchant<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Merchant::INIT_SPACE,
        seeds = [b"merchant", admin.key().as_ref()],
        bump
    )]
    pub merchant: Account<'info, Merchant>,
    #[account(
        seeds = [b"gateway_state"],
        bump
    )]
    pub state: Account<'info, GatewayState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPause<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"gateway_state"],
        bump
    )]
    pub state: Account<'info, GatewayState>,
}

#[derive(Accounts)]
pub struct UpdateFees<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"gateway_state"],
        bump
    )]
    pub state: Account<'info, GatewayState>,
}

#[derive(Accounts)]
pub struct ProcessPayment<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub merchant: Account<'info, Merchant>,
    /// CHECK: This is the merchant's wallet that receives payments
    #[account(mut)]
    pub merchant_wallet: AccountInfo<'info>,
    #[account(
        seeds = [b"gateway_state"],
        bump
    )]
    pub state: Account<'info, GatewayState>,
    /// CHECK: Treasury wallet to receive fees
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Merchant {
    #[max_len(32)]
    pub name: String,
    pub wallet: Pubkey,
    pub active: bool,
}

#[account]
#[derive(InitSpace)]
pub struct GatewayState {
    pub admin: Pubkey,
    pub paused: bool,
    pub fee_bps: u16,
    pub treasury: Pubkey,
}

#[event]
pub struct PaymentProcessed {
    pub payer: Pubkey,
    pub merchant: Pubkey,
    pub merchant_wallet: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub merchant_amount: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum GatewayError {
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Gateway is currently paused")]
    GatewayPaused,
    #[msg("Merchant account is not active")]
    MerchantInactive,
    #[msg("Invalid fee amount (must be between 0-10000 basis points)")]
    InvalidFee,
    #[msg("Calculation error")]
    CalculationError,
    #[msg("Invalid merchant wallet")]
    InvalidMerchantWallet,
}