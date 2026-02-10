// use anchor_lang::prelude::*;

// #[event]
// pub struct PaymentProcessed {
//     pub payer: Pubkey,
//     pub merchant: Pubkey,
//     pub amount: u64,
//     pub fee: u64,
//     pub token: Pubkey,
//     pub payment_id: u64,
//     pub timestamp: i64,
// }



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

#[event]
pub struct MerchantRegistered {
    pub owner: Pubkey,
    pub merchant: Pubkey,
    pub settlement_wallet: Pubkey,
    pub settlement_token: Pubkey,
    pub name: String,
    pub timestamp: i64,
}

#[event]
pub struct MerchantUpdated {
    pub owner: Pubkey,
    pub merchant: Pubkey,
    pub old_name: String,
    pub new_name: Option<String>,
    pub settlement_wallet: Option<Pubkey>,
    pub settlement_token: Option<Pubkey>,
    pub swap_enabled: Option<bool>,
    pub timestamp: i64,
}

#[event]
pub struct FeeUpdated {
    pub admin: Pubkey,
    pub old_fee_bps: u16,
    pub new_fee_bps: u16,
    pub timestamp: i64,
}

#[event]
pub struct FeeWalletUpdated {
    pub admin: Pubkey,
    pub old_fee_wallet: Pubkey,
    pub new_fee_wallet: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct PausedStatusUpdated {
    pub admin: Pubkey,
    pub paused: bool,
    pub timestamp: i64,
}

#[event]
pub struct AdminUpdated {
    pub old_admin: Pubkey,
    pub new_admin: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct GlobalStateInitialized {
    pub admin: Pubkey,
    pub fee_bps: u16,
    pub fee_wallet: Pubkey,
    pub timestamp: i64,
}