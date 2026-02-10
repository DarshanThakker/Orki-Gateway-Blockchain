use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Contract is paused")]
    Paused,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid token for this merchant")]
    InvalidToken,
    #[msg("Invalid fee amount (must be 0-10000)")]
    InvalidFee,
    #[msg("Missing mint account")]
    MissingMint,
    #[msg("Missing necessary account")]
    MissingAccount,
    #[msg("Invalid merchant wallet provided")]
    InvalidMerchantWallet,
    #[msg("Invalid fee wallet provided")]
    InvalidFeeWallet,
    #[msg("Invalid token account")]
    InvalidTokenAccount,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Calculation error")]
    CalculationError,
    #[msg("Merchant name too long")]
    NameTooLong,
    #[msg("Duplicate payment detected")]
    DuplicatePayment,
}
