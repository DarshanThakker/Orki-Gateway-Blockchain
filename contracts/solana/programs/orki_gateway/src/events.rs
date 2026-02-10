use anchor_lang::prelude::*;

#[event]
pub struct PaymentProcessed {
    pub payer: Pubkey,
    pub merchant: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub token: Pubkey,
    pub payment_id: u64,
    pub timestamp: i64,
}
