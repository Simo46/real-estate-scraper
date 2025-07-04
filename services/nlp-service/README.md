# NLP Service

## 🎯 Scopo
Servizio per l'elaborazione del linguaggio naturale nel contesto immobiliare, con focus su:
- **Entity Extraction**: Estrazione di entità (luoghi, prezzi, tipologie)
- **Query Understanding**: Comprensione del linguaggio naturale
- **Structured Output**: Trasformazione in criteri di ricerca strutturati

## 🏗️ Architettura

### Struttura delle cartelle
```
services/nlp-service/
├── docs/                    # Documentazione interna
│   └── testing-guide.md    # Guida ai test
├── tests/                   # Test del servizio
│   ├── test_health.py      # Test di salute
│   ├── test_entity_extraction.py  # Test entity extraction
│   ├── test_integration.py # Test integrazione
│   └── debug_entity_extraction.py # Debug tools
├── models/                  # Modelli Pydantic
├── services/               # Logica business
├── controllers/            # Controller FastAPI
├── utils/                  # Utility functions
├── core/                   # Core functionality
├── config/                 # Configurazione
└── main.py                 # Entry point
```

## 🚀 Avvio del servizio

### Con Docker
```bash
# Dalla root del progetto
docker-compose up nlp-service
```

### Sviluppo locale
```bash
cd services/nlp-service
python -m pip install -r requirements.txt
python main.py
```

## 📊 Endpoints principali

### Health Check
- `GET /health` - Stato generale del servizio
- `GET /api/v1/entities/health` - Stato entity extraction

### Entity Extraction
- `POST /api/v1/entities/extract` - Estrazione entità
- `GET /api/v1/entities/types` - Tipi di entità supportati
- `POST /api/v1/entities/validate` - Validazione input
- `POST /api/v1/entities/debug` - Debug estrazione

## 🧪 Testing

Consulta la [guida ai test](docs/testing-guide.md) per informazioni dettagliate sui test disponibili.

### Test rapidi
```bash
# Health check
python tests/test_health.py

# Test completo
python tests/test_entity_extraction.py
```

## 🧪 Test del servizio

### Test Python
```bash
# Test di salute
python tests/test_health.py

# Test entity extraction
python tests/test_entity_extraction.py

# Test di integrazione
python tests/test_integration.py

# Debug entity extraction
python tests/debug_entity_extraction.py
```

### Test JavaScript (Integration)
```bash
# Installa dipendenze Node.js
npm install

# Test di health check
npm run test:health

# Test di integrazione completi
npm run test:integration

# Tutti i test JS
npm run test:all
```

### Test manuali
```bash
# Health check rapido
curl http://localhost:8002/health

# Test entity extraction
curl -X POST http://localhost:8002/api/v1/entities/extract \
  -H "Content-Type: application/json" \
  -d '{"text": "Casa Milano 2 locali €300k"}'
```

## 🔧 Configurazione

### Variabili d'ambiente
- `NLP_SERVICE_HOST`: Host del servizio (default: localhost)
- `NLP_SERVICE_PORT`: Porta del servizio (default: 8002)
- `SPACY_MODEL`: Modello spaCy da utilizzare (default: it_core_news_sm)

### Dipendenze principali
- FastAPI per l'API REST
- spaCy per NLP
- Pydantic per validazione
- httpx per test HTTP

## 📈 Performance

### Target di performance
- ⚡ **Entity extraction**: <3 secondi per query
- 🎯 **Accuracy**: >90% per entity extraction
- 📊 **Throughput**: 100+ richieste/minuto

### Monitoring
- Health check endpoints per monitoraggio
- Logging strutturato per debugging
- Metriche di performance integrate

## 🔄 Sviluppo

### Workflow di sviluppo
1. Implementa nuove funzionalità
2. Aggiungi test corrispondenti
3. Esegui test suite completa
4. Verifica performance
5. Aggiorna documentazione

### Best practices
- Segui la struttura modulare esistente
- Aggiungi test per ogni nuova funzionalità
- Mantieni la compatibilità API
- Documenta le modifiche

---

*Parte del sistema Real Estate Scraper - Phase 4: AI Enhancement Layer* 🏠
