import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, JetBrains_Mono, VT323, Orbitron, Press_Start_2P, Silkscreen } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

const vt323 = VT323({
  variable: '--font-vt323',
  subsets: ['latin'],
  weight: '400',
});

const orbitron = Orbitron({
  variable: '--font-orbitron',
  subsets: ['latin'],
  weight: ['400', '700', '900'],
});

const pressStart = Press_Start_2P({
  variable: '--font-press-start',
  subsets: ['latin'],
  weight: '400',
});

const silkscreen = Silkscreen({
  variable: '--font-silkscreen',
  subsets: ['latin'],
  weight: ['400', '700'],
});


export const metadata: Metadata = {
  title: 'MixFlip — Compare Your Mixes',
  description:
    'Drop your mix revisions and reference tracks. Switch between them instantly, in sync, with no gap. Free by HornsUP Audio.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MixFlip',
  },
};

export const viewport: Viewport = {
  themeColor: '#201d18',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${vt323.variable} ${orbitron.variable} ${pressStart.variable} ${silkscreen.variable} h-full`}>
      <body className="h-full antialiased">
        <div className="grain" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
