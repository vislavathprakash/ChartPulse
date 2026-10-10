# Watchlists and stock search

## Customer features

- Create up to five watchlists, with your own names.
- Rename lists and edit their stock membership.
- Add the current chart stock or use the plus button beside a search result.
- Select a saved stock to open its chart directly.
- Lists are stored in the customer's database account; the selected list is remembered on the device.
- Search automatically suggests stock symbols and company names. Selecting a suggestion opens its chart immediately; typing a complete ticker also opens it automatically.
- Load and Reload buttons have been removed.
- Arrow keys and Enter work in the search suggestions; Escape closes them.

The server serializes list creation per customer, enforcing the five-list limit even with simultaneous requests. Names must be unique within the customer's account and contain 1–60 characters. Lists support up to 200 stocks each.

## Market coverage

Search uses a bundled directory of 4,933 BSE equity symbols, with an in-memory refresh from Upstox's public instrument file once per day on use. A failed refresh retains the bundled/last successful directory. This is symbol metadata, not a price feed. Some listed instruments may still be unavailable in the TradingView widget.

NSE-qualified searches return BSE counterparts and show an explanatory message on exact-match selection. The widget still provides BSE end-of-day data; these changes do not enable licensed NSE live prices.

Reference: [Upstox instrument-directory documentation](https://upstox.com/developer/api-documentation/instruments/).
