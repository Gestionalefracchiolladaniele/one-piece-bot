// Tipi condivisi (rispecchiano lo schema Supabase — vedi ../../schema.sql).

export type Carta = {
  codice: string;
  nome: string;
  set: string;
  rarita: string;
  colore: string;
  tipo: string;
  lingua: string;
  immagine_url: string;
  cardtrader_blueprint_id: number | null;
  cardmarket_id: number | null;
};

export type RegolaTipo = 'prezzo_max' | 'perc_sconto' | 'ogni_annuncio';
export type Priorita = 'vip' | 'normale' | 'bassa';

export type Watch = {
  codice: string;
  attiva: boolean;
  priorita: Priorita;
  regola_tipo: RegolaTipo;
  regola_valore: number;
  paese: string;
  created_at: string;
  // arricchito dall'API con l'anagrafica carta
  carta?: Carta | null;
};

export type Affare = {
  id: number;
  codice: string;
  prezzo_vinted: number | null;
  prezzo_riferimento: number | null;
  sconto_perc: number | null;
  score_stelle: number | null;
  score_motivo: string | null;
  url_annuncio: string;
  condizione: string;
  paese: string;
  titolo: string;
  venditore: string;
  item_id: string;
  timestamp: string;
};

export type PrezzoStorico = {
  codice: string;
  fonte: string;
  prezzo: number;
  valuta: string;
  timestamp: string;
};

export type AppConfig = {
  id: number;
  finestra_inizio: number;
  finestra_fine: number;
  in_pausa: boolean;
};
