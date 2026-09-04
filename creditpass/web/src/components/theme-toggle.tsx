'use client'

import { useEffect } from 'react'
import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Light/dark toggle with no state and no dependency.
 *
 * Which icon shows is decided by CSS (`dark:` variants), not React, so there is nothing to hydrate
 * and no wrong-icon flash on load. The class itself is set before paint by the inline script in
 * the root layout; this component only flips it and remembers the choice.
 */
export function ThemeToggle() {
    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: dark)')
        const follow = () => {
            // Only track the OS while the visitor has not made a choice of their own.
            if (localStorage.getItem('theme')) return
            document.documentElement.classList.toggle('dark', media.matches)
        }
        media.addEventListener('change', follow)
        return () => media.removeEventListener('change', follow)
    }, [])

    const toggle = () => {
        const next = !document.documentElement.classList.contains('dark')
        document.documentElement.classList.toggle('dark', next)
        try {
            localStorage.setItem('theme', next ? 'dark' : 'light')
        } catch {
            // Private mode can refuse storage; the toggle still works for this page view.
        }
    }

    return (
        <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggle}
            aria-label="Toggle dark mode">
            <Sun className="hidden dark:block" />
            <Moon className="dark:hidden" />
        </Button>
    )
}
