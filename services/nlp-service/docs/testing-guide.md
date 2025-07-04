# NLP Service Tests

## 📋 Test disponibili

### 🩺 Health Check Test
Test base per verificare che il servizio sia operativo.

```bash
# Esegui dalla directory del servizio
cd services/nlp-service
python tests/test_health.py
```

### 🧪 Entity Extraction Test
Test completo per l'estrazione di entità dal testo.

```bash
# Esegui dalla directory del servizio
cd services/nlp-service
python tests/test_entity_extraction.py
```

### 🔍 Debug Entity Extraction
Test di debug per analizzare il processo di estrazione.

```bash
# Esegui dalla directory del servizio
cd services/nlp-service
python tests/debug_entity_extraction.py
```

### 🔗 Integration Test
Test di integrazione con API Gateway e altri servizi.

```bash
# Esegui dalla directory del servizio
cd services/nlp-service
python tests/test_integration.py
```

### 🌐 JavaScript Integration Tests
Test di integrazione end-to-end con API Gateway tramite HTTP.

```bash
# Installa dipendenze Node.js (solo la prima volta)
npm install

# Test di health check
npm run test:health

# Test di integrazione completi  
npm run test:integration

# Tutti i test JavaScript
npm run test:all
```

### 🔧 Utilizzo con pytest
Puoi anche eseguire i test con pytest:

```bash
# Esegui dalla directory del servizio
cd services/nlp-service
python -m pytest tests/ -v
```

## 🚀 Prerequisiti

### 1. Servizio attivo
Il servizio nlp-service deve essere in esecuzione su `http://localhost:8002`.

```bash
# Avvia il servizio (dalla root del progetto)
docker-compose up nlp-service
```

### 2. Dependencies
I test utilizzano httpx per le richieste HTTP:

```bash
pip install httpx
```

## 📊 Cosa testano

### Health Check Test
- ✅ Connessione al servizio
- ✅ Status del servizio generale
- ✅ Status del servizio di entity extraction
- ✅ Modelli spaCy caricati

### Entity Extraction Test
- ✅ Health check completo
- ✅ Endpoint tipi di entità
- ✅ Estrazione entità da query di esempio
- ✅ Validazione input
- ✅ Performance benchmark (target <3 secondi)

## 🎯 Risultati attesi

### Health Check
```
🩺 Testing NLP Service Health Check...
✅ Health check: 200
   Service: NLP Service
   Status: healthy

📊 Testing Entity Service Health Check...
✅ Entity health check: 200
   Service: EntityService
   Initialized: True
   Model loaded: True
   spaCy available: True
```

### Entity Extraction
```
🧪 Testing Entity Extraction Service...
✅ Extracted 4 entities in 12.28ms
   - location: 2
   - property_type: 1
   - price: 1

📊 Performance Summary:
   Average: 11.63ms
   ✅ Target met: 0.01s < 3.0s
```

## 🛠️ Troubleshooting

### Servizio non raggiungibile
```bash
# Verifica che il servizio sia attivo
curl http://localhost:8002/health
```

### Errori di import
```bash
# Assicurati di essere nella directory corretta
cd services/nlp-service
pwd
```

### Timeout sui test
I test hanno timeout di 30 secondi per operazioni normali, 10 secondi per health check.

## 🔄 Integrazione CI/CD

Questi test possono essere integrati in pipeline CI/CD:

```bash
# Script di test per CI
#!/bin/bash
cd services/nlp-service

# Test health check (rapido)
python tests/test_health.py

# Test completo (se health check passa)
if [ $? -eq 0 ]; then
    python tests/test_entity_extraction.py
fi
```

## 📝 Best Practices

1. **Esegui sempre health check prima dei test completi**
2. **Monitora i tempi di risposta** (target <3 secondi)
3. **Verifica i log del servizio** in caso di errori
4. **Testa con query realistiche** dal dominio immobiliare

---

*Test interni al servizio nlp-service seguendo le best practices architetturali* 🏗️
