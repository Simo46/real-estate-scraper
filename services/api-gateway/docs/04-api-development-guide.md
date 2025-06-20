# Guida allo Sviluppo API

## 🚀 Quick Reference

**Pattern API esistenti:**
```javascript
// Controller: Classe con binding methods
class ResourceController {
  constructor() { this.method = this.method.bind(this); }
  async method(req, res, next) { /* logic */ }
}

// Route: Middleware stack standard
router.post('/', authenticate, validators.create, policyMiddleware.create('Resource', 'create'), controller.create);

// Validator: express-validator con custom logic
body('field').notEmpty().isLength({ min: 2 }).custom(async (value) => { /* logic */ })
```

**Struttura cartelle API:**
```
src/api/
├── controllers/     # Logica business per ogni endpoint
├── routes/          # Definizione routes con middleware
├── validators/      # Validazione input con express-validator
└── index.js         # Export centralizzato controllers/routes/validators
```

**Flusso richiesta standard:**
```
Request → Route → authenticate → validators → policyMiddleware → controller → Response
```

**Error handling:**
```javascript
// Nel controller
try {
  const result = await someOperation();
  res.json({ status: 'success', data: result });
} catch (error) {
  next(error); // Passa al global error handler
}

// Errori tipizzati
throw AppError.validation('Message', details);
throw AppError.notFound('Resource not found');
```

**File chiave:**
- `src/api/controllers/userController.js` - Esempio controller completo
- `src/api/routes/userRoutes.js` - Esempio routes con middleware stack
- `src/api/validators/userValidators.js` - Esempio validazioni
- `src/middleware/errorHandler.js` - Error handling centralizzato

**Comandi development:**
```bash
# Test singolo endpoint
curl -X POST http://localhost:3000/api/users -H "Authorization: Bearer $TOKEN" -d '{"name":"test"}'

# Debug con log dettagliati
DEBUG=controllers:*,api:* npm start
```

---

## 📖 Architettura API

### Pattern Architetturale

Il progetto segue un'architettura **layered** con separazione chiara delle responsabilità:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Routes      │────│   Middleware    │────│   Controllers   │
│   (Endpoints)   │    │ (Auth, Policy,  │    │  (Business      │
│                 │    │  Validation)    │    │   Logic)        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Validators    │    │    Services     │    │     Models      │
│ (Input Check)   │    │ (Business Logic)│    │   (Database)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Flusso Request-Response Dettagliato

**1. Ricezione Request**
- HTTP request arriva su route definita in `src/api/routes/`
- Express router indirizza alla chain di middleware

**2. Autenticazione** 
- `authenticate` middleware verifica JWT token
- Carica user completo con ruoli in `req.user`
- Se fallisce, ritorna 401 Unauthorized

**3. Validazione Input**
- `express-validator` verifica formato e regole business
- Sanitizza input (trim, escape, etc.)
- Se fallisce, raccoglie errori e ritorna 400 Bad Request

**4. Autorizzazione**
- `policyMiddlewareFactory` verifica permessi tramite CASL
- Carica risorsa in `req.resource` se necessario
- Applica field filtering per operazioni di lettura
- Se fallisce, ritorna 403 Forbidden

**5. Business Logic** 
- Controller esegue logica applicativa
- Interagisce con database tramite Sequelize models
- Usa transazioni per operazioni multiple
- Chiama servizi esterni se necessario

**6. Risposta**
- Formato standardizzato: `{ status: 'success|fail|error', data: {...}, message: '...' }`
- Field filtering automatico su responses di lettura
- Logging automatico di errori e operazioni

---

## 🛠️ Controller Pattern

### Struttura e Responsabilità

I controller gestiscono la **business logic** e **orchestrazione** delle operazioni:

```javascript
class ResourceController {
  constructor() {
    // Binding necessario per preservare contesto this
    this.getResources = this.getResources.bind(this);
  }
  
  async getResources(req, res, next) {
    try {
      // 1. Estrai query parameters
      const { page = 1, limit = 10, search } = req.query;
      
      // 2. Costruisci condizioni query
      const where = { tenant_id: req.tenantId };
      if (search) where[Op.or] = [/* search conditions */];
      
      // 3. Applica filtri da policy middleware
      if (req.queryOptions?.where) Object.assign(where, req.queryOptions.where);
      
      // 4. Esegui query con paginazione
      const { count, rows } = await Resource.findAndCountAll({ where, offset, limit });
      
      // 5. Ritorna risposta standardizzata
      res.json({ status: 'success', data: { resources: rows, pagination: {...} } });
    } catch (error) {
      next(error); // Delega error handling al middleware globale
    }
  }
}
```

### Pattern per Operazioni CRUD

**GET Lista**: Query con paginazione, filtri, ordinamento
- Usa `req.queryOptions` per filtri da policy
- Include conteggi per paginazione
- Gestisce search testuale e filtri specifici

**GET Singola**: Lettura resource specifica
- Risorsa già caricata in `req.resource` dal policy middleware
- Solo restituzione della risorsa pre-filtrata

**POST Creazione**: Creazione nuova risorsa
- Validazione già fatta dai validators
- Autorizzazione già verificata da policy
- Usa transazioni per operazioni atomiche
- Aggiunge audit fields (created_by, tenant_id)

**PUT Aggiornamento**: Modifica risorsa esistente  
- Risorsa esistente in `req.resource`
- Policy middleware verifica campi modificabili
- Update solo dei campi forniti nel body

**DELETE Eliminazione**: Rimozione risorsa
- Soft delete se `paranoid: true` nel model
- Gestisce dipendenze e vincoli FK

### Gestione Transazioni

Per operazioni che coinvolgono multiple tabelle:

```javascript
const transaction = await sequelize.transaction();
try {
  await Resource.create(data, { transaction });
  await RelatedModel.update(relatedData, { transaction });
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
}
```

---

## 🛡️ Validator Pattern

### Scopo e Responsabilità

I validators gestiscono **validazione input** e **sanitizzazione** usando `express-validator`:

```javascript
const resourceValidators = {
  createResource: [
    body('name')
      .notEmpty().withMessage('Nome obbligatorio')
      .isLength({ min: 2, max: 100 }).withMessage('Nome tra 2-100 caratteri')
      .trim(), // Sanitizzazione
    
    body('email')
      .isEmail().withMessage('Email non valida')
      .custom(async (value, { req }) => {
        // Validazione custom per business rules
        const exists = await User.findOne({ where: { email: value } });
        if (exists) throw new Error('Email già in uso');
      })
  ]
};
```

### Tipi di Validazione

**Validazione di Formato**: Email, UUID, date, numeri
**Validazione di Lunghezza**: Min/max caratteri, array length
**Validazione di Contenuto**: Whitelist valori, regex patterns  
**Validazione Business**: Unicità, esistenza FK, regole dominio
**Validazione Condizionale**: Basata su altri campi del request

### Integrazione con Controllers

Nel controller, la validazione è già completata:

```javascript
async createResource(req, res, next) {
  // Validazione già fatta dal middleware, solo check risultato
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(AppError.validation('Errori di validazione', errors.array()));
  }
  // Procedi con business logic...
}
```

---

## 🚦 Routes Pattern

### Struttura e Middleware Chain

Routes definiscono **endpoints** e **middleware stack**:

```javascript
router.post('/resources',
  authenticate,                                    // 1. Verifica JWT
  resourceValidators.createResource,               // 2. Valida input
  policyMiddlewareFactory.create('Resource', 'create'), // 3. Verifica permessi  
  resourceController.createResource                // 4. Esegue business logic
);
```

### Convenzioni URL

- **Collections**: `/api/resources` (GET lista, POST creazione)
- **Singole risorse**: `/api/resources/:id` (GET/PUT/DELETE)
- **Azioni specifiche**: `/api/resources/:id/activate` (POST azione)
- **Relazioni**: `/api/users/:userId/abilities` (nested resources)

### Policy Middleware Integration

**Per liste**: `policyMiddlewareFactory.createList('Resource', { applyFilters: true })`
- Applica filtri automatici basati sui permessi
- Gestisce field filtering su response

**Per singole**: `policyMiddlewareFactory.create('Resource', 'action')`
- Carica risorsa in `req.resource`
- Verifica permessi specifici sull'azione
- Verifica campi modificabili per update

---

## ⚠️ Error Handling

### Sistema Centralizzato

Il progetto usa **AppError** per errori tipizzati e **global error handler**:

```javascript
// Tipi di errore comuni
AppError.validation('Message', details)    // 400 - Input invalido
AppError.authentication('Message')         // 401 - Non autenticato  
AppError.authorization('Message')          // 403 - Non autorizzato
AppError.notFound('Message')              // 404 - Risorsa non trovata
AppError.conflict('Message')              // 409 - Conflitto (duplicati)
AppError.business('Message', details)     // 422 - Regola business violata
```

### Pattern nei Controller

```javascript
async operation(req, res, next) {
  try {
    // Business logic
    if (businessConditionFailed) {
      throw AppError.business('Condizione non soddisfatta');
    }
    // Success response
  } catch (error) {
    // AppError già tipizzati vanno al global handler
    if (error instanceof AppError) return next(error);
    
    // Altri errori diventano errori interni
    logger.error({ err: error }, 'Errore imprevisto');
    next(AppError.database('Errore durante operazione'));
  }
}
```

### Response Format Standardizzato

```javascript
// Success (2xx)
{ status: 'success', data: {...}, message: 'Optional message' }

// Client Error (4xx) 
{ status: 'fail', type: 'VALIDATION_ERROR', message: 'Error details' }

// Server Error (5xx)
{ status: 'error', type: 'DATABASE_ERROR', message: 'Generic message' }
```

---

## 🔄 Service Pattern

### Quando Usare Services

Estrai logica complessa in **services separati** quando:
- Logica business riusabile tra controller diversi
- Operazioni che coinvolgono multiple entità
- Calcoli complessi o algoritmi
- Integrazione con servizi esterni

### Esempio di Service

```javascript
// src/services/resourceService.js
class ResourceService {
  async calculateMetrics(resourceId) {
    // Logica complessa di calcolo
    return { usage: 0.85, efficiency: 0.92 };
  }
  
  async processWorkflow(resource, action) {
    // Gestione workflow multi-step
  }
}
```

Utilizzo nel controller:
```javascript
const metrics = await resourceService.calculateMetrics(resourceId);
res.json({ status: 'success', data: { metrics } });
```

---

## 📝 Come Aggiungere una Nuova API

### Processo Step-by-Step

**1. Crea Model + Migration**
```bash
npx sequelize-cli model:generate --name Property --attributes title:string,price:decimal
```

**2. Implementa Controller**
- Crea `src/api/controllers/propertyController.js`
- Segui pattern esistenti con binding methods
- Gestisci operazioni CRUD base

**3. Definisci Validators**  
- Crea `src/api/validators/propertyValidators.js`
- Validazioni per create/update/delete
- Include custom business rules

**4. Configura Routes**
- Crea `src/api/routes/propertyRoutes.js` 
- Applica middleware stack standard
- Documenta ogni endpoint con JSDoc

**5. Registra nel Sistema**
- Aggiungi route in `src/api/routes/index.js`
- Esporta controller/validator da `src/api/index.js`

**6. Configura Autorizzazioni**
- Crea policy se serve logica custom (opzionale)
- Aggiungi abilities nel database per i ruoli

**7. Test e Verifica**
- Test manuale con curl/Postman
- Verifica autorizzazioni e field filtering
- Check logging e error handling

### Template per Velocizzare

Usa file esistenti come template:
- **Controller**: `userController.js` → pattern completo
- **Validator**: `userValidators.js` → validazioni avanzate  
- **Routes**: `userRoutes.js` → middleware stack completo

---

## 🧪 Testing e Debug

### Strategia Testing

**Unit Test**: Controllers e services in isolamento
**Integration Test**: Endpoint completi con middleware stack
**Authorization Test**: Verifica policy e permessi

### Debug Efficace

```bash
# Log dettagliati per API
DEBUG=controllers:*,middleware:policyMiddleware npm start

# Test rapido endpoint
curl -X GET "http://localhost:3000/api/users" -H "Authorization: Bearer $TOKEN"

# Verifica permessi utente
# Nella console: ability.can('read', 'User') 
```

### Monitoring Performance

Traccia performance nelle operazioni critiche:
```javascript
const startTime = Date.now();
await expensiveOperation();
logger.info('Operation completed', { 
  duration: Date.now() - startTime,
  operation: 'expensiveOperation'
});
```

---

## 📚 Best Practices

### Security First

1. **Validazione rigorosa**: Non fidarsi mai dell'input client
2. **Authorization sempre**: Ogni endpoint protetto da policy
3. **Audit logging**: Traccia operazioni sensibili
4. **Error messages sicuri**: Non esporre dettagli interni

### Code Quality

1. **Consistency**: Segui pattern esistenti sempre
2. **Separation of concerns**: Controller → Service → Model
3. **Error handling completo**: Try/catch + global handler
4. **Logging strutturato**: Info per operations, error per failures

### Performance

1. **Query optimization**: Use eager loading quando appropriato  
2. **Paginazione**: Sempre per liste grandi
3. **Transactions**: Per operazioni multiple related
4. **Caching**: Su query costose che non cambiano spesso

### Maintainability

1. **Documentazione JSDoc**: Per API public/complex
2. **Naming consistente**: Segui convenzioni progetto
3. **Modularità**: Funzioni piccole e focalizzate
4. **Testing**: Cover happy path + error cases

---

## 🎯 Conclusione

Il sistema API del progetto fornisce:
- **Architettura solida** con separation of concerns
- **Sicurezza integrata** con auth/authorization automatici
- **Pattern consistenti** per sviluppo rapido e maintainabile
- **Error handling robusto** per debugging efficace

Per estendere il sistema:
1. **Studia i file esempio** esistenti (user*, auth*)
2. **Segui i pattern** consolidati senza deviazioni
3. **Testa sempre** autorizzazioni e edge cases
4. **Documenta** endpoints complex o non-standard

Il rispetto di questi pattern garantisce **consistenza**, **sicurezza** e **maintainability** del codebase.