use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Payment {
    pub payer: Pubkey,
    pub merchant: Pubkey,
    pub amount: u64,
    pub payment_id: u64,
    pub timestamp: i64,
    pub bump: u8,
}
