use anchor_lang::prelude::*;
use crate::state::GlobalState;
use crate::errors::ErrorCode;
use crate::events::GlobalStateInitialized; // Add this import


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
    
    // Emit event
    emit!(GlobalStateInitialized {
        admin: ctx.accounts.admin.key(),
        fee_bps,
        fee_wallet,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}