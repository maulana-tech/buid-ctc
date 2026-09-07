'use client'

import { useEffect, useRef, useState } from 'react'
import { formatUnits } from 'ethers'
import { AreaSeries, ColorType, CrosshairMode, LineStyle, LineType, createChart, createSeriesMarkers, type UTCTimestamp } from 'lightweight-charts'

import { chartPalette } from '@/lib/chart-theme'
import { formatAmount, type VaultHistory } from '@/lib/creditpass'

type Metric = 'sharePrice' | 'totalAssets' | 'utilisation'

const METRICS: { id: Metric; label: string; hint: string }[] = [
    { id: 'sharePrice', label: 'Share price', hint: 'what one cpUSD redeems for — this is your yield' },
    { id: 'totalAssets', label: 'Vault size', hint: 'cash on hand plus principal out on loan' },
    { id: 'utilisation', label: 'Utilisation', hint: 'share of the vault lent out — what sets the supply rate' },
]

/**
 * One vault metric over the window, as a line with a soft wash under it. Single series, so no
 * legend. Samples are joined with straight segments — no smoothing, so the line never bends to a
 * value the vault did not report.
 *
 * Share price only moves when a loan is repaid or written off, so those moments are marked: a
 * repayment lifts every share, a default cuts it. The tooltip follows the crosshair and reads the
 * exact sample, so nobody has to aim at a 2px line.
 */
export function VaultChart({ history, symbol }: { history: VaultHistory; symbol: string }) {
    const container = useRef<HTMLDivElement>(null)
    const [metric, setMetric] = useState<Metric>('sharePrice')
    const [showTable, setShowTable] = useState(false)
    const [hover, setHover] = useState<{ x: number; y: number; time: number; value: number } | null>(null)

    const { points, events, decimals } = history
    const value = (p: VaultHistory['points'][number]) =>
        metric === 'utilisation' ? p.utilisationBps / 100 : Number(formatUnits(metric === 'sharePrice' ? p.sharePrice : p.totalAssets, decimals))
    const precision = metric === 'sharePrice' ? 4 : metric === 'utilisation' ? 2 : 0
    const unit = metric === 'utilisation' ? '%' : symbol

    useEffect(() => {
        if (showTable || !container.current || points.length === 0) return
        const el = container.current
        let colors = chartPalette()

        const chart = createChart(el, {
            autoSize: true,
            height: 260,
            layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: colors.text, fontFamily: 'var(--font-sans)', fontSize: 11, attributionLogo: false },
            grid: { vertLines: { visible: false }, horzLines: { color: colors.grid, style: LineStyle.Solid } },
            rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.1 } },
            timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
            crosshair: {
                mode: CrosshairMode.Magnet,
                vertLine: { color: colors.text, width: 1, style: LineStyle.Solid, labelBackgroundColor: colors.series },
                horzLine: { color: colors.text, width: 1, style: LineStyle.Solid, labelBackgroundColor: colors.series },
            },
            handleScroll: false,
            handleScale: false,
            localization: { priceFormatter: (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision }) },
        })

        const series = chart.addSeries(AreaSeries, {
            lineColor: colors.series,
            lineWidth: 2,
            lineType: LineType.Simple,
            topColor: `${colors.series}1f`,
            bottomColor: `${colors.series}00`,
            priceLineVisible: true,
            priceLineColor: colors.series,
            priceLineStyle: LineStyle.Solid,
            crosshairMarkerRadius: 4,
            crosshairMarkerBorderColor: colors.surface,
            crosshairMarkerBorderWidth: 2,
            priceFormat: { type: 'custom', minMove: 1 / 10 ** precision, formatter: (v: number) => v.toFixed(precision) },
        })
        series.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: value(p) })))

        // Only the share-price view earns markers: repayments and defaults are what move it.
        if (metric === 'sharePrice') {
            createSeriesMarkers(
                series,
                events.map((e) => ({
                    time: e.time as UTCTimestamp,
                    position: e.kind === 'repaid' ? ('belowBar' as const) : ('aboveBar' as const),
                    shape: e.kind === 'repaid' ? ('arrowUp' as const) : ('arrowDown' as const),
                    color: e.kind === 'repaid' ? colors.up : colors.down,
                    size: 1,
                }))
            )
        }
        chart.timeScale().fitContent()

        // Floating readout: value and time at the crosshair, placed beside the cursor.
        chart.subscribeCrosshairMove((param) => {
            const point = param.seriesData.get(series) as { value?: number } | undefined
            if (!param.point || !param.time || point?.value === undefined) {
                setHover(null)
                return
            }
            setHover({ x: param.point.x, y: param.point.y, time: Number(param.time), value: point.value })
        })

        const observer = new MutationObserver(() => {
            colors = chartPalette()
            chart.applyOptions({
                layout: { textColor: colors.text },
                grid: { horzLines: { color: colors.grid } },
                crosshair: { vertLine: { color: colors.text, labelBackgroundColor: colors.series }, horzLine: { color: colors.text, labelBackgroundColor: colors.series } },
            })
            series.applyOptions({ lineColor: colors.series, topColor: `${colors.series}1f`, bottomColor: `${colors.series}00`, priceLineColor: colors.series, crosshairMarkerBorderColor: colors.surface })
        })
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
        return () => {
            observer.disconnect()
            chart.remove()
        }
        // value/precision derive from metric; history is the data dependency.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [history, metric, showTable])

    if (points.length === 0) return <p className="text-muted-foreground py-12 text-center text-sm">No vault history in this window yet.</p>

    const first = points[0]
    const last = points[points.length - 1]
    const change = value(first) > 0 ? ((value(last) - value(first)) / value(first)) * 100 : 0
    const current = METRICS.find((m) => m.id === metric)!

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="text-muted-foreground text-xs">{current.hint}</div>
                    <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-2xl font-semibold tracking-tight">
                            {metric === 'utilisation' ? value(last).toFixed(2) : formatAmount(metric === 'sharePrice' ? last.sharePrice : last.totalAssets, decimals, precision)}
                        </span>
                        <span className="text-muted-foreground text-sm">{unit}</span>
                        <span className={`text-sm tabular-nums ${change > 0 ? 'text-emerald-600' : change < 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                            {change >= 0 ? '+' : ''}
                            {change.toFixed(2)}% over the window
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {METRICS.map((m) => (
                        <button
                            key={m.id}
                            type="button"
                            onClick={() => setMetric(m.id)}
                            className={`rounded-full px-2.5 py-1 text-xs duration-150 ${metric === m.id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                            {m.label}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setShowTable((v) => !v)}
                        className="text-muted-foreground hover:text-foreground ml-2 text-xs underline-offset-2 hover:underline">
                        {showTable ? 'Chart' : 'Table'}
                    </button>
                </div>
            </div>

            {showTable ? (
                <div className="max-h-65 overflow-auto rounded-lg border">
                    <table className="w-full text-xs">
                        <thead className="text-muted-foreground bg-muted/40 sticky top-0 text-left">
                            <tr className="*:px-3 *:py-2 *:font-normal">
                                <th>Time</th>
                                <th className="text-right">Share price</th>
                                <th className="text-right">Vault size</th>
                                <th className="text-right">Utilisation</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {points.map((p) => (
                                <tr
                                    key={p.block}
                                    className="*:px-3 *:py-1.5 tabular-nums">
                                    <td>{new Date(p.time * 1000).toLocaleString()}</td>
                                    <td className="text-right">{formatAmount(p.sharePrice, decimals, 4)}</td>
                                    <td className="text-right">{formatAmount(p.totalAssets, decimals)}</td>
                                    <td className="text-right">{(p.utilisationBps / 100).toFixed(2)}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="relative">
                    <div
                        ref={container}
                        className="h-65 w-full"
                    />
                    {hover && (
                        <div
                            className="bg-popover pointer-events-none absolute z-10 rounded-lg border px-3 py-2 text-xs shadow-lg"
                            style={{
                                left: hover.x,
                                top: Math.max(8, hover.y - 56),
                                transform: hover.x > (container.current?.clientWidth ?? 0) / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
                            }}>
                            <div className="text-muted-foreground">{new Date(hover.time * 1000).toLocaleString()}</div>
                            <div className="mt-1 flex items-center gap-2">
                                <span
                                    className="inline-block h-0.5 w-3 rounded"
                                    style={{ background: 'var(--chart-series)' }}
                                />
                                <span className="font-semibold tabular-nums">
                                    {hover.value.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision })}
                                </span>
                                <span className="text-muted-foreground">{unit}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
            {metric === 'sharePrice' && (
                <p className="text-muted-foreground text-xs">
                    Share price rises when a loan is repaid (↑) and drops when one is written off (↓). Flat in between: the vault only reprices on those
                    events.
                </p>
            )}
        </div>
    )
}
