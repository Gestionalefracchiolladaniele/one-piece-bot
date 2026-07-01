import { ImageResponse } from 'next/og';

// Icona app (favicon + PWA). Generata: sfondo viola Claupiece + bandiera pirata.
// Next la serve a più risoluzioni; questa è la base 512.
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
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
          fontSize: 300,
        }}
      >
        🏴‍☠️
      </div>
    ),
    { ...size },
  );
}
