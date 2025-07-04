# Ollama Service

## 🎯 Descrizione
Servizio per l'integrazione con Ollama, un modello di linguaggio locale per l'analisi NLP e AI nel progetto Real Estate Scraper.

## 📁 Struttura
```
services/ollama/
├── docs/           # Documentazione del servizio
│   └── README.md   # Guida ai test
├── tests/          # Test di integrazione e performance
│   ├── ollama-monitor.sh
│   ├── ollama-performance-monitor.js
│   ├── test-ollama-integration.js
│   └── test-ollama-integration-complete.js
├── Dockerfile      # Container configuration
├── init-ollama.sh  # Script di inizializzazione
└── package.json    # Dipendenze Node.js
```

## 🚀 Avvio rapido

### 1. Installazione dipendenze
```bash
cd services/ollama
npm install
```

### 2. Avvio servizio
```bash
# Dalla root del progetto
docker-compose up ollama
```

### 3. Test di integrazione
```bash
npm run test:integration
```

## 🧪 Test disponibili

Per la guida completa ai test, consulta [`docs/README.md`](docs/README.md).

### Test principali
- **Integration Tests**: Test di connessione e integrazione
- **Performance Tests**: Monitoring performance e risorse
- **System Monitoring**: Monitoring continuo del sistema

```bash
# Esegui tutti i test
npm run test:all

# Test specifici
npm run test:integration
npm run test:performance
npm run monitor
```

## 🔧 Configurazione

Il servizio Ollama è configurato per:
- **Porta**: `11434` (standard Ollama)
- **Modelli**: Configurati via Docker
- **Integrazione**: API Gateway su porta `3000`

## 📊 Architettura

Il servizio Ollama fornisce:
- **NLP Processing**: Analisi testo e entità
- **AI Integration**: Modelli di linguaggio locali
- **Performance Monitoring**: Metriche e alerting
- **API Gateway Integration**: Endpoint RESTful

---

*Servizio autonomo con dipendenze localizzate seguendo le best practices architetturali* 🏗️
