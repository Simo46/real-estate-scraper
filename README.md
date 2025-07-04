# Real Estate Scraper - Consulente Immobiliare AI-Powered

## 🎯 Panoramica
**Assistente immobiliare intelligente** che utilizza AI per analizzare il mercato immobiliare e fornire insights personalizzati. Sistema multi-tenant per agenzie immobiliari con analisi potenziata da intelligenza artificiale.

## 🏗️ Architettura Microservizi

### **Servizi Implementati**
- **🔐 API Gateway** (`services/api-gateway/`) - Autenticazione, autorizzazione e routing
- **🐍 Python Scraper** (`services/python-scraper/`) - Data pipeline e scraping intelligente
- **🧠 NLP Service** (`services/nlp-service/`) - Elaborazione linguaggio naturale con spaCy
- **🤖 Ollama Service** (`services/ollama/`) - Modelli AI locali (Llama 3.2)

### **Infrastruttura**
- **🐘 PostgreSQL** - Database principale con schema multi-tenant
- **🍃 MongoDB** - Storage metadata AI e analytics
- **🔴 Redis** - Cache e session management
- **🐳 Docker** - Containerizzazione completa

## 🚀 Avvio Rapido

### **Prerequisiti**
- Docker e Docker Compose
- Node.js 18+ (per development)
- Python 3.11+ (per development)

### **Setup Sviluppo**
```bash
# Clone repository
git clone <repository-url>
cd real-estate-scraper

# Avvia tutti i servizi
docker-compose up -d

# Verifica che tutto funzioni
curl http://localhost:3000/health  # API Gateway
curl http://localhost:8002/health  # NLP Service
curl http://localhost:11434/      # Ollama Service
```

## 🧪 Testing

### **Test Servizi AI**
```bash
# Test NLP Service
cd services/nlp-service
python tests/test_entity_extraction.py
npm run test:health

# Test Ollama Service
cd services/ollama
npm run test:all
```

### **Test Integrazione**
```bash
# Test completi end-to-end
cd services/nlp-service
npm run test:integration
```

## 📊 Funzionalità AI

### **🔍 Analisi Linguaggio Naturale**
- Estrazione entità immobiliari (luoghi, prezzi, dimensioni)
- Analisi query in linguaggio naturale
- Confidence scoring per ogni entità
- Supporto completo per italiano

### **🤖 Modelli AI Locali**
- Llama 3.2:3b per elaborazione avanzata
- Analisi sentiment e contesto
- Generazione insights personalizzati
- Performance ottimizzata per laptop (16GB RAM)

### **📈 Market Intelligence**
- Analisi trend di mercato
- Scoring qualità immobili
- Raccomandazioni personalizzate
- Report automatici con AI

## 🔧 Sviluppo

### **Struttura Progetto**
```
real-estate-scraper/
├── services/
│   ├── api-gateway/     # Node.js + Express + TypeScript
│   ├── python-scraper/  # Python + Scrapy + MongoDB
│   ├── nlp-service/     # FastAPI + spaCy + Ollama
│   └── ollama/          # Ollama + Llama 3.2
├── infrastructure/
│   └── databases/       # PostgreSQL + MongoDB configs
├── docs/               # Documentazione progetto
└── scripts/           # Automation scripts
```

### **Workflow Git**
```bash
# Sviluppo feature
git flow feature start feature-name
git flow feature finish feature-name

# Testing locale
./scripts/dev-setup.sh
```

## 📚 Documentazione

- **[Panoramica Architetturale](docs/02-architecture-overview.md)** - Architettura completa
- **[Workflow Sviluppo](docs/03-development-workflow.md)** - Processi di sviluppo
- **[Guida Onboarding](docs/01-onboarding-guide.md)** - Setup iniziale
- **[Implementation Todo](docs/10-implementation-todolist.md)** - Roadmap sviluppo

### **Documentazione Servizi**
- **[API Gateway](services/api-gateway/README.md)** - Autenticazione e routing
- **[NLP Service](services/nlp-service/README.md)** - Elaborazione linguaggio naturale
- **[Ollama Service](services/ollama/README.md)** - Modelli AI locali
- **[Python Scraper](services/python-scraper/README.md)** - Data pipeline

## 🎯 Stato Progetto

### **✅ Completato**
- **Phase 1**: API Gateway con autenticazione completa
- **Phase 2**: Python Scraper con pipeline dati
- **Phase 4**: AI Foundation con NLP ed Ollama
- **Refactoring**: Architettura servizi modulare

### **🔄 In Corso**
- **Phase 4**: Query Understanding Engine
- **Pattern Matching**: Logiche condizionali
- **Structured Output**: Trasformazione criteri ricerca

### **📋 Prossimi Step**
- Computer Vision per analisi immagini
- Report Generation Engine
- Integration testing completo
- Production deployment

## 🚀 Obiettivo Finale

**Trasformare il sistema in un consulente immobiliare AI-powered** dove l'AI non è un'aggiunta, ma **IL sistema**. Ogni componente è progettato per massimizzare il valore dell'intelligenza artificiale.

---

*Consulente Immobiliare AI per il futuro del Real Estate* 🏠🤖