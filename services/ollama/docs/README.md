# Ollama Service Tests

## 📋 Test disponibili

### 🔗 Integration Tests
Test di integrazione con API Gateway e servizi correlati.

```bash
# Esegui dalla directory del servizio
cd services/ollama
npm install
npm run test:integration
```

### 🔗 Complete Integration Tests
Test di integrazione completi end-to-end.

```bash
npm run test:integration:complete
```

### ⚡ Performance Monitoring
Test di performance e monitoring delle risorse.

```bash
npm run test:performance
```

### 📊 System Monitoring
Script di monitoring continuo del sistema Ollama.

```bash
npm run monitor
```

### 🧪 Test Suite Completa
Esegue tutti i test in sequenza.

```bash
npm run test:all
```

## 🚀 Prerequisiti

### 1. Servizio Ollama attivo
Il servizio Ollama deve essere in esecuzione su `http://localhost:11434`.

```bash
# Avvia Ollama (dalla root del progetto)
docker-compose up ollama
```

### 2. API Gateway attivo
Per i test di integrazione, l'API Gateway deve essere attivo su `http://localhost:3000`.

```bash
# Avvia API Gateway (dalla root del progetto)
docker-compose up api-gateway
```

## 📊 Cosa testano

### Integration Tests
- ✅ Connessione diretta a Ollama
- ✅ Health check del servizio
- ✅ Disponibilità modelli
- ✅ Integrazione con API Gateway
- ✅ Performance baseline

### Performance Tests
- ✅ Tempi di risposta
- ✅ Utilizzo memoria
- ✅ Throughput richieste
- ✅ Stabilità sotto carico

### Monitoring
- ✅ Status servizio in tempo reale
- ✅ Utilizzo risorse
- ✅ Log degli errori
- ✅ Alerting automatico

## 🎯 Risultati attesi

### Integration Tests
```
🧪 Starting Ollama Integration Tests
✅ Ollama health check: 200
✅ Available models: 1
✅ API Gateway health: 200
✅ Response time: 150ms
📊 Test Results: 4/4 passed
```

### Performance Tests
```
⚡ Ollama Performance Monitor
📊 Memory usage: 2.1GB
🔄 Active connections: 5
⏱️  Average response time: 120ms
✅ All metrics within normal range
```

## 🛠️ Troubleshooting

### Ollama non raggiungibile
```bash
# Verifica che Ollama sia attivo
curl http://localhost:11434/
```

### Modelli non disponibili
```bash
# Lista modelli disponibili
curl http://localhost:11434/api/tags
```

### Errori di integrazione
```bash
# Verifica logs
docker-compose logs ollama
docker-compose logs api-gateway
```

## 🔄 Integrazione CI/CD

I test possono essere integrati in pipeline CI/CD:

```bash
#!/bin/bash
# CI script per test Ollama
cd services/ollama

# Installa dipendenze
npm ci

# Esegui test suite
npm run test:all

# Verifica performance
npm run test:performance
```

---

*Test interni al servizio Ollama seguendo le best practices architetturali* 🏗️
