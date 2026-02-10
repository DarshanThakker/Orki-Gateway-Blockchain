use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("C9k2E4oE3SWB7wuCm5YwaLeYJg5DCqxBXFUDoDpzdDp9");

#[program]
pub mod orki_gateway {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>, 
        fee_bps: u16,
        fee_wallet: Pubkey
    ) -> Result<()> {
        instructions::initialize(ctx, fee_bps, fee_wallet)
    }

    pub fn register_merchant(
        ctx: Context<RegisterMerchant>,
        settlement_wallet: Pubkey,
        settlement_token: Pubkey,
        name: String,
    ) -> Result<()> {
        instructions::register_merchant(ctx, settlement_wallet, settlement_token, name)
    }

    pub fn update_merchant(
        ctx: Context<UpdateMerchant>,
        name: String,
        new_name: Option<String>,
        settlement_wallet: Option<Pubkey>,
        settlement_token: Option<Pubkey>,
        swap_enabled: Option<bool>,
    ) -> Result<()> {
        instructions::update_merchant(ctx, name, new_name, settlement_wallet, settlement_token, swap_enabled)
    }

    pub fn set_fee(ctx: Context<AdminAuth>, new_fee_bps: u16) -> Result<()> {
        instructions::set_fee(ctx, new_fee_bps)
    }

    pub fn set_fee_wallet(ctx: Context<AdminAuth>, new_fee_wallet: Pubkey) -> Result<()> {
        instructions::set_fee_wallet(ctx, new_fee_wallet)
    }

    pub fn set_paused(ctx: Context<AdminAuth>, paused: bool) -> Result<()> {
        instructions::set_paused(ctx, paused)
    }

    pub fn update_admin(ctx: Context<AdminAuth>, new_admin: Pubkey) -> Result<()> {
        instructions::update_admin(ctx, new_admin)
    }

    pub fn process_payment(
        ctx: Context<ProcessPayment>,
        amount: u64,
        payment_id: u64,
        name: String,
    ) -> Result<()> {
        instructions::process_payment(ctx, amount, payment_id, name)
    }
}
