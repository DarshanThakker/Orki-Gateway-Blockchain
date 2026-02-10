use anchor_lang::prelude::*;
use crate::state::Merchant;
use crate::events::MerchantUpdated; 


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

pub fn update_merchant(
    ctx: Context<UpdateMerchant>,
    name: String,
    new_name: Option<String>,
    settlement_wallet: Option<Pubkey>,
    settlement_token: Option<Pubkey>,
    swap_enabled: Option<bool>,
) -> Result<()> {
    let merchant = &mut ctx.accounts.merchant;
    
    // Store old values for event
    let old_name = merchant.name.clone();
    let old_settlement_wallet = merchant.settlement_wallet;
    let old_settlement_token = merchant.settlement_token;
    let old_swap_enabled = merchant.swap_enabled;
    
    // Update fields
    if let Some(n) = &new_name {
        merchant.name = n.clone();
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
    
    // Emit event
    emit!(MerchantUpdated {
        owner: ctx.accounts.owner.key(),
        merchant: merchant.key(),
        old_name,
        new_name,
        settlement_wallet,
        settlement_token,
        swap_enabled,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}