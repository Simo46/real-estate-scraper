# Python Scraper Service

## 🎯 Panoramica

Il **Python Scraper Service** è il motore di scraping dell'architettura "Personal Real Estate Assistant". Raccoglie, processa e normalizza dati immobiliari da Immobiliare.it con supporto multi-tenant completo e processing pipeline avanzato.

## 🚀 Quick Start

### **Avvio Rapido**
```bash
# Avvio servizio
docker compose up python-scraper

# Verifica stato
curl http://localhost:8002/health

# Test pipeline completa
python test_integration_pipeline.py
```

### **API Endpoints Principali**
- `POST /api/scraping/v2/execute-search` - Esecuzione ricerca
- `GET /api/scraping/v2/results/{id}` - Recupero risultati
- `GET /api/health/detailed` - Status dettagliato

## 🏗️ Architettura

### **Design Pattern**
Microservice con **Pipeline Processing** pattern:
- **API Layer**: FastAPI con middleware multi-tenant
- **Processing Pipeline**: Mapping → Geolocation → Images → Quality
- **Integration Layer**: Tenant isolation e error handling

### **Componenti Core**
- **SearchResultMapper**: Trasformazione dati scraped → SearchResult
- **GeolocationProcessor**: Normalizzazione location italiane  
- **ImageValidator**: Quality assessment immagini
- **TenantDataIsolation**: Isolamento completo dati per tenant

## � Documentazione Completa

La documentazione è organizzata per argomenti specifici:

### **🎓 Per Nuovi Sviluppatori**
- **[01-onboarding.md](docs/01-onboarding.md)** - Guida onboarding da zero a produttivo in 30 minuti

### **🔧 Riferimenti Tecnici**
- **[02-api-reference.md](docs/02-api-reference.md)** - API endpoints, parametri, response formats
- **[03-architecture.md](docs/03-architecture.md)** - Deep dive architettura e design patterns
- **[04-tenant-system.md](docs/04-tenant-system.md)** - Sistema multi-tenant e isolamento dati
- **[05-data-pipeline.md](docs/05-data-pipeline.md)** - Pipeline processing e trasformazione dati

### **🧪 Development & Testing**
- **[06-testing-guide.md](docs/06-testing-guide.md)** - Testing strategy, unit tests, integration tests
- **[07-development-guide.md](docs/07-development-guide.md)** - Setup ambiente, debugging, best practices

## 💡 Principi Architetturali

- **Metadata-Only**: Nessuna persistenza locale, solo metadata in memoria
- **Multi-Tenant**: Isolamento completo dati per tenant
- **Real-Time Processing**: On-demand senza cache o pre-processing  
- **Quality-First**: Scoring automatico e AI insights per ogni risultato

## 🔄 Come Funziona

### **Flusso di Elaborazione**
1. **Request API** con criteri ricerca e tenant context
2. **Scraping** dati da Immobiliare.it  
3. **Pipeline Processing** (mapping → geolocation → images → quality)
4. **AI Insights** generation con scoring automatico
5. **Response** con SearchResult normalizzati

### **Example API Usage**
```bash
# Esecuzione ricerca
curl -X POST http://localhost:8002/api/scraping/v2/execute-search \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "saved_search_id": "search_123",
    "search_criteria": {
      "location": "milano",
      "property_type": "apartment",
      "max_price": 500000
    },
    "platform": "immobiliare_it"
  }'

# Recupero risultati  
curl -H "Authorization: Bearer <jwt-token>" \
  http://localhost:8002/api/scraping/v2/results/{execution_id}
```

## 🧪 Testing

### **Test Rapidi**
```bash
# Test pipeline completa
python test_integration_pipeline.py

# Test multi-tenant isolation
python test_multitenant_api.py

# Test coverage completo
pytest tests/ -v --cov=services/
```

### **Test Specifici per Componente**
```bash
python test_data_pipeline.py        # Data mapping
python test_geolocation_service.py  # Location processing  
python test_image_validator.py      # Image validation
```

## �️ Setup Development

### **Local Development**
```bash
cd services/python-scraper
python -m venv .venv && source .venv/bin/activate
pip install -r requirements/dev.txt
python app.py
```

### **Docker Development**
```bash
docker compose up python-scraper -d
docker compose logs -f python-scraper
```

## 📊 Monitoring

### **Health Checks**
- **Basic**: `GET /health` (no auth)
- **Detailed**: `GET /api/health/detailed` (component status + metrics)

### **Performance Targets**
- **Processing Time**: <2.5s per property
- **Success Rate**: >95% per requests
- **Memory Usage**: <512MB peak

## 🔐 Security

- **JWT Authentication**: Tutti gli endpoint protetti
- **Multi-Tenant Isolation**: Separazione completa dati per tenant
- **Input Validation**: Pydantic schemas per request/response
- **Rate Limiting**: Per-tenant request limits

---

**📖 Per informazioni dettagliate, consulta la documentazione nella cartella `/docs/`. Inizia da [01-onboarding.md](docs/01-onboarding.md) se sei un nuovo sviluppatore.**
