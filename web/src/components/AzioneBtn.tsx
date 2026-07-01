'use client';

import { useState } from 'react';

// Bottone che esegue un'azione async e mostra lo stato (in corso / esito) accanto.
// Riusabile per: ricarica, aggiorna prezzi, avvia caccia, invia riepilogo.
export function AzioneBtn({
  onClick,
  children,
  className = 'btn btn-sm',
  conferma,
  onEsito,
}: {
  onClick: () => Promise<string | void>;
  children: React.ReactNode;
  className?: string;
  conferma?: string;
  onEsito?: (msg: string) => void;
}) {
  const [inCorso, setInCorso] = useState(false);

  async function esegui() {
    if (conferma && !window.confirm(conferma)) return;
    setInCorso(true);
    try {
      const msg = await onClick();
      if (msg && onEsito) onEsito(msg);
    } catch (e) {
      if (onEsito) onEsito((e as Error).message || 'Errore');
    } finally {
      setInCorso(false);
    }
  }

  return (
    <button className={className} onClick={esegui} disabled={inCorso}>
      {inCorso ? '…' : children}
    </button>
  );
}
