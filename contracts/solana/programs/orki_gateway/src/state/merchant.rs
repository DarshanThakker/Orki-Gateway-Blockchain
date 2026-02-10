use anchor_lang::prelude::*;

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
