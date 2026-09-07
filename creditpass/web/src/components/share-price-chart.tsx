'use client'

import { useEffect, useRef, useState } from 'react'
import { formatUnits } from 'ethers'
import {
    CandlestickSeries,
    ColorType,
    CrosshairMode,
    LineStyle,
    createChart,
    createSeriesMarkers,
    type UTCTimestamp,
} from 'lightweight-charts'

import { chartPalette } from '@/lib/chart-theme'
import { formatAmount, type PriceHistory } from '@/lib/creditpass'

type Candle = { time: number; open: number; high: number; low: number; close: number; trades: number }

/**
 * Build OHLC candles from everything the share was worth in each bucket: the vault's redemption
 * value at sampled blocks, plus what buyers actually paid. Buckets with nothing in them carry the
 * previous close as a flat candle rather than being invented — a gap in the data is a gap.
 */
function toCandles(history: PriceHistory, buckets: number): Candle[] {
    const { nav, trades, decimals } = history
    const points = [
        ...nav.map((p) => ({ time: p.time, value: Number(formatUnits(p.price, decimals)), trade: false })),
        ...trades.map((t) => ({ time: t.time, value: Number(formatUnits(t.pricePerShare, decimals)), trade: true })),
    ].sort((a, b) => a.time - b.time)
    if (points.length === 0) return []

    const start = points[0].time
    const end = points[points.length - 1].time
    const width = Math.max(1, Math.ceil((end - start + 1) / buckets))

    const candles: Candle[] = []
    let cursor = 0
    let prevClose = points[0].value
    for (let i = 0; i < buckets; i++) {
        const from = start + i * width
        const to = from + width
        const inBucket: typeof points = []
        while (cursor < points.length && points[cursor].time < to) inBucket.push(points[cursor++])

        if (inBucket.length === 0) {
            if (from > end) break
            candles.push({ time: from, open: prevClose, high: prevClose, low: prevClose, close: prevClose, trades: 0 })
            continue
        }
        const values = inBucket.map((p) => p.value)
        const candle = {
            time: from,
            open: prevClose,
            high: Math.max(prevClose, ...values),
            low: Math.min(prevClose, ...values),
            close: values[values.length - 1],
            trades: inBucket.filter((p) => p.trade).length,
        }
        candles.push(candle)
        prevClose = candle.close
    }
    return candles
}

/**
 * Redemption value per share as candlesticks, with market trades marked.
 *
 * TradingView's lightweight-charts, themed from the app's own tokens and re-themed when the dark
 * class flips. A candle here is honest OHLC over each bucket of everything the share was worth —
 * the vault's redemption value and any price a buyer actually paid. Up/down is emerald against
 * amber rather than green against red, because the pair has to survive colour-blindness.
 */
export function SharePriceChart({ history, symbol }: { history: PriceHistory; symbol: string }) {
    const container = useRef<HTMLDivElement>(null)
    const [showTable, setShowTable] = useState(false)

    const { nav, trades, decimals } = history
    const last = nav[nav.length - 1]
    const candles = toCandles(history, 24)

    useEffect(() => {
        if (showTable || !container.current || candles.length === 0) return

        const el = container.current
        let colors = chartPalette()

        const chart = createChart(el, {
            autoSize: true,
            height: 280,
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: colors.text,
                fontFamily: 'var(--font-sans)',
                fontSize: 11,
                attributionLogo: false,
            },
            grid: {
                vertLines: { visible: false },
                horzLines: { color: colors.grid, style: LineStyle.Solid },
            },
            rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.1 } },
            timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
            crosshair: {
                mode: CrosshairMode.Magnet,
                vertLine: { color: colors.text, width: 1, style: LineStyle.Solid, labelBackgroundColor: colors.series },
                horzLine: { color: colors.text, width: 1, style: LineStyle.Solid, labelBackgroundColor: colors.series },
            },
            handleScroll: false,
            handleScale: false,
            localization: { priceFormatter: (p: number) => p.toFixed(4) },
        })

        const series = chart.addSeries(CandlestickSeries, {
            upColor: colors.up,
            downColor: colors.down,
            wickUpColor: colors.up,
            wickDownColor: colors.down,
            borderVisible: false,
            priceLineVisible: true,
            priceLineColor: colors.series,
            priceLineStyle: LineStyle.Solid,
            lastValueVisible: true,
            priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
        })
        series.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })))

        // Trades: a dot under the candle they landed in, so real prints stand out from sampled value.
        createSeriesMarkers(
            series,
            candles
                .filter((c) => c.trades > 0)
                .map((c) => ({
                    time: c.time as UTCTimestamp,
                    position: 'belowBar' as const,
                    shape: 'circle' as const,
                    color: colors.series,
                    size: 1,
                    // Just the count: the newest candle sits on the right edge, where longer text clips.
                    text: c.trades > 1 ? `×${c.trades}` : '',
                }))
        )

        chart.timeScale().fitContent()

        const observer = new MutationObserver(() => {
            colors = chartPalette()
            chart.applyOptions({
                layout: { textColor: colors.text },
                grid: { horzLines: { color: colors.grid } },
                crosshair: {
                    vertLine: { color: colors.text, labelBackgroundColor: colors.series },
                    horzLine: { color: colors.text, labelBackgroundColor: colors.series },
                },
            })
            series.applyOptions({
                upColor: colors.up,
                downColor: colors.down,
                wickUpColor: colors.up,
                wickDownColor: colors.down,
                priceLineColor: colors.series,
            })
        })
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

        return () => {
            observer.disconnect()
            chart.remove()
        }
        // candles is derived from history; history is the real dependency.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [history, showTable])

    if (nav.length === 0) {
        return <p className="text-muted-foreground py-12 text-center text-sm">No price history in this window yet.</p>
    }

    const first = candles[0]
    const change = first && first.open > 0 ? ((candles[candles.length - 1].close - first.open) / first.open) * 100 : 0

    return (
        <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-4">
                <div>
                    <div className="text-muted-foreground text-xs">cpUSD / {symbol} · redemption value per share</div>
                    <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-2xl font-semibold tracking-tight">{formatAmount(last.price, decimals, 4)}</span>
                        <span className="text-muted-foreground text-sm">{symbol}</span>
                        <span className={`text-sm tabular-nums ${change > 0 ? 'text-emerald-600' : change < 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                            {change >= 0 ? '+' : ''}
                            {change.toFixed(2)}%
                        </span>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setShowTable((v) => !v)}
                    className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline">
                    {showTable ? 'Chart' : 'Table'}
                </button>
            </div>

            {showTable ? (
                <div className="max-h-70 overflow-auto rounded-lg border">
                    <table className="w-full text-xs">
                        <thead className="text-muted-foreground bg-muted/40 sticky top-0 text-left">
                            <tr className="*:px-3 *:py-2 *:font-normal">
                                <th>Time</th>
                                <th className="text-right">Open</th>
                                <th className="text-right">High</th>
                                <th className="text-right">Low</th>
                                <th className="text-right">Close</th>
                                <th className="text-right">Trades</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {candles.map((c) => (
                                <tr
                                    key={c.time}
                                    className="*:px-3 *:py-1.5 tabular-nums">
                                    <td>{new Date(c.time * 1000).toLocaleString()}</td>
                                    <td className="text-right">{c.open.toFixed(4)}</td>
                                    <td className="text-right">{c.high.toFixed(4)}</td>
                                    <td className="text-right">{c.low.toFixed(4)}</td>
                                    <td className={`text-right ${c.close > c.open ? 'text-emerald-600' : c.close < c.open ? 'text-amber-600' : ''}`}>
                                        {c.close.toFixed(4)}
                                    </td>
                                    <td className="text-muted-foreground text-right">{c.trades || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div
                    ref={container}
                    className="h-70 w-full"
                />
            )}
            <p className="text-muted-foreground text-xs">
                Each candle covers everything the share was worth in its window — vault redemption value and any price a buyer actually paid. Trades are
                marked beneath their candle.
            </p>
        </div>
    )
}
