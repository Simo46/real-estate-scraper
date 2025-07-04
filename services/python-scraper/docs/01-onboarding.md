# Python Scraper Service - Onboarding per Sviluppatori

## 🎯 Benvenuto nel Team!

Questa guida ti porterà da zero a produttivo sul **Python Scraper Service** in 30 minuti. Il servizio è il motore di scraping della piattaforma "Personal Real Estate Assistant".

## 📋 Panoramica del Servizio

### **Cosa Fa**
- **Scraping automatico** di dati immobiliari da Immobiliare.it
- **Normalizzazione e processing** in tempo reale  
- **Multi-tenant isolation** completo
- **API endpoints** per integrazione con frontend

### **Cosa NON Fa**
- ❌ Non memorizza dati permanentemente (metadata-only)
- ❌ Non gestisce autenticazione utenti (delegata all'API Gateway)
- ❌ Non fa deduplicazione complessa (rimandato a phase 3)

## 🚀 Quick Start (5 minuti)

### **1. Setup Ambiente**
```bash
# Clone repository (se non già fatto)
git clone [repository-url]
cd real-estate-scraper/services/python-scraper

# Avvio stack completo
docker compose up -d

# Verifica servizio attivo
curl http://localhost:8002/health
# Risposta attesa: {"status": "healthy"}
```

### **2. Primo Test**
```bash
# Test pipeline completa
python test_integration_pipeline.py

# Risposta attesa: tutti i test ✓ PASS
```

### **3. Test API Multi-Tenant**
```bash
# Test isolamento dati
python test_multitenant_api.py

# Risposta attesa: verifica isolation ✓ OK
```

**🎉 Se tutti i test passano, sei pronto per sviluppare!**

## 🏗️ Architettura in 5 Minuti

### **Design Pattern**
Il servizio segue il pattern **"Microservice with Pipeline Processing"**:

```
API Request → Middleware Stack → Processing Pipeline → Normalized Response
     ↓              ↓                    ↓                    ↓
[Auth+Tenant] → [Data Pipeline] → [Quality Scoring] → [SearchResult]
```

### **Tre Layer Principali**

#### **1. API Layer** (`api/`)
- **FastAPI** con middleware per auth/tenant/logging
- **Background tasks** per processing asincrono
- **Error handling** robusto

#### **2. Processing Pipeline** (`services/`)
- **DataPipeline**: Trasformazione dati scraped
- **GeolocationService**: Normalizzazione location italiane
- **ImageValidator**: Quality assessment immagini

#### **3. Integration Layer** (`core/`)
- **TenantIsolation**: Separazione dati per tenant
- **Monitoring**: Health checks e metrics
- **Error Recovery**: Retry logic e fallbacks

### **Filosofia: Real-Time + Stateless**
- **Nessuna persistenza locale**: solo metadata in memoria
- **Processing on-demand**: niente cache o pre-processing
- **Tenant isolation**: dati completamente separati

## 📁 Struttura Codice

### **Directory Layout**
```
python-scraper/
├── api/                    # FastAPI endpoints
│   ├── routes/            # API routes
│   ├── middleware/        # Auth, tenant, logging
│   └── models.py          # Pydantic schemas
├── config/                # Configurazione ambiente
├── core/                  # Componenti base
├── services/              # Business logic
│   ├── data_pipeline.py   # Mapping dati
│   ├── geolocation_service.py
│   └── image_validator.py
├── scrapers/              # Scraping specifico
└── middleware/            # Middleware condiviso
```

### **File Chiave da Conoscere**
- **`app.py`**: Entry point FastAPI
- **`api/routes/multitenant_scraping.py`**: API endpoints principali
- **`services/data_pipeline.py`**: Core business logic
- **`test_integration_pipeline.py`**: Test end-to-end

## 🛠️ Strumenti di Sviluppo

### **Setup Development Environment**
```bash
# Ambiente virtuale Python
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# o .venv\Scripts\activate  # Windows

# Installazione dipendenze
pip install -r requirements/dev.txt

# Avvio locale per development
python app.py
# Server disponibile su http://localhost:8002
```

### **Testing Strategy**
```bash
# Test specifici per componente
python test_data_pipeline.py        # Data mapping
python test_geolocation_service.py  # Location processing
python test_image_validator.py      # Image validation

# Test integrazione completa
python test_integration_pipeline.py # End-to-end pipeline
python test_multitenant_api.py     # Multi-tenant isolation

# Test con pytest (opzionale)
pytest tests/ -v
```

### **Debugging Tips**
```bash
# Logs strutturati real-time
docker compose logs -f python-scraper

# Debug specifico errori
docker compose logs python-scraper | grep ERROR

# Health check dettagliato
curl http://localhost:8002/api/health/detailed
```

## 📚 Patterns di Codice

### **1. Dependency Injection**
Il servizio usa FastAPI dependency injection:

```python
# In api/dependencies.py
async def get_current_user(token: str = Depends(oauth2_scheme)):
    # Validation JWT token
    return user

# Uso in routes
@router.post("/execute-search")
async def execute_search(
    user: dict = Depends(get_current_user),
    tenant_ctx: dict = Depends(get_tenant_context)
):
    # Business logic con user e tenant context
```

### **2. Error Handling Pattern**
```python
# Pattern standard per error handling
try:
    result = await process_data(input_data)
    return {"status": "success", "data": result}
except ValidationError as e:
    logger.error("Validation failed", error=str(e))
    raise HTTPException(status_code=400, detail="Invalid input")
except Exception as e:
    logger.error("Unexpected error", error=str(e))
    raise HTTPException(status_code=500, detail="Internal error")
```

### **3. Multi-Tenant Isolation**
```python
# Ogni operazione include tenant context
async def filter_results_by_tenant(results: List[dict], tenant_id: str):
    return [r for r in results if r.get('tenant_id') == tenant_id]

# Automatic context injection
tenant_ctx = {"tenant_id": user.tenant_id, "user_id": user.id}
```

## 🎨 Code Style Guidelines

### **Naming Conventions**
- **Functions**: `snake_case` (es. `process_search_results`)
- **Classes**: `PascalCase` (es. `SearchResultMapper`)
- **Constants**: `UPPER_SNAKE_CASE` (es. `MAX_RESULTS_PER_PAGE`)
- **Files**: `snake_case.py` (es. `data_pipeline.py`)

### **Docstring Format**
```python
async def process_property_data(property_data: dict, tenant_id: str) -> dict:
    """
    Processa dati proprietà scraped e applica normalizzazione.
    
    Args:
        property_data: Dati raw dalla scraping
        tenant_id: ID tenant per isolation
        
    Returns:
        dict: Dati normalizzati nel formato SearchResult
        
    Raises:
        ValidationError: Se dati input non validi
        ProcessingError: Se errore durante processing
    """
```

### **Logging Best Practices**
```python
import structlog
logger = structlog.get_logger()

# Logging strutturato con context
logger.info(
    "Processing started",
    tenant_id=tenant_id,
    search_id=search_id,
    property_count=len(properties)
)
```

## 🔄 Workflow di Sviluppo

### **1. Feature Development**
```bash
# Crea branch per feature
git checkout -b feature/new-processing-logic

# Sviluppa e testa localmente
python test_integration_pipeline.py

# Commit con message descrittivo
git commit -m "Add: nuovo algoritmo scoring qualità"
```

### **2. Testing Workflow**
```bash
# Test durante sviluppo
python test_data_pipeline.py  # Test componente specifico

# Test before commit
python test_integration_pipeline.py  # Test end-to-end
python test_multitenant_api.py      # Test isolation

# Test completo
pytest tests/ -v --cov=services/
```

### **3. Deployment e Monitoring**
```bash
# Build e deploy
docker compose build python-scraper
docker compose up -d python-scraper

# Verifica deployment
curl http://localhost:8002/health
curl http://localhost:8002/api/health/detailed

# Monitor logs post-deploy
docker compose logs -f python-scraper
```

## 🎓 Next Steps

### **Dopo questo Onboarding**

1. **📖 Leggi Documentazione Specifica**:
   - `02-api-reference.md` - API endpoints e contracts
   - `03-architecture.md` - Deep dive architettura
   - `04-tenant-system.md` - Multi-tenant implementation

2. **🛠️ Prova Modifiche Semplici**:
   - Aggiungi nuovo campo in `SearchResult`
   - Modifica scoring algorithm in `data_pipeline.py`
   - Aggiorna validation rules

3. **🚀 Lavora su Task Esistenti**:
   - Controlla `/docs/task_da_implementare_successivamente.md`
   - Scegli task allineato al tuo skill level

### **Risorse e Support**

- **📋 Issues GitHub**: Per bug reports e feature requests
- **📖 Docs folder**: Documentazione completa e aggiornata
- **🧪 Test files**: Esempi pratici di utilizzo
- **💬 Team Chat**: Per domande e supporto

---

**🚀 Sei pronto per contribuire! Benvenuto nel team di sviluppo del Python Scraper Service.**
