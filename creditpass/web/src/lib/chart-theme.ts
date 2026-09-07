/**
 * Read a CSS custom property off the document and hand it back as hex.
 *
 * The app's tokens are OKLCH (shadcn), and lightweight-charts' colour parser only understands
 * hex / rgb / hsl — it throws on `oklch()` or the `lab()` the browser resolves it to. A 1x1 canvas
 * accepts any colour the browser can paint and gives back sRGB bytes, which is exactly the
 * conversion needed, with no dependency.
 */
export function token(name: string, fallback: string) {
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

/** The chart chrome every chart in the app shares, resolved from the live theme. */
export function chartPalette() {
    return {
        text: token('--muted-foreground', '#737373'),
        grid: token('--border', '#e5e5e5'),
        series: token('--chart-series', '#2a78d6'),
        up: token('--chart-up', '#059669'),
        down: token('--chart-down', '#c2410c'),
        surface: token('--card', '#ffffff'),
    }
}
