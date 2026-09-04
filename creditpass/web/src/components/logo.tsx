import { cn } from '@/lib/utils'

/// Two interlocking squares: a record on one chain, proved on another.
export const LogoIcon = ({ className, uniColor }: { className?: string; uniColor?: boolean }) => {
    return (
        <svg
            className={cn('size-6', className)}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg">
            <rect
                x="1.5"
                y="1.5"
                width="14"
                height="14"
                rx="4.5"
                stroke="currentColor"
                strokeWidth="2"
            />
            <rect
                x="8.5"
                y="8.5"
                width="14"
                height="14"
                rx="4.5"
                fill={uniColor ? 'currentColor' : 'url(#paint_logo)'}
            />
            <defs>
                <linearGradient
                    id="paint_logo"
                    x1="15.5"
                    y1="8.5"
                    x2="15.5"
                    y2="22.5"
                    gradientUnits="userSpaceOnUse">
                    <stop stopColor="#9B99FE" />
                    <stop
                        offset="1"
                        stopColor="#2BC8B7"
                    />
                </linearGradient>
            </defs>
        </svg>
    )
}

export const Logo = ({ className, uniColor }: { className?: string; uniColor?: boolean }) => {
    return (
        <div className={cn('text-foreground flex items-center gap-2', className)}>
            <LogoIcon uniColor={uniColor} />
            <span className="text-lg font-semibold tracking-tight">CreditPass</span>
        </div>
    )
}
