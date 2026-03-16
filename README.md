# Word in Context · prototipo web

Prototipo statico per la consultazione di epigrafi preromane di Puglia tramite **homepage introduttiva**, **WebGIS**, **galleria immagini** e **viewer di sovrapposizione**.

## Avvertenza importante

I dati inclusi nel repository sono **dati di mock-up**: riproducono in modo fedele la **struttura del database**, i campi, le relazioni tra entità e la logica di visualizzazione prevista dal progetto, ma **non rappresentano dati reali**. Il repository è pensato per dimostrazione, progettazione dell'interfaccia e sviluppo del modello digitale.

## Contenuti del prototipo

- `index.html` — homepage introduttiva del progetto
- `webgis.html` — interfaccia principale con mappa, filtri, grafici e dettaglio record
- `gallery.html` — galleria globale delle immagini collegate alle epigrafi
- `viewer.html` — viewer per la consultazione e la sovrapposizione di immagini pertinenti allo stesso oggetto
- `css/` — fogli di stile della home e dell'applicativo
- `js/` — logica di caricamento dati, filtri, visualizzazioni e viewer
- `data/` — dataset dimostrativi (`iscrizioni.geojson`, `province.geojson`, `images.json`, immagini di esempio)
- `images/` — loghi e risorse grafiche della homepage

## Funzionalità principali

### Homepage
- introduzione accessibile per pubblico ampio e specialistico
- metriche dinamiche sul corpus
- timeline semplificata
- inquadramento geografico con preview Leaflet delle province
- distinzione concettuale tra supporto epigrafico e testo
- sezione crediti

### WebGIS
- mappa Leaflet con marker e cluster
- filtri dinamici sui principali campi del dataset
- pannello statistico laterale
- schede di dettaglio del record selezionato
- accesso diretto alle immagini collegate

### Galleria e viewer
- galleria globale delle immagini con ricerca testuale
- scheda viewer dedicata a ogni immagine
- sovrapposizione di più immagini riferite allo stesso oggetto
- cambio ordine dei livelli e confronto visivo tramite tendina

## Requisiti minimi

Il progetto è interamente statico e non richiede backend. Per funzionare correttamente deve però essere servito tramite un piccolo server locale, perché i file JSON e GeoJSON vengono caricati con `fetch()`.

## Avvio locale

```bash
cd nome-cartella-del-progetto
python3 -m http.server 8000
```

Apri poi nel browser:

```text
http://localhost:8000/
```

## Pubblicazione su GitHub Pages

1. carica il contenuto del progetto in un repository GitHub
2. vai in **Settings → Pages**
3. seleziona la branch di pubblicazione e la cartella root
4. salva e attendi la generazione del sito

La homepage pubblicata sarà `index.html`, mentre le altre sezioni resteranno raggiungibili da:
- `webgis.html`
- `gallery.html`
- `viewer.html`

## Personalizzazione dei dati

Per adattare il prototipo ai dati reali del progetto puoi sostituire i file nella cartella `data/` mantenendo la stessa logica dei campi.

### Dataset principali
- `data/iscrizioni.geojson`
- `data/province.geojson`
- `data/images.json`

### Campi usati dal frontend
A seconda della schermata, l'interfaccia utilizza campi come:
- identificativo del record (`id`)
- lingua
- provincia, comune, località, sito
- fase e intervallo cronologico
- informazioni sul supporto
- testo originale, trascrizione, traduzione
- riferimenti bibliografici
- collegamenti tra immagini e oggetti (`object_id`)
- coordinate di controllo per l'allineamento delle immagini (`coord`)

## Note progettuali

Questo repository documenta una fase di sviluppo del progetto **Word in Context** e serve come base per:
- progettazione dell'esperienza utente
- validazione del modello dati
- sperimentazione di relazioni tra testo, supporto, geografia e immagini
- future estensioni, tra cui viewer più avanzati e integrazione di modelli 3D

## Crediti

- **PasaP med · Università degli Studi di Bari Aldo Moro** — contesto istituzionale del progetto
- **Federica Fanizzi** — responsabile scientifica
- **Erasmo di Fonso** — curatela e sviluppo della parte digitale
