# Politicase

**La politica italiana, misurata con i fatti.**

Politicase è una piattaforma open source che aggrega tutta la politica italiana in un unico posto: ogni parlamentare, le sue dichiarazioni, i voti, i programmi dei partiti, e soprattutto un **Indice di Coerenza** calcolato con intelligenza artificiale che misura quanto ogni politico è allineato a ciò che dice, ha detto, e al programma del suo partito.

---

## Mission

Avere in un unico posto tutta la politica italiana a confronto. Per ogni politico:
- **Aggregare tutte le dichiarazioni** scansionando web, social e atti parlamentari
- **Confrontare** le dichiarazioni passate con quelle attuali
- **Misurare la coerenza** rispetto al programma del proprio partito
- **Calcolare a quale partito** è effettivamente più vicino

---

## Funzionalità Principali

### Per ogni Parlamentare
- Profilo completo con dati anagrafici e ruoli (Open Data)
- Timeline cronologica di tutte le dichiarazioni (news, social, parlamento)
- Storico delle votazioni parlamentari
- **3 Indici di Coerenza AI:**
  - **Coerenza col Partito** — quanto le dichiarazioni sono allineate al programma ufficiale
  - **Coerenza Personale** — quanto è coerente con se stesso nel tempo
  - **Coerenza Voti** — quanto i voti in aula corrispondono alle dichiarazioni pubbliche
- **Partito più vicino** — analisi cross-party che mostra a quale partito il politico è realmente più affine

### Per ogni Partito
- Programma politico strutturato per temi
- Lista membri con punteggi di coerenza individuali
- Media coerenza del partito
- Confronto con altri partiti

### Strumenti
- Ricerca e filtri avanzati (camera/senato, partito, range coerenza)
- Confronto side-by-side tra 2-3 politici
- Classifica coerenza generale
- Feed dichiarazioni in tempo reale

---

## Tech Stack

| Componente | Tecnologia | Motivo |
|---|---|---|
| **Frontend + Backend** | Next.js 15 (App Router) | SSR/SSG per SEO, Server Components, API Routes |
| **Database** | PostgreSQL + pgvector | Join complessi, full-text search italiano, embeddings vettoriali |
| **ORM** | Drizzle ORM | Leggero, type-safe, zero binari |
| **Job Queue** | BullMQ + Redis | Scraping e analisi AI asincroni con retry e rate limiting |
| **AI/NLP** | Claude API (Anthropic) | Analisi coerenza, estrazione topic, riassunti |
| **Embeddings** | pgvector + Voyage/OpenAI | Similarità semantica tra dichiarazioni e programmi |
| **Scraping** | Playwright + Cheerio | JS-rendered (social) + HTML statico (news) |
| **UI** | Tailwind CSS + shadcn/ui + Recharts | Design system moderno, grafici interattivi |
| **Containerizzazione** | Docker Compose | PostgreSQL, Redis, App, Worker — tutto in locale |
| **Deploy** | Vercel (web) + Railway (worker) | Scalabile, serverless-friendly |

---

## Fonti Dati Open

| Fonte | Tipo | Dati |
|---|---|---|
| **dati.camera.it** | SPARQL/Linked Data | 400 deputati XIX Legislatura, votazioni, commissioni |
| **dati.senato.it** | SPARQL | ~200 senatori, mandati, attività |
| **Openpolis API** (api3.openpolis.it) | REST (Popolo standard) | Anagrafica arricchita, link social, 10k req/giorno |
| **News italiane** | RSS + Scraping | ANSA, Repubblica, Corriere, Il Fatto Quotidiano, Il Sole 24 Ore |
| **Twitter/X** | Nitter (self-hosted) + Apify (fallback) | Tweet e dichiarazioni dei parlamentari — vedi sezione dedicata |
| **Social Media (altro)** | API + Scraping | Facebook, Instagram dei parlamentari |
| **Atti parlamentari** | Scraping | Trascrizioni ufficiali camera.it e senato.it |

---

## Scraper Twitter/X — Strumenti Terzi

Lo scraping diretto di X/Twitter è impraticabile (rate limiting aggressivo, autenticazione obbligatoria, rendering JS). Usiamo un approccio a due livelli con failover automatico:

### Strategia

```
@GiorgiaMeloni → [Nitter pubblico RSS] → Tweet ✓
                         ↓ (se tutte le istanze falliscono)
                  [Apify cloud API]     → Tweet ✓
```

### 1. Nitter RSS (fonte primaria — gratuito, zero setup)

[Nitter](https://github.com/zedeus/nitter) è un frontend alternativo per Twitter. Le istanze pubbliche espongono feed RSS a `/{handle}/rss` — XML standard, parsabile con un semplice `fetch`, senza Cheerio o Playwright.

Più istanze pubbliche sono configurate come fallback una dell'altra:

```
nitter.privacydev.net → nitter.poast.org → nitter.woodland.cafe → nitter.1d4.us
```

- **Pro**: Gratuito, zero infrastruttura, RSS = parsing banale, niente API key
- **Contro**: Le istanze pubbliche possono andare giù (mitigato dal multi-instance)
- **Rate**: ~1 richiesta ogni 1.5s (configurabile)

### 2. Apify (fallback — pay-per-use)

[Apify](https://apify.com) è una piattaforma cloud per web scraping con actor preconfigurati per Twitter.

- **Pro**: Affidabile, gestito, niente infrastruttura da mantenere
- **Contro**: A pagamento (~$0.25-0.50 per run di 50 tweet)
- **Budget stimato**: ~$10-30/mese (solo come fallback)

### Variabili d'ambiente

```env
# Nitter (lista di istanze pubbliche, separate da virgola)
NITTER_INSTANCE_URLS=https://nitter.privacydev.net,https://nitter.poast.org
NITTER_TIMEOUT_MS=10000
NITTER_DELAY_MS=1500
NITTER_MAX_RETRIES=3

# Apify (fallback)
APIFY_API_TOKEN=apify_api_xxx
APIFY_TWITTER_ACTOR_ID=apidojo~tweet-scraper
APIFY_TIMEOUT_MS=60000
APIFY_MAX_COST_USD=0.5

# Filtri
TWITTER_MAX_TWEETS=50
TWITTER_LANGUAGES=it
```

### Utilizzo

```typescript
import { TwitterScraper } from "@/scrapers/twitter";

const scraper = new TwitterScraper();

// Singolo politico
const result = await scraper.scrape("GiorgiaMeloni");
console.log(result.tweets); // Tweet italiani, no retweet, solo dichiarazioni originali

// Multipli politici (con delay tra le richieste)
const handles = ["GiorgiaMeloni", "EnricoLetta", "GiuseppeConteIT"];
const results = await scraper.scrapeMultiple(handles);

// Health check — restituisce la prima istanza Nitter funzionante
const health = await scraper.checkHealth();
// { nitter: "https://nitter.privacydev.net", apify: true }
```

### Pipeline di filtro

1. Skip retweet (vogliamo solo dichiarazioni originali)
2. Filtro lingua (solo italiano, configurabile)
3. Skip tweet vuoti
4. Deduplicazione (a valle, nello stadio NORMALIZE)

---

## Architettura

### Pipeline Dati (4 stadi)

```
INGEST → NORMALIZE → ENRICH → ANALYZE
```

1. **Ingest** — Raccolta dati grezzi
   - Sync parlamentari da SPARQL (giornaliero)
   - Scraping news (ogni 4 ore)
   - Scraping social (ogni 2 ore)
   - Discorsi parlamentari (giornaliero)

2. **Normalize** — Pulizia e standardizzazione
   - Deduplicazione dichiarazioni
   - Matching nomi fuzzy contro lista parlamentari
   - Pulizia HTML, normalizzazione encoding
   - Filtro lingua (solo italiano)

3. **Enrich** — Arricchimento con AI
   - Generazione embeddings per ogni dichiarazione
   - Estrazione topic (economia, immigrazione, sanità, etc.)
   - Riassunti AI per dichiarazioni lunghe
   - Analisi sentiment

4. **Analyze** — Calcolo Indici di Coerenza
   - Party Alignment Score (settimanale)
   - Self-Consistency Score (settimanale)
   - Vote-Statement Consistency (settimanale)
   - Cross-party alignment (mensile)

### Come funziona l'Indice di Coerenza

#### Party Alignment Score
1. Recupera le dichiarazioni recenti del politico (ultimi 6 mesi)
2. Per ogni dichiarazione, trova la sezione più rilevante del programma del partito tramite similarità semantica (cosine similarity via pgvector)
3. Claude valuta l'allineamento da 0 (contraddice) a 1 (pienamente allineato) con spiegazione
4. Media pesata (dichiarazioni recenti pesano di più)

#### Self-Consistency Score
1. Raggruppa le dichiarazioni per topic
2. Usa embeddings per trovare coppie potenzialmente contraddittorie (stesso tema, posizione diversa)
3. Claude confronta le coppie e valuta la coerenza 0-1
4. Media aggregata su tutti i topic

#### Vote-Statement Consistency
1. Per ogni votazione, trova dichiarazioni dello stesso politico sullo stesso tema
2. Claude valuta se il voto (favorevole/contrario/astenuto) è coerente con le dichiarazioni
3. Media su tutte le coppie voto-dichiarazione

---

## Schema Database

### Tabelle principali

```
politicians          — Anagrafica, camera/senato URI, link social, partito, foto
parties              — Nome, sigla, colore, coalizione, logo
party_programs       — Testo integrale programma, summary AI, posizioni chiave (JSON)
statements           — Dichiarazioni (news, social, parlamento), topic, sentiment
votes                — Votazioni con tipo voto e riferimento DDL
coherence_scores     — 3 tipi di punteggio per politico con storico
party_alignment      — Allineamento cross-party per ogni politico
embeddings           — Vettori pgvector per ricerca semantica
```

### Dettaglio tabella `politicians`
```sql
id              UUID PRIMARY KEY
openpolis_id    INTEGER UNIQUE
camera_uri      TEXT UNIQUE          -- URI RDF dati.camera.it
senato_uri      TEXT UNIQUE          -- URI RDF dati.senato.it
first_name      TEXT NOT NULL
last_name       TEXT NOT NULL
slug            TEXT UNIQUE NOT NULL -- URL-friendly: "mario-rossi"
gender          TEXT
birth_date      DATE
birth_place     TEXT
photo_url       TEXT
chamber         TEXT NOT NULL        -- 'camera' | 'senato'
constituency    TEXT
legislature     INTEGER DEFAULT 19
party_id        UUID REFERENCES parties(id)
role            TEXT                 -- "Deputato", "Senatore"
social_twitter  TEXT
social_facebook TEXT
social_instagram TEXT
bio             TEXT
is_active       BOOLEAN DEFAULT TRUE
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

### Dettaglio tabella `statements`
```sql
id              UUID PRIMARY KEY
politician_id   UUID REFERENCES politicians(id)
source_type     TEXT NOT NULL        -- 'news', 'social', 'parliament', 'interview'
source_name     TEXT                 -- 'ANSA', 'Twitter', etc.
source_url      TEXT
original_text   TEXT NOT NULL
summary         TEXT                 -- AI-generated
topics          TEXT[]               -- extracted topics
sentiment       REAL                 -- -1.0 to 1.0
published_at    TIMESTAMPTZ NOT NULL
scraped_at      TIMESTAMPTZ NOT NULL
metadata        JSONB
created_at      TIMESTAMPTZ
```

### Dettaglio tabella `coherence_scores`
```sql
id              UUID PRIMARY KEY
politician_id   UUID REFERENCES politicians(id)
score_type      TEXT NOT NULL        -- 'party_alignment', 'self_consistency', 'vote_consistency'
score           REAL NOT NULL        -- 0.0 to 1.0
details         JSONB NOT NULL       -- spiegazione, esempi, evidenze
period_start    DATE
period_end      DATE
computed_at     TIMESTAMPTZ NOT NULL
model_version   TEXT                 -- versione modello/prompt AI
created_at      TIMESTAMPTZ
```

---

## API REST

### Endpoints pubblici (read-only)

```
GET /api/politicians                  — Lista con ricerca, filtri, paginazione
    ?q=nome&chamber=camera|senato&party=slug&page=1&limit=20&sort=name|coherence

GET /api/politicians/[slug]           — Profilo completo + coerenza + dichiarazioni recenti

GET /api/statements                   — Dichiarazioni filtrabili
    ?politician=slug&source_type=news|social|parliament&topic=economia&from=2024-01-01&to=2024-12-31

GET /api/parties                      — Lista partiti
GET /api/parties/[slug]               — Dettaglio partito + programma + membri

GET /api/coherence/[slug]             — Tutti i punteggi + storia + partito più vicino
GET /api/coherence/rankings           — Classifica coerenza
    ?type=party_alignment&chamber=camera&party=slug

GET /api/compare                      — Confronto tra politici
    ?politicians=slug1,slug2,slug3
```

### Endpoints interni (autenticati)

```
POST /api/webhooks/cron               — Trigger job schedulati
POST /api/admin/resync                — Force sync parlamentari
POST /api/admin/reanalyze/[slug]      — Ricalcolo coerenza per un politico
```

---

## Struttura Progetto

```
Politicase/
├── mockups/                          # Mockup HTML interattivi
│   └── index.html                    # 3 pagine: Home, Lista, Profilo
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (public)/                 # Route group pubbliche
│   │   │   ├── page.tsx              # Homepage
│   │   │   ├── politici/
│   │   │   │   ├── page.tsx          # Lista parlamentari
│   │   │   │   └── [slug]/page.tsx   # Profilo politico
│   │   │   ├── partiti/
│   │   │   │   ├── page.tsx          # Lista partiti
│   │   │   │   └── [slug]/page.tsx   # Dettaglio partito
│   │   │   ├── confronta/page.tsx    # Tool confronto
│   │   │   └── about/page.tsx        # Metodologia
│   │   ├── api/                      # REST API
│   │   │   ├── politicians/route.ts
│   │   │   ├── statements/route.ts
│   │   │   ├── coherence/route.ts
│   │   │   └── parties/route.ts
│   │   ├── layout.tsx
│   │   └── sitemap.ts               # Sitemap dinamica
│   ├── components/
│   │   ├── ui/                       # Primitivi shadcn/ui
│   │   ├── politicians/              # Card, lista, ricerca
│   │   ├── coherence/                # Gauge, radar, timeline storico
│   │   ├── statements/               # Card, timeline dichiarazioni
│   │   └── layout/                   # Header, footer, nav
│   ├── db/
│   │   ├── index.ts                  # Client Drizzle
│   │   ├── schema/                   # Definizioni tabelle
│   │   └── migrations/               # SQL migrazioni
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── claude.ts             # Client Claude API
│   │   │   ├── embeddings.ts         # Generazione embeddings
│   │   │   ├── coherence-analyzer.ts # Logica indici di coerenza
│   │   │   └── prompts.ts            # Template prompt versionati
│   │   ├── scrapers/
│   │   │   ├── camera-sparql.ts      # Client SPARQL Camera
│   │   │   ├── senato-sparql.ts      # Client SPARQL Senato
│   │   │   ├── openpolis.ts          # Client REST Openpolis
│   │   │   ├── ansa.ts              # Scraper news
│   │   │   └── social/              # Scraper social media
│   │   └── utils/                    # Slug, rate limiter, NLP italiano
│   └── workers/
│       ├── index.ts                  # Entrypoint BullMQ worker
│       ├── queues.ts                 # Definizioni code
│       └── jobs/                     # Job: sync, scrape, analyze
├── docker-compose.yml                # PostgreSQL, Redis, App, Worker
├── Dockerfile
├── .env.example
└── package.json
```

---

## Design System

### Palette Colori

| Ruolo | Colore | Hex |
|---|---|---|
| Primary | Blu istituzionale | `#1B365D` |
| Secondary | Rosso tricolore | `#C8102E` |
| Background | Avorio caldo | `#F4F1EC` |
| Surface | Bianco | `#FFFFFF` |
| Testo | Scuro | `#1A1A2E` |
| Coerente (alto) | Verde | `#059669` |
| Medio | Ambra | `#D97706` |
| Incoerente (basso) | Rosso | `#DC2626` |

I colori dei partiti usano i colori ufficiali: FDI `#F28C28`, PD `#E2001A`, M5S `#FFD700`, Lega `#008C45`, FI `#0087DC`, Azione `#1E3A5F`, AVS `#4CAF50`, IV `#FF69B4`.

### Tipografia
- **Inter** (400/500/600/700) — titoli e body
- Numeri tabulari per score e tabelle

### Componenti chiave
- **CoherenceGauge** — Anello SVG con gradiente rosso→ambra→verde, numero bold al centro, variazione ↑↓
- **PartyAlignmentRadar** — Grafico spider per tema (economia, sicurezza, sanità, etc.)
- **StatementTimeline** — Timeline verticale con nodi, colori per fonte, alert contraddizioni
- **PoliticianCard** — Avatar, nome, partito badge, mini barra coerenza

### Pagine mockuppate
I mockup interattivi sono disponibili in `mockups/index.html`:
1. **Homepage** — Hero, spotlight coerenza, barre partiti, feed dichiarazioni
2. **Lista Politici** — Griglia con ricerca, filtri camera/senato/partito
3. **Profilo Politico** — 3 gauge, partito più vicino, radar temi, timeline, storico

---

## Setup Locale

```bash
# 1. Dipendenze
npm install

# 2. Database (Docker, oppure un PostgreSQL 16 locale)
docker compose up -d

# 3. Schema
export DATABASE_URL=postgres://politicase:politicase@localhost:5432/politicase
npx drizzle-kit push

# 4. Ingestione dati reali (605 parlamentari da fonti ufficiali)
npm run seed

# 5. News ANSA → dichiarazioni
npm run ingest:news

# 6. Avvio
npm run dev
```

### Note sulle fonti

- **dati.senato.it** — SPARQL diretto. Il WAF rifiuta query con predicati variabili (`?s ?p ?o`): usare sempre IRI espliciti. I mandati con URI `C_*` sono mandati *Camera* di ex-senatori: filtrare su `S_*`.
- **dati.camera.it** — protetto da challenge JavaScript anti-bot (F5/Volterra): una proof-of-work SHA1 risolta automaticamente dal nostro `CameraClient`. Attenzione: il cookie di autorizzazione arriva in un redirect 301 — serve gestione manuale dei redirect.
- **ANSA RSS** — feed pubblico. Il matching dei politici è volutamente conservativo (nome+cognome, o solo cognome se univoco e non parola comune) per evitare false attribuzioni.

---

## Fasi di Sviluppo

### Fase 1: Foundation (Settimane 1-3) — ✅ COMPLETATA
- [x] Mockup grafico interattivo
- [x] Setup Docker Compose (PostgreSQL + pgvector)
- [x] Inizializzazione Next.js 15 + Tailwind
- [x] Schema database con Drizzle ORM (politicians, parties, statements, coherence_scores)
- [x] Client SPARQL per dati.camera.it (con solver challenge anti-bot) e dati.senato.it
- [x] Job sync parlamentari → database (`npm run seed`: 400 deputati + 205 senatori reali)
- [x] Pagina lista politici con ricerca/filtri + pagina profilo
- [ ] Client REST Openpolis (arricchimento social, opzionale)

**Deliverable:** ✅ Sito funzionante con 605 parlamentari in carica, dati live dalle fonti ufficiali

### Fase 2: Statement Ingestion (Settimane 4-6) — IN CORSO
- [x] Scraper news ANSA via RSS (`npm run ingest:news`)
- [x] Matching politici conservativo (anti falsi-positivi, testato su dati reali)
- [x] UI timeline dichiarazioni sul profilo politico + feed globale `/dichiarazioni`
- [x] Popolamento gruppi parlamentari e collegamento politici
- [ ] Altri feed (Repubblica, Corriere) + estrazione testo articolo completo
- [ ] Scraper trascrizioni parlamentari (il Senato espone `osr:interviene` → interventi in aula)
- [ ] Infrastruttura BullMQ + Redis per scheduling periodico

**Deliverable:** Profili con dichiarazioni aggregate da news e parlamento

### Fase 3: AI Analysis (Settimane 7-9)
- [ ] Integrazione Claude API con prompt versionati
- [ ] Setup pgvector + pipeline embeddings
- [ ] Ingestione manuale programmi partiti (PDF → testo strutturato)
- [ ] Calcolo Party Alignment Score
- [ ] Calcolo Self-Consistency Score
- [ ] Dashboard coerenza: gauge, grafici, spiegazioni
- [ ] Pagina classifica coerenza

**Deliverable:** Indici di coerenza funzionanti per tutti i parlamentari

### Fase 4: Votes + Vote Consistency (Settimane 10-11)
- [ ] Query SPARQL votazioni da dati.camera.it
- [ ] Ingestione votazioni nel database
- [ ] Calcolo Vote-Statement Consistency
- [ ] UI storico votazioni sul profilo
- [ ] Analisi "Partito più vicino" cross-party

**Deliverable:** Sistema coerenza completo con tutti e 3 gli indici

### Fase 5: Social Media + Polish (Settimane 12-14)
- [ ] Scraper Twitter/X (API o fallback)
- [ ] Scraper Facebook pagine pubbliche
- [ ] Pagina confronto side-by-side
- [ ] SEO: sitemap dinamica, OpenGraph, Schema.org (Person, Organization)
- [ ] Performance: caching, ISR, ottimizzazione immagini
- [ ] GDPR: privacy policy, cookie consent, informativa trattamento dati
- [ ] Audit accessibilità

**Deliverable:** Piattaforma feature-complete

### Fase 6: Production + Launch (Settimane 15-16)
- [ ] Deploy Vercel (web) + Railway/Fly.io (worker)
- [ ] PostgreSQL produzione (Neon/Supabase)
- [ ] Redis produzione (Upstash)
- [ ] Monitoring: Sentry, Vercel Analytics, Bull Board
- [ ] Load testing e tuning
- [ ] Documentazione API

**Deliverable:** Piattaforma live in produzione

---

## Costi Stimati (Produzione)

| Servizio | Costo/mese |
|---|---|
| Vercel Pro | $20 |
| Neon PostgreSQL (Scale) | $19-69 |
| Upstash Redis | $10-30 |
| Railway (worker) | $5-20 |
| Claude API (Sonnet) | $50-150 |
| Embedding API | $10-30 |
| Cloudflare R2 (storage) | $5-10 |
| Dominio + DNS | ~$1 |
| **Totale** | **~$120-330/mese** |

---

## GDPR e Note Legali

- Tutti i dati raccolti sono **pubblicamente disponibili**: atti parlamentari, post social pubblici, articoli di stampa
- Rientra nel **legittimo interesse** per finalità giornalistiche/di trasparenza (GDPR Art. 6(1)(f) e Art. 85)
- Privacy policy chiara con spiegazione dei dati raccolti
- Meccanismo di contatto per correzioni
- Nessun dato privato — solo dichiarazioni pubbliche e atti ufficiali
- Cookie consent per analytics

---

## Come Contribuire

Il progetto è nelle fasi iniziali. Se vuoi contribuire:

1. Guarda i mockup in `mockups/index.html`
2. Consulta le issue aperte
3. Leggi la roadmap nelle fasi di sviluppo sopra
4. Apri una PR!

---

## Licenza

MIT

---

*Progetto ideato e pianificato con l'assistenza di Claude (Anthropic).*
