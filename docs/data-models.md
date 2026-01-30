Merchant {
  id: u64
  owner: address
  settlement_wallet: address
  accepted_tokens: list<address>
  settlement_token: address
  swaps_enabled: bool
}

FeeConfig {
  base_fee_bps: u16
  swap_fee_bps: u16
  max_fee_cap_bps: u16
  fee_wallet: address
}

SwapConfig {
  input_token: address
  output_token: address
  max_slippage_bps: u16
  router: address
}

GlobalState {
  admin: address
  paused: bool
  fee_config: FeeConfig
}
