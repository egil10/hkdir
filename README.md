# HK-dir Grunndata — Søkertall

En moderne dashboard for utforsking av søkertall fra Samordna opptak til norske universiteter, høgskoler og fagskoler (2021–2026).

**Datakilde:** [HK-dir — Søkertall fra Samordna opptak](https://hkdir.no/sokertall-fra-samordna-opptak-til-nedlasting#Universitet%20og%20h%C3%B8gskoler)

## Funksjoner

- **Oversikt** med KPI-kort, trendlinjer, topp-10 studier og vekstsammenligning
- **Utforsk** – fritekst-søk, filtre (institusjon/fagområde/sted), sortering på alle nøkkeltall og vekst
- **Sammenlign** inntil 6 studier side om side med fire matchende chart
- **Institusjoner** – alle 27 UH + 35 fagskoler med mini-spark per institusjon
- **Fagområder** – heatmap med indeksert utvikling per fagområde
- **Detaljpanel** per studie med full historikk og tabell
- Sektorbryter mellom *Universitet og høgskole* og *Fagskoler*

## Teknologi

- Vanilla JS + ECharts + Lucide icons
- Helt statisk (ingen byggesteg for frontend)
- ~570 KB datapakke

## Datapakke

Råfilene (xlsx) ligger i `data/` og kompileres til én JSON-fil:

```bash
python build_data.py
```

## Lokal utvikling

```bash
python -m http.server 8000
```

Åpne http://localhost:8000

## Deploy

Statisk, klar for Vercel. `vercel.json` setter cache-headere for data og assets.

```bash
vercel deploy --prod
```

---

Visualisert for utforskning — ikke en offisiell HK-dir-tjeneste.
