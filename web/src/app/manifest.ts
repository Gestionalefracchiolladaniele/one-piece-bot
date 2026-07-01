import type { MetadataRoute } from 'next';

// Manifest PWA: consente "Aggiungi a schermata Home" su Android/Chrome con icona,
// nome e apertura a schermo intero (standalone, senza barra del browser).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Claupiece — One Piece Card Tracker',
    short_name: 'Claupiece',
    description: 'Monitora i prezzi delle carte One Piece TCG e la tua collezione.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d0716',
    theme_color: '#0d0716',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
