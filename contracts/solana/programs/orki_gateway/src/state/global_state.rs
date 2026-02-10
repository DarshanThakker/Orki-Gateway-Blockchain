use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct GlobalState {
    pub admin: Pubkey,
    pub fee_bps: u16,
    pub fee_wallet: Pubkey,
    pub paused: bool,
    pub bump: u8,
}
