import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Runs before first paint so the page never flashes light before switching to dark.
 * Kept as a raw string on purpose: a React component would run too late.
 */
const themeScript = `try{var s=localStorage.getItem('theme');var d=s?s==='dark':matchMedia('(prefers-color-scheme:dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}`;

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CreditPass — credit that travels across chains",
  description:
    "Under-collateralised lending on Creditcoin, priced by an Ethereum borrowing history proved with the Attestcoin Protocol. No oracles, no collateral, no trust.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
