# API Reference - Python Scraper Service

## 📋 Overview

Il Python Scraper Service espone API RESTful per l'esecuzione di scraping immobiliare con supporto multi-tenant completo. Tutte le API richiedono autenticazione JWT e implementano isolamento automatico dei dati per tenant.

## 🔐 Autenticazione

### **JWT Token Requirements**

Tutte le API richiedono un JWT token valido nell'header:

```http
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

### **Token Claims Richiesti**
```json
{
  "user_id": "user_123",
  "tenant_id": "tenant_456", 
  "role": "user|admin",
  "exp": 1735737600,
  "iat": 1735651200
}
```

### **Endpoint Publici**
- `GET /health` - Health check basic (no auth required)
- `GET /api/health/detailed` - Health check completo (no auth required)

## 🚀 Endpoint API

### **1. Execute Search**

Avvia una nuova esecuzione di scraping con processing pipeline completo.

#### **Request**
```http
POST /api/scraping/v2/execute-search
```

#### **Headers**
```http
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

#### **Request Body**
```json
{
  "saved_search_id": "search_123",
  "search_criteria": {
    "location": "milano",
    "property_type": "apartment",
    "min_price": 300000,
    "max_price": 800000,
    "min_rooms": 2,
    "max_rooms": 4
  },
  "platform": "immobiliare_it",
  "max_results": 50
}
```

#### **Body Parameters**
| Campo | Tipo | Richiesto | Descrizione |
|-------|------|-----------|-------------|
| `saved_search_id` | string | ✓ | ID della ricerca salvata |
| `search_criteria` | object | ✓ | Criteri di ricerca |
| `search_criteria.location` | string | ✓ | Città o zona (es. "milano", "roma centro") |
| `search_criteria.property_type` | string | ✓ | Tipo proprietà ("apartment", "house", "villa") |
| `search_criteria.min_price` | integer | - | Prezzo minimo in EUR |
| `search_criteria.max_price` | integer | - | Prezzo massimo in EUR |
| `search_criteria.min_rooms` | integer | - | Numero minimo stanze |
| `search_criteria.max_rooms` | integer | - | Numero massimo stanze |
| `platform` | string | ✓ | Platform target ("immobiliare_it") |
| `max_results` | integer | - | Max risultati (default: 20, max: 100) |

#### **Response 202 - Accepted**
```json
{
  "search_execution_id": "exec_abc123",
  "tenant_id": "tenant_456",
  "status": "pending",
  "estimated_completion": "2025-01-01T10:05:00Z",
  "search_criteria": {
    "location": "milano",
    "property_type": "apartment"
  },
  "created_at": "2025-01-01T10:00:00Z"
}
```

#### **Response Fields**
| Campo | Descrizione |
|-------|-------------|
| `search_execution_id` | ID univoco per tracking esecuzione |
| `tenant_id` | ID tenant (per validation) |
| `status` | Stato esecuzione: "pending", "processing", "completed", "failed" |
| `estimated_completion` | Stima completamento processing |

### **2. Get Search Results**

Recupera i risultati di una ricerca completata con dati normalizzati.

#### **Request**
```http
GET /api/scraping/v2/results/{search_execution_id}
```

#### **Path Parameters**
| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `search_execution_id` | string | ID esecuzione ricerca |

#### **Response 200 - Success**
```json
{
  "search_execution_id": "exec_abc123",
  "tenant_id": "tenant_456",
  "status": "completed",
  "total_results": 25,
  "processing_completed_at": "2025-01-01T10:02:30Z",
  "results": [
    {
      "external_url": "https://www.immobiliare.it/annunci/12345",
      "basic_title": "Appartamento Milano Centro",
      "basic_price": 450000,
      "basic_location": "Milano, Centro Storico",
      "property_details": {
        "rooms": 3,
        "bathrooms": 2,
        "surface_area": 85,
        "floor": 2,
        "elevator": true
      },
      "location_data": {
        "city": "Milano",
        "province": "Milano", 
        "region": "Lombardia",
        "zone_type": "centro",
        "coordinates": {
          "lat": 45.4642,
          "lng": 9.1900
        }
      },
      "relevance_score": 0.89,
      "ai_insights": {
        "quality_score": 0.85,
        "recommendation": "Ottima corrispondenza criteri ricerca",
        "summary": "Appartamento ben posizionato in zona centrale"
      },
      "images": {
        "validated_urls": [
          "https://img.immobiliare.it/foto1.jpg",
          "https://img.immobiliare.it/foto2.jpg"
        ],
        "image_count": 8,
        "quality_score": 0.75
      },
      "scraped_at": "2025-01-01T10:01:15Z"
    }
  ],
  "pipeline_stats": {
    "total_scraped": 28,
    "successfully_processed": 25,
    "processing_time_ms": 1250,
    "average_quality_score": 0.82,
    "geolocation_success_rate": 0.96
  }
}
```

#### **Response 202 - Still Processing**
```json
{
  "search_execution_id": "exec_abc123",
  "status": "processing",
  "progress": {
    "current_step": "geolocation_processing",
    "completed_items": 15,
    "total_items": 28,
    "estimated_remaining_seconds": 45
  }
}
```

#### **SearchResult Schema**
| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `external_url` | string | URL originale immobile |
| `basic_title` | string | Titolo normalizzato |
| `basic_price` | integer | Prezzo in EUR |
| `basic_location` | string | Location leggibile |
| `property_details` | object | Dettagli tecnici |
| `location_data` | object | Dati geolocalizzazione |
| `relevance_score` | float | Score rilevanza (0-1) |
| `ai_insights` | object | AI analysis e recommendations |
| `images` | object | Dati immagini validate |

### **3. Health Checks**

#### **Basic Health Check**
```http
GET /health
```

**Response 200:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T10:00:00Z"
}
```

#### **Detailed Health Check**
```http
GET /api/health/detailed
```

**Response 200:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T10:00:00Z",
  "version": "1.0.0",
  "components": {
    "data_pipeline": {
      "status": "healthy",
      "last_check": "2025-01-01T10:00:00Z"
    },
    "geolocation_service": {
      "status": "healthy",
      "cities_loaded": 8000,
      "last_updated": "2025-01-01T09:00:00Z"
    },
    "image_validator": {
      "status": "healthy",
      "validation_rate": 0.95
    }
  },
  "performance": {
    "average_response_time_ms": 1200,
    "requests_last_hour": 45,
    "success_rate": 0.98
  }
}
```

## ❌ Error Responses

### **Standard Error Format**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid search criteria",
    "details": {
      "field": "max_price",
      "reason": "Value must be greater than min_price"
    },
    "request_id": "req_xyz789"
  },
  "timestamp": "2025-01-01T10:00:00Z"
}
```

### **Error Codes**

#### **4xx Client Errors**
| Code | HTTP Status | Descrizione |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request body non valido |
| `UNAUTHORIZED` | 401 | JWT token mancante o non valido |
| `FORBIDDEN` | 403 | Accesso negato per tenant |
| `NOT_FOUND` | 404 | Search execution non trovata |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |

#### **5xx Server Errors**
| Code | HTTP Status | Descrizione |
|------|-------------|-------------|
| `INTERNAL_ERROR` | 500 | Errore interno server |
| `SERVICE_UNAVAILABLE` | 503 | Servizio temporaneamente non disponibile |
| `SCRAPING_ERROR` | 502 | Errore durante scraping |
| `PIPELINE_ERROR` | 500 | Errore processing pipeline |

### **Error Examples**

#### **401 - Token Non Valido**
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired JWT token",
    "details": {
      "reason": "Token signature verification failed"
    }
  }
}
```

#### **403 - Accesso Cross-Tenant**
```json
{
  "error": {
    "code": "FORBIDDEN", 
    "message": "Access denied to resource",
    "details": {
      "resource": "search_execution_id",
      "reason": "Resource belongs to different tenant"
    }
  }
}
```

#### **404 - Ricerca Non Trovata**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Search execution not found",
    "details": {
      "search_execution_id": "exec_nonexistent"
    }
  }
}
```

## 🔄 API Flow Examples

### **Workflow Completo**

#### **1. Avvio Ricerca**
```bash
curl -X POST http://localhost:8002/api/scraping/v2/execute-search \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "saved_search_id": "search_123",
    "search_criteria": {
      "location": "milano",
      "property_type": "apartment",
      "min_price": 300000,
      "max_price": 800000
    },
    "platform": "immobiliare_it",
    "max_results": 50
  }'
```

#### **2. Polling Risultati**
```bash
# Polling ogni 5-10 secondi fino a completion
curl -H "Authorization: Bearer <jwt-token>" \
  http://localhost:8002/api/scraping/v2/results/exec_abc123
```

#### **3. Processing Completato**
```json
{
  "status": "completed",
  "total_results": 25,
  "results": [...],
  "pipeline_stats": {...}
}
```

### **Integration con Frontend**

#### **JavaScript/Vue.js Example**
```javascript
class ScrapingService {
  constructor(apiClient) {
    this.api = apiClient;
  }

  async executeSearch(searchCriteria) {
    const response = await this.api.post('/api/scraping/v2/execute-search', {
      saved_search_id: searchCriteria.id,
      search_criteria: searchCriteria,
      platform: 'immobiliare_it',
      max_results: 50
    });
    
    return response.data.search_execution_id;
  }

  async pollResults(executionId, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await this.api.get(`/api/scraping/v2/results/${executionId}`);
      
      if (response.data.status === 'completed') {
        return response.data.results;
      }
      
      if (response.data.status === 'failed') {
        throw new Error('Scraping failed');
      }
      
      // Wait 5 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    throw new Error('Timeout waiting for results');
  }
}
```

## 📊 Rate Limiting

### **Limits per Tenant**
- **Execute Search**: 10 richieste/minuto per tenant
- **Get Results**: 60 richieste/minuto per tenant
- **Health Checks**: Unlimited

### **Headers Response**
```http
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1735651260
```

## 🔧 Configuration

### **Request Timeouts**
- **Execute Search**: 30 secondi
- **Get Results**: 10 secondi  
- **Processing**: Max 5 minuti per search

### **Pagination**
- **Max Results**: 100 per request
- **Default**: 20 risultati
- **No pagination**: Tutti i risultati in single response

---

**📚 Questa API reference è sempre aggiornata. Per esempi di integrazione completa, consulta i test in `test_multitenant_api.py`.**
