use anchor_lang::prelude::*;
use crate::state::Merchant;
use crate::errors::ErrorCode;
use crate::events::MerchantRegistered; // ADD THIS LINE

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

pub fn register_merchant(
    ctx: Context<RegisterMerchant>,
    settlement_wallet: Pubkey,
    settlement_token: Pubkey,
    name: String,
) -> Result<()> {
    require!(name.len() <= 32, ErrorCode::NameTooLong);
    
    let merchant = &mut ctx.accounts.merchant;
    merchant.owner = ctx.accounts.owner.key();
    merchant.settlement_wallet = settlement_wallet;
    merchant.settlement_token = settlement_token;
    merchant.swap_enabled = false; 
    merchant.name = name.clone(); // Use clone for event
    merchant.bump = ctx.bumps.merchant;
    
    // Emit event
    emit!(MerchantRegistered {
        owner: ctx.accounts.owner.key(),
        merchant: merchant.key(),
        settlement_wallet,
        settlement_token,
        name,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}
