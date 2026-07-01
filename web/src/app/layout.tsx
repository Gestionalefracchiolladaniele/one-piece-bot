import type { Metadata, Viewport } from 'next';
import { Inter, Sora } from 'next/font/google';
import { AuroraBackground } from '@/components/AuroraBackground';
import './globals.css';

// Font self-hosted via next/font (ottimizzato: niente <link> esterni, niente CLS).
// Sottoinsieme 'latin', pesi ridotti a quelli davvero usati → bundle più leggero.
// Le CSS variables --font-inter / --font-sora sono usate dai token in globals.css.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});
const sora = Sora({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-sora',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Claupiece — One Piece Card Tracker',
  description:
    'Monitora i prezzi delle carte One Piece TCG e ricevi un alert su Telegram quando compare un affare su Vinted.',
};

export const viewport: Viewport = {
  themeColor: '#0d0716',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${inter.variable} ${sora.variable}`}>
      <body>
        <AuroraBackground />
        <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
      </body>
    </html>
  );
}
