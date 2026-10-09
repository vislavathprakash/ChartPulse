# Chart workspace upgrade

TradingView was inspected directly on its public chart page: chart type and interval selectors, the drawing toolbar, preferences (Symbol, Status line, Scales and lines, Canvas, Trading, Alerts, Events), the indicator library, layouts, watchlists and alert entry point. Alert details were checked against its official documentation because alert creation requires a TradingView account.

The application is available locally at http://localhost:3000. Use the existing temporary local admin login, or create your own customer account. The Render Blueprint is prepared; remote deployment has not occurred.

## Implemented now

| Area | Working features |
|---|---|
| Chart types | Candles, hollow candles, OHLC bars, line, area, baseline, Heikin Ashi, columns |
| Intervals | 1m, 2m, 3m, 5m, 10m, 15m, 30m, 1h, 2h, 4h, 1D; generated candles aggregated consistently |
| Navigation | Pan, wheel zoom, price-axis resizing, auto scale, crosshair, OHLC values, bar-range presets, fullscreen |
| Preferences | Dark/light chart canvas, linear/log scale, IST/UTC timezone, candle colours, custom background, precision, grid, last-price line, watermark and volume visibility; saved to each account |
| Indicators | SMA, EMA, WMA, Bollinger Bands, VWAP, RSI, MACD, stochastic, ATR, CCI, OBV, ROC and volume; adjustable inputs, colour, visibility and removal; oscillators have separate panes |
| Drawings | Horizontal/trend/extended/vertical lines, rays, rectangles, parallel channels, Fibonacci retracement, text, arrows and measurements |
| Drawing management | Object list, numeric coordinate/style editing, object dragging, hide/lock, magnet snapping, keep-drawing mode, undo/redo and owner-only persistence |
| Drawing alerts | Crossing/up/down and greater/less for lines and Fibonacci levels; entering/exiting/inside/outside for rectangles and channels; one-minute event cooldown |
| Alert conditions | Crossing, crossing up/down, greater/less, entering/exiting/inside/outside channel, moving up/down by amount, moving up/down by percent |
| Alert frequencies | Only once, each condition entry, once per bar, once per bar close, once per minute |
| Alert settings | Price or indicator plot, interval independent of chart, stored indicator parameters, expiration/open-ended, message and simulated delivery preference; pause/resume/delete |
| Watchlist alerts | One technical alert evaluates each current watchlist instrument independently |
| Layouts/templates | Save/load/delete account-owned chart layouts; save/apply/delete indicator templates |
| Watchlists | Create/delete, add/remove instruments, search, quotes and symbol switching |
| Data window | Hovered OHLCV and indicator values; insufficient-history labels |
| Two charts | Second instrument price chart with shared chart settings; separate instrument selection |
| Replay | Historical bar slider, play/pause, next bar, return to current feed; indicators recalculate using replayed history only |
| Export | Chart PNG and raw OHLCV CSV downloads, labelled SIMULATED |
| Screener | Technical fields added: sma20/50/200, ema20, rsi14, atr14, vwap, macd, macd_signal, bb_upper/lower, stochastic_k, cci20, obv, roc10 |

### How to use

1. Open Charts. Use the interval and chart-type selectors.
2. Click **Indicators** to search the library and set lengths. Click an indicator chip to edit it; use the eye or remove controls beside it.
3. Use **Preferences** to change the chart canvas and price scale. Settings persist after reload.
4. Pick a tool on the left. Lines/rectangles/Fibonacci use two chart points; a parallel channel uses three. Horizontal/vertical/text use one point. Drawing tools operate in the main price pane.
5. Open **Objects** to select a drawing, drag it, or edit its coordinates, colour, visibility, lock and alert condition. Undo/redo applies to drawing changes during the current chart session.
6. Create a watchlist using **+** on the Watch panel. Add the current chart symbol, then use its rows to switch instruments.
7. Click **Alert** for a price or indicator rule, or a watchlist-wide rule. The Alerts page shows its lifecycle and generated events.
8. Save a named layout or indicator template. Use Two charts for a second instrument, or Replay to inspect historical bars.

## Exact differences and constraints

- This is an independently implemented chart workspace. It is not TradingView's proprietary Supercharts/Advanced Charts library and does not implement every TradingView feature.
- It implements the 13 indicator families above, not TradingView's entire built-in/community collection. Pine Script, user-written code execution, strategies, strategy backtesting, automated pattern detection, Gann/Elliott/harmonic tools, volume profiles, Renko/Kagi/point-and-figure/range charts, broker order execution, paper trading, news, fundamentals, earnings, calendars, community publishing, and enterprise administration are not implemented.
- The data is fictional. It has no real NSE/BSE market sessions, actual fundamentals, exchange order book or licensed historical coverage. History starts with 600 seeded minute bars and keeps at most 1,500. Large intervals may have insufficient bars for indicators. Restart/reset regenerates history; customer accounts, preferences, layouts, drawings and alert definitions persist in the database.
- Technical screener fields use **1m** source bars in simulated mode; chart and technical alerts use their chosen intervals. This is shown in the query builder.
- VWAP uses HLC3 and resets at midnight IST for this synthetic feed. Real market-session anchoring must be implemented with the licensed feed's session metadata.
- Heikin Ashi changes displayed candles. Indicators and alerts still use original OHLC data; it does not change the underlying simulated execution/quote price.
- Log scale is a visual preference. Drawing alert levels use arithmetic interpolation; logarithmic Fibonacci/trend calculations are not implemented. Trend/ray/extended alerts extrapolate their line levels. Rectangle alerts apply only during the rectangle's time span.
- Two charts share preferences and overlay indicators. The main chart has oscillator panes and drawings; the second is a price/volume view. Their price scales and navigation are independent. Replay filters both by the selected historical timestamp; server alerts continue evaluating the current provider feed and do not fire because of replay.
- “Every condition entry” fires when a sustained condition becomes true again, rather than on every polling cycle. Once-per-bar-close evaluates completed aggregated bars. A generated 1m bar is complete when emitted; higher intervals complete on the accelerated clock's bucket boundaries. Once-per-minute uses real elapsed time.
- Chart layouts store symbol, preferences and indicators. They do not snapshot drawings or watchlists; those remain separate account-owned objects. Undo history is not persisted across navigation/reload.
- Alert expiration disables the rule. “Only once” disables a watchlist rule after its first matching instrument. Settings are stored with each alert, so changing the chart's indicators does not change an existing alert.
- A `simulated` delivery status records processing only. No WhatsApp messages are sent. Actual Meta template approval/delivery still needs credentials and validation later.
- Licensed integrated charts and technical alerts require a licensed historical-candle adapter. The existing TrueData tick path and separate TradingView embed do not constitute this adapter.

## Verification

- **13 automated chart workflow groups passed**, including numeric indicator reference values, all 13 condition predicates, all drawing types, preferences/layout/template/watchlist ownership, coherent interval aggregation, alert events and the five frequency modes.
- **8 original workflow groups passed** again: auth/admin permissions, synthetic quotes, screener parser, history, saved scans, drawing/screener events, webhook deduplication and paused account revocation.
- Browser checks passed for persisted preferences, Heikin Ashi and intervals, adding MACD, saving a layout, watchlist membership, creating an RSI alert and seeing its simulated event, second chart, replay stepping, rectangle drawing and undo/redo. No browser console errors were observed during those checks.
- These checks ran on the local PGlite database. Remote PostgreSQL/Render, licensed TrueData and real Meta delivery have not been verified.

See `chart-upgrade-verification.json`, `simulation-verification.json` and `chart-workspace.jpg`.

## Official references used

- [TradingView alert configuration](https://www.tradingview.com/support/solutions/43000763312-learn-how-to-configure-alerts/)
- [Technical and drawing alerts](https://www.tradingview.com/support/solutions/43000763315-getting-started-with-technical-alerts/)
- [Chart library unsupported features and Pine Script limitations](https://www.tradingview.com/charting-library-docs/latest/resources/Frequently-Asked-Questions/)
- [Chart library introduction and access terms](https://www.tradingview.com/charting-library-docs/latest/introduction/)
- [Moving averages](https://www.tradingview.com/support/solutions/43000502589-moving-averages/)
- [RSI](https://www.tradingview.com/support/solutions/43000502338-relative-strength-index-rsi/)
- [Bollinger Bands](https://www.tradingview.com/support/solutions/43000501840-bollinger-bands-bb/)
- [MACD](https://www.tradingview.com/support/solutions/43000502344-moving-average-convergence-divergence-macd-indicator/)
- [VWAP](https://www.tradingview.com/support/solutions/43000502018-volume-weighted-average-price-vwap/)
