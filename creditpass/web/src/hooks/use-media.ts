'use client'

import { useSyncExternalStore } from 'react'

export function useMedia(query: string): boolean {
    return useSyncExternalStore(
        (callback) => {
            if (typeof window === 'undefined') return () => {}
            const matchMedia = window.matchMedia(query)
            matchMedia.addEventListener('change', callback)
            return () => {
                matchMedia.removeEventListener('change', callback)
            }
        },
        () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : true),
        () => true
    )
}
