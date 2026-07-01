-- ============================================================================
-- Claupiece — Schema SQL (Supabase / PostgreSQL)
-- ----------------------------------------------------------------------------
-- Tracker prezzi carte One Piece TCG (uso personale). 6 tabelle:
--   carte, watchlist, prezzi_riferimento, annunci_visti, affari, config.
-- RLS abilitato SENZA policy pubbliche: il backend accede con la SERVICE ROLE
-- KEY (che bypassa RLS). Nessun accesso anonimo/client.
-- Eseguire questo file una volta nell'SQL Editor di Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABELLA: carte  (anagrafica da punk-records)
-- PK = codice (es. OP01-120). Ponte con CardTrader via cardtrader_blueprint_id.
-- ----------------------------------------------------------------------------
create table if not exists carte (
  codice                    text primary key,        -- es. 'OP01-120'
  nome                      text not null default '',
  set                       text not null default '',
  rarita                    text not null default '',
  colore                    text not null default '',
  tipo                      text not null default '',
  lingua                    text not null default 'en',
  immagine_url              text not null default '',
  cardtrader_blueprint_id   bigint,                  -- ponte → prezzo CardTrader
  cardmarket_id             bigint,                  -- ponte → Cardmarket (futuro)
  updated_at                timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- TABELLA: watchlist  (carte monitorate + regola prezzo)
-- ----------------------------------------------------------------------------
create table if not exists watchlist (
  codice         text primary key references carte(codice) on delete cascade,
  attiva         boolean not null default true,
  priorita       text    not null default 'normale',   -- vip | normale | bassa
  regola_tipo    text    not null default 'prezzo_max', -- prezzo_max | perc_sconto | ogni_annuncio
  regola_valore  numeric not null default 30,           -- es. 30.0 (€ tetto) o 20.0 (% sconto)
  paese          text    not null default 'it',         -- it | eu (filtro Vinted/riferimento)
  created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- TABELLA: prezzi_riferimento  (storico prezzi per carta/fonte)
-- ----------------------------------------------------------------------------
create table if not exists prezzi_riferimento (
  id         bigint generated always as identity primary key,
  codice     text not null references carte(codice) on delete cascade,
  fonte      text not null default 'cardtrader',   -- cardtrader | cardmarket | tcgapi
  prezzo     numeric not null,
  valuta     text not null default 'EUR',
  timestamp  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- TABELLA: annunci_visti  (dedup — "solo nuovi")
-- PK = item_id Vinted. Evita di ri-notificare lo stesso annuncio.
-- ----------------------------------------------------------------------------
create table if not exists annunci_visti (
  item_id   text primary key,
  codice    text,
  visto_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- TABELLA: affari  (affari trovati — storico per dashboard/notifiche)
-- ----------------------------------------------------------------------------
create table if not exists affari (
  id                  bigint generated always as identity primary key,
  codice              text,
  prezzo_vinted       numeric,
  prezzo_riferimento  numeric,
  sconto_perc         numeric,
  score_stelle        int,
  score_motivo        text,
  url_annuncio        text,
  condizione          text,
  paese               text,
  titolo              text,
  venditore           text,
  item_id             text,
  timestamp           timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- TABELLA: collezione  (le carte che POSSIEDI + quante copie — il "raccoglitore")
-- PK = codice. Il valore si calcola a runtime da prezzi_riferimento (nessun prezzo
-- duplicato qui): quantita × ultimo prezzo noto. Indipendente dalla watchlist.
-- ----------------------------------------------------------------------------
create table if not exists collezione (
  codice      text primary key references carte(codice) on delete cascade,
  quantita    int  not null default 1,
  note        text not null default '',
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- TABELLA: config  (impostazioni globali — 1 riga, id=1)
-- ----------------------------------------------------------------------------
create table if not exists config (
  id                          int primary key default 1,
  finestra_inizio             int,           -- ora locale d'inizio finestra (0–24), es. 7
  finestra_fine               int,           -- ora locale di fine finestra (0–24), es. 13
  in_pausa                    boolean not null default false, -- /pausa: notifiche sospese
  ultimo_refresh_riferimenti  text,          -- data ISO dell'ultimo refresh CardTrader
  updated_at                  timestamptz not null default now(),
  constraint config_singola check (id = 1)
);

-- ----------------------------------------------------------------------------
-- INDICI
-- ----------------------------------------------------------------------------
create index if not exists idx_watchlist_attiva  on watchlist (attiva) where attiva;
create index if not exists idx_prezzi_codice_ts  on prezzi_riferimento (codice, timestamp desc);
create index if not exists idx_affari_ts         on affari (timestamp desc);
create index if not exists idx_carte_nome        on carte (nome);

-- ----------------------------------------------------------------------------
-- RLS: abilitato ovunque, NESSUNA policy pubblica (deny-all tranne service_role).
-- ----------------------------------------------------------------------------
alter table carte               enable row level security;
alter table watchlist           enable row level security;
alter table prezzi_riferimento  enable row level security;
alter table annunci_visti       enable row level security;
alter table affari              enable row level security;
alter table collezione          enable row level security;
alter table config              enable row level security;
