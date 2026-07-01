import { ImageResponse } from 'next/og';

// Icona per iPhone (Aggiungi a Home da Safari). Apple usa 180x180 e NON applica
// angoli/ombre automatiche come Android: mettiamo lo sfondo pieno viola.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #2a1150 0%, #7c3aed 100%)',
          fontSize: 110,
        }}
      >
        🏴‍☠️
      </div>
    ),
    { ...size },
  );
}
