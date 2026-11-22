\# Project: DalalPulse — Hybrid Local-GPU \& Cloud NSE Retail Sentiment Radar



\## 1. Architecture \& Operating Model

\- \*\*Purpose:\*\* Personal, zero-cost retail sentiment intelligence pipeline for NSE equities.

\- \*\*Hybrid Control Plane:\*\*

&#x20; - \*\*Local Compute (`workhorse` laptop):\*\* Windows 11 Pro/Home, AMD Ryzen 7 7840HS, 16GB RAM, NVIDIA RTX 4050 Laptop GPU (6GB VRAM), \~90GB free SSD space. Executes scraping, local GPU filtering/scoring, signal math, and selective frontier LLM calls.

&#x20; - \*\*Cloud State \& Control Plane (Supabase Free Tier):\*\* Stores user configuration (`pipeline\_config`), synthesized daily outputs (`daily\_signals`), and execution telemetry (`run\_logs`). `workhorse` communicates strictly via outbound HTTPS (no open router ports).

&#x20; - \*\*Mobile Frontend (Next.js PWA on Vercel Free Tier):\*\* Installable mobile web app protected by Supabase Auth to inspect daily briefs and remotely configure pipeline settings.



\## 2. Hard Hardware \& Storage Constraints

\- \*\*VRAM Cap:\*\* Never exceed \*\*4.5 GB VRAM\*\* peak usage (Windows desktop occupies \~0.8 GB of the 6 GB RTX 4050).

\- \*\*Sequential Model Loading:\*\* Load one GPU model stage at a time and strictly free VRAM (`del model; gc.collect(); torch.cuda.empty\_cache()`) before loading the next stage.

\- \*\*Prebuilt Wheels Only:\*\* Install PyTorch with CUDA 12.x (`--index-url https://download.pytorch.org/whl/cu124`) and prebuilt CUDA wheels for `llama-cpp-python` so Windows never attempts C++ source compilation.

\- \*\*SSD Hygiene:\*\* Store GGUF models in `C:\\models\\`. Keep raw scraped posts in local DuckDB (`worker/data/local\_cache.duckdb`) with automatic 30-day rolling deletion. Push only aggregated metrics and AI summaries to Supabase.



\## 3. Repository Structure

```text

dalalpulse/

├── AGENTS.md

├── .env                          # GEMINI\_API\_KEY, SUPABASE\_URL, SUPABASE\_ANON\_KEY, SUPABASE\_SERVICE\_ROLE\_KEY

├── supabase/

│   └── migrations/

│       └── 001\_init\_schema.sql   # pipeline\_config, daily\_signals, run\_logs + RLS policies

├── worker/

│   ├── requirements.txt

│   ├── config\_sync.py            # Fetches/updates pipeline\_config from Supabase

│   ├── ingest.py                 # Reddit JSON, ValuePickr .json, TradingQnA .json, Stocktwits API

│   ├── ticker\_mapper.py          # Maps NSE EQUITY\_L.csv symbols + retail aliases (e.g., RIL->RELIANCE, TaMo->TATAMOTORS)

│   ├── gpu\_funnel.py             # Stage 1: bge-small dedup -> Stage 2: FinBERT -> Stage 3: Qwen2.5-3B GGUF

│   ├── signals.py                # DuckDB SQL: 14d Mention Z-Score, Engagement-Weighted Sentiment, Persona Divergence

│   ├── synthesize.py             # Gemini 2.5 Flash structured JSON brief for top flagged tickers only

│   ├── pipeline.py               # End-to-end orchestrator + optional Telegram alert

│   ├── watcher.py                # Lightweight 60s polling loop checking trigger\_immediate\_run

│   └── setup\_windows.ps1         # Registers Task Scheduler (8:15 AM \& 4:15 PM IST) + background watcher

└── web/                          # Next.js 15 App Router + Tailwind + Supabase JS + PWA manifest

