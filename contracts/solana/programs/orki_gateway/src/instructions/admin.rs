use anchor_lang::prelude::*;
use crate::state::GlobalState;
use crate::errors::ErrorCode;
use crate::events::*; 

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

pub fn set_fee(ctx: Context<AdminAuth>, new_fee_bps: u16) -> Result<()> {
    require!(new_fee_bps <= 10000, ErrorCode::InvalidFee);
    let state = &mut ctx.accounts.global_state;
    
    // Store old value for event
    let old_fee_bps = state.fee_bps;
    
    state.fee_bps = new_fee_bps;
    
    // Emit event
    emit!(FeeUpdated {
        admin: ctx.accounts.admin.key(),
        old_fee_bps,
        new_fee_bps,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}

pub fn set_fee_wallet(ctx: Context<AdminAuth>, new_fee_wallet: Pubkey) -> Result<()> {
    let state = &mut ctx.accounts.global_state;
    
    // Store old value for event
    let old_fee_wallet = state.fee_wallet;
    
    state.fee_wallet = new_fee_wallet;
    
    // Emit event
    emit!(FeeWalletUpdated {
        admin: ctx.accounts.admin.key(),
        old_fee_wallet,
        new_fee_wallet,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}

pub fn set_paused(ctx: Context<AdminAuth>, paused: bool) -> Result<()> {
    let state = &mut ctx.accounts.global_state;
    state.paused = paused;
    
    // Emit event
    emit!(PausedStatusUpdated {
        admin: ctx.accounts.admin.key(),
        paused,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}

pub fn update_admin(ctx: Context<AdminAuth>, new_admin: Pubkey) -> Result<()> {
    let state = &mut ctx.accounts.global_state;
    
    // Store old value for event
    let old_admin = state.admin;
    
    state.admin = new_admin;
    
    // Emit event
    emit!(AdminUpdated {
        old_admin,
        new_admin,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}