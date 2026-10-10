# TradingView integration

ChartPulse now uses TradingView's official Advanced Chart widget by default, independent of the backend market-data mode. The existing simulation workspace is available through the chart source selector.

## Available now

- TradingView's drawing toolbar, indicator catalog, chart styles, symbol search, comparison and watchlist.
- BSE end-of-day charts. Reliance, TCS, HDFC Bank, Infosys and SBI appear in the default watchlist.
- Chart stays mounted when moving between ChartPulse tabs; same-symbol navigation does not recreate it.
- Stable chart dimensions, compact workspace, a non-animated connection message, explicit reload and an Open TradingView link.

## Limits

- NSE:RELIANCE was rejected by the hosted widget with a “This symbol is only available on TradingView” notice. NSE live coverage is not provided by this integration.
- BSE intraday intervals were disabled; the observed feed is end-of-day.
- ChartPulse cannot read widget prices, indicators or drawings. Widget drawings do not populate account storage or trigger ChartPulse notifications.
- The screener and alert evaluator still use the configured ChartPulse feed, currently synthetic data. TradingView widget data cannot feed those APIs.
- The full tradingview.com experience cannot be embedded. Advanced Charts requires approved library access and an independent datafeed; Pine Script, native TradingView server alerts, Strategy Tester and Bar Replay are not supplied by that library.
- Render free-service cold starts and third-party chart loading time still apply.

## Verification

Locally verified: BSE chart rendering, adding RSI, native trend-line creation with two endpoints, drawing editing toolbar, chart continuity between Overview and Charts, NSE restriction notice, source switching and responsive layout. JavaScript syntax checks passed.

## Official references

- [Advanced Chart widget](https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/)
- [Widget data limitations](https://www.tradingview.com/widget-docs/faq/data/)
- [Advanced Charts unsupported features](https://www.tradingview.com/charting-library-docs/latest/resources/Frequently-Asked-Questions/)
- [Library access and comparison](https://www.tradingview.com/free-charting-libraries/)
