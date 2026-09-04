import type { Metadata } from 'next'

import { AppShell } from '@/components/app-shell'

export const metadata: Metadata = {
    title: 'Dashboard — CreditPass',
    description: 'Look up any address: its attested lending history, its Creditcoin credit score, and the credit line that score unlocks.',
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return <AppShell>{children}</AppShell>
}
