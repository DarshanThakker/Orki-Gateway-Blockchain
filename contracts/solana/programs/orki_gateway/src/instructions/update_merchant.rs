use anchor_lang::prelude::*;
use crate::state::Merchant;

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
