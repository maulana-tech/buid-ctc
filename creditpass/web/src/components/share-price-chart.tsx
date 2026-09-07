'use client'

import { useEffect, useRef, useState } from 'react'
import { formatUnits } from 'ethers'
import {
    AreaSeries,
    ColorType,
    CrosshairMode,
    LineStyle,
    LineType,
    createChart,
    createSeriesMarkers,
    type IChartApi,
    type UTCTimestamp,
} from 'lightweight-charts'

import { formatAmount, type PriceHistory } from '@/lib/creditpass'

/**
 * Read a CSS custom property off the document and hand it back as hex.
 *
 * The app's tokens are OKLCH (shadcn), and lightweight-charts' colour parser only understands
 * hex / rgb / hsl — it throws on `oklch()` or the `lab()` the browser resolves it to. A 1x1 canvas
 * accepts any colour the browser can paint and gives back sRGB bytes, which is exactly the
 * conversion needed, with no dependency.
 */
function token(name: string, fallback: string) {
    if (typeof window === 'undefined') return fallback
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    if (!raw) return fallback
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw

    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) return fallback
    ctx.fillStyle = '#000'
    ctx.fillStyle = raw
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Redemption value per share over the window, with market trades as markers.
 *
 * TradingView's lightweight-charts, themed from the app's own tokens and re-themed when the dark
 * class flips. One series, so no legend — the header says what is plotted. NAV only moves when a
 * loan is repaid or defaults, so the line is drawn with steps: a smooth curve would invent movement
 * that never happened. Trade markers sit at what buyers actually paid; the gap below the line is
 * the price of leaving early.
 */
export function SharePriceChart({ history, symbol }: { history: PriceHistory; symbol: string }) {
    const container = useRef<HTMLDivElement>(null)
    const chartRef = useRef<IChartApi | null>(null)
    const [showTable, setShowTable] = useState(false)

    const { nav, trades, decimals } = history
    const last = nav[nav.length - 1]
    const toNum = (v: bigint) => Number(formatUnits(v, decimals))

    useEffect(() => {
        if (showTable || !container.current || nav.length === 0) return

        const el = container.current
        const paint = () => ({
            text: token('--muted-foreground', '#737373'),
            grid: token('--border', '#e5e5e5'),
            series: token('--chart-series', '#2a78d6'),
            surface: token('--card', '#ffffff'),
        })
        let colors = paint()

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
            localization: {
                priceFormatter: (p: number) => p.toFixed(4),
            },
        })
        chartRef.current = chart

        const series = chart.addSeries(AreaSeries, {
            lineColor: colors.series,
            lineWidth: 2,
            lineType: LineType.WithSteps,
            topColor: `${colors.series}1f`, // ~12% wash, never a saturated block
            bottomColor: `${colors.series}00`,
            priceLineVisible: true,
            priceLineColor: colors.series,
            priceLineStyle: LineStyle.Solid,
            lastValueVisible: true,
            crosshairMarkerRadius: 4,
            crosshairMarkerBorderColor: colors.surface,
            crosshairMarkerBorderWidth: 2,
            priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
        })

        // Timestamps must be unique and ascending for the time scale; samples are, trades may
        // share a second with a sample, which markers tolerate.
        series.setData(nav.map((p) => ({ time: p.time as UTCTimestamp, value: toNum(p.price) })))

        createSeriesMarkers(
            series,
            trades.map((t) => ({
                time: t.time as UTCTimestamp,
                position: 'inBar' as const,
                shape: 'circle' as const,
                color: colors.series,
                size: 1,
                text: `${formatAmount(t.shares, decimals)} sh @ ${toNum(t.pricePerShare).toFixed(4)}`,
            }))
        )

        chart.timeScale().fitContent()

        // Re-theme when the dark class flips: the tokens change, the chart must follow.
        const observer = new MutationObserver(() => {
            colors = paint()
            chart.applyOptions({
                layout: { textColor: colors.text },
                grid: { horzLines: { color: colors.grid } },
                crosshair: {
                    vertLine: { color: colors.text, labelBackgroundColor: colors.series },
                    horzLine: { color: colors.text, labelBackgroundColor: colors.series },
                },
            })
            series.applyOptions({
                lineColor: colors.series,
                topColor: `${colors.series}1f`,
                bottomColor: `${colors.series}00`,
                priceLineColor: colors.series,
                crosshairMarkerBorderColor: colors.surface,
            })
        })
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

        return () => {
            observer.disconnect()
            chart.remove()
            chartRef.current = null
        }
    }, [nav, trades, decimals, showTable])

    if (nav.length === 0) {
        return <p className="text-muted-foreground py-12 text-center text-sm">No price history in this window yet.</p>
    }

    return (
        <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-4">
                <div>
                    <div className="text-muted-foreground text-xs">Redemption value per share</div>
                    <div className="mt-1 text-2xl font-semibold tracking-tight">
                        {formatAmount(last.price, decimals, 4)} <span className="text-muted-foreground text-sm font-normal">{symbol}</span>
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
                                <th>Block</th>
                                <th className="text-right">Redeems for</th>
                                <th className="text-right">Traded at</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {nav.map((p, i) => {
                                const t = trades.filter((tr) => tr.block <= p.block && (i === nav.length - 1 || tr.block < nav[i + 1].block))
                                return (
                                    <tr
                                        key={p.block}
                                        className="*:px-3 *:py-1.5 tabular-nums">
                                        <td>{new Date(p.time * 1000).toLocaleString()}</td>
                                        <td className="font-mono">#{p.block.toLocaleString()}</td>
                                        <td className="text-right">{formatAmount(p.price, decimals, 4)}</td>
                                        <td className="text-muted-foreground text-right">
                                            {t.length ? t.map((tr) => formatAmount(tr.pricePerShare, decimals, 4)).join(', ') : '—'}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div
                    ref={container}
                    className="h-70 w-full"
                />
            )}
        </div>
    )
}
