# @techinject/contracts

SignalKit contracts adapter/package. MIT licensed, local v1.

See https://github.com/TechInjectIndia/signal-kit/tree/main/packages/features/signals/INTEGRATION.md for wiring, consent behavior and verification limits.

Added in 0.1.0-alpha.6: 17 predefined events (adds `remove_from_cart`, `view_cart`, `add_shipping_info`, `add_payment_info`, `refund`, `view_item_list`, `select_item`, `add_to_wishlist`), optional host-supplied `checkout_id`, `payment_attempt_id` and `customer_type`, the `skipped` dispatch status, `EventContext`, `TrackOptions`, `UserIdentity`, and optional provider `prepare`, `setUser` and `identifiers` hooks. Identifier fields skip the bare-digit phone check but still reject emails and formatted phone numbers. Fixture evidence only.
