# Guida al Sistema Multi-Tenant

## 🚀 Quick Reference

**Identificazione tenant:**
```javascript
// Development: Header X-Tenant-ID
curl -H "X-Tenant-ID: uuid-tenant" http://localhost:3000/api/users

// Production: Subdomain  
agency1.realestate.com → tenant con domain: "agency1"
```

**Oggetti disponibili nel controller:**
```javascript
req.tenantId          // UUID del tenant corrente
req.tenant            // Oggetto tenant completo
req.sequelizeOptions  // { tenantId: "uuid" } per passare agli hooks
```

**Query sicure (pattern standard):**
```javascript
// Automatico via hooks
const results = await Model.findAll({}, req.sequelizeOptions);

// Esplicito per sicurezza extra
const results = await Model.findAll({ where: { tenant_id: req.tenantId } });
```

**Flusso richiesta multi-tenant:**
```
Request → tenantMiddleware → authenticate → policyMiddleware → controller
```

**File chiave:**
- `src/middleware/tenantMiddleware.js` - Identificazione tenant da request
- `src/config/sequelize-hooks.js` - Filtri automatici tenant_id 
- `src/models/tenant.js` - Modello tenant con domain/settings
- `src/migrations/*-create-tenants.js` - Schema database tenant

**Debug comuni:**
```bash
# Test identificazione tenant
DEBUG=tenant-middleware npm start

# Verifica tenant in database
psql -d dbname -c "SELECT id, name, domain FROM tenants WHERE active = true;"
```

---

## 📖 Cos'è il Multi-Tenancy

### Definizione e Scopo

Il **multi-tenancy** permette a una singola istanza dell'applicazione di servire **multiple agenzie immobiliari** (tenant), mantenendo i loro dati **completamente isolati**. 

Nel contesto Real Estate Scraper:
- **Tenant** = Agenzia immobiliare
- **Isolamento dati** = Ogni agenzia vede solo i propri annunci, ricerche, utenti
- **Configurazioni separate** = Ogni agenzia può avere settings personalizzati

### Approccio Implementato

Il progetto usa **Row-Level Security** con discriminatore `tenant_id`:

```
┌─────────────────────┐    ┌─────────────────────┐
│    Shared Database  │    │   Shared Schema     │
│                     │    │                     │
│ ┌─────────────────┐ │    │ ┌─────────────────┐ │
│ │ agency1_data    │ │    │ │ users           │ │
│ │ tenant_id: uuid1│ │    │ │ +tenant_id      │ │
│ └─────────────────┘ │    │ │                 │ │
│ ┌─────────────────┐ │    │ ┌─────────────────┐ │
│ │ agency2_data    │ │    │ │ properties      │ │
│ │ tenant_id: uuid2│ │    │ │ +tenant_id      │ │
│ └─────────────────┘ │    │ │                 │ │
└─────────────────────┘    └─────────────────────┘
```

**Vantaggi**:
- **Semplicità**: Un database, un'applicazione
- **Efficienza**: Risorse condivise, minor overhead
- **Manutenzione**: Un backup, un deployment
- **Flessibilità**: Configurazioni per-tenant via settings JSON

---

## 🏗️ Architettura del Sistema

### Modello Tenant

Tabella centrale per definire le agenzie:

```javascript
// Schema essenziale
{
  id: UUID,                    // Identificatore primario
  name: "Agenzia Roma Centro", // Nome friendly
  domain: "roma-centro",       // Subdomain (roma-centro.app.com)
  code: "ARC",                // Codice breve
  active: true,               // Stato attivazione
  settings: {                 // Configurazioni JSONB
    branding: {...},
    features: {...}
  }
}
```

### Flusso Identificazione Tenant

**1. Richiesta HTTP** → `tenantMiddleware.js`

**2. Identificazione tenant** (2 modalità):
- **Development**: Header `X-Tenant-ID: uuid`
- **Production**: Subdomain parsing `agency1.app.com`

**3. Validazione e enrichment**:
```javascript
// Cerca tenant nel database
const tenant = await Tenant.findOne({ where: { domain: subdomain, active: true } });

// Arricchisce request object
req.tenantId = tenant.id;
req.tenant = tenant;
req.sequelizeOptions = { tenantId: tenant.id };
```

**4. Continuazione chain** → authenticate → policy → controller

### Sequelize Hooks Automatici

Gli hooks in `sequelize-hooks.js` implementano **filtri automatici**:

```javascript
// Prima di ogni query SELECT
sequelize.addHook('beforeFind', (options) => {
  if (options.tenantId && model.hasField('tenant_id')) {
    options.where.tenant_id = options.tenantId;
  }
});

// Prima di ogni CREATE
sequelize.addHook('beforeCreate', (instance, options) => {
  if (options.tenantId && model.hasField('tenant_id')) {
    instance.tenant_id = options.tenantId;
  }
});
```

**Risultato**: Filtri automatici su tutti i modelli con `tenant_id`

---

## 🔐 Integrazione con Autenticazione

### Login Multi-Tenant

Il processo di login **filtra utenti per tenant**:

```javascript
// In authController.js
const user = await User.findOne({
  where: {
    [Op.or]: [{ username }, { email: username }],
    tenant_id: req.tenantId,  // Filtro essenziale!
    active: true
  }
});
```

**Flusso completo**:
1. **tenantMiddleware** identifica agenzia → `req.tenantId`
2. **authController** cerca utente solo in quella agenzia
3. **jwtService** include `tenant_id` nel token JWT
4. **authMiddleware** verifica coerenza tenant tra token e utente

### Token JWT Multi-Tenant

Il payload JWT include il tenant:

```javascript
// Payload esempio
{
  sub: "user-uuid",
  username: "admin",
  tenant_id: "agency-uuid",  // Tenant nel token
  iat: 1640995200
}
```

**Verifica sicurezza**:
```javascript
// In passport strategy
if (payload.tenant_id !== user.tenant_id) {
  return done(null, false, { message: 'Token per tenant diverso' });
}
```

---

## 🛡️ Isolamento Dati e Sicurezza

### Pattern Controller Sicuri

**1. Usa oggetti request preparati**:
```javascript
async getProperties(req, res, next) {
  // req.tenantId già disponibile e verificato
  const properties = await Property.findAll({
    where: { tenant_id: req.tenantId }
  }, req.sequelizeOptions);  // Hooks automatici
}
```

**2. Creazione con tenant automatico**:
```javascript
async createProperty(req, res, next) {
  const property = await Property.create({
    ...req.body,
    tenant_id: req.tenantId  // Esplicito per chiarezza
  }, req.sequelizeOptions);    // Passa agli hooks
}
```

**3. Query complesse con include**:
```javascript
const results = await Property.findAll({
  where: { tenant_id: req.tenantId },
  include: [{
    model: User,
    as: 'agent',
    // User già filtrato automaticamente se ha tenant_id
  }]
});
```

### Policy Multi-Tenant

Le policy integrano controlli tenant:

```javascript
// In PropertyPolicy.js
async canRead(user, property) {
  const baseAllowed = await super.canRead(user, property);
  if (!baseAllowed) return false;
  
  // Verifica tenant match
  if (property.tenant_id !== user.tenant_id) {
    logger.warn(`Cross-tenant access attempt: ${user.id}`);
    return false;
  }
  
  return true;
}
```

### Hooks Automatici in Azione

I modelli con `tenant_id` beneficiano di **filtri automatici**:

```javascript
// Query normale
const users = await User.findAll({}, req.sequelizeOptions);
// Diventa automaticamente:
// SELECT * FROM users WHERE tenant_id = 'req.tenantId'

// Creazione normale  
const user = await User.create(userData, req.sequelizeOptions);
// userData.tenant_id viene impostato automaticamente
```

**Modelli esclusi**: `Tenant`, `User` (nella lista `nonTenantModels`)

---

## 🔧 Sviluppo Multi-Tenant Corretto

### Setup Development

**1. Configura tenant di test**:
```sql
INSERT INTO tenants (id, name, domain, code, active) VALUES 
('agency1-uuid', 'Agenzia Test', 'test', 'TEST', true);
```

**2. Test con header**:
```bash
curl -H "X-Tenant-ID: agency1-uuid" \
     -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/properties
```

**3. Test con subdomain** (configura hosts):
```bash
# /etc/hosts
127.0.0.1 test.localhost

curl http://test.localhost:3000/api/properties
```

### Pattern di Sviluppo

**1. Controller pattern sicuro**:
```javascript
async getResources(req, res, next) {
  try {
    // SEMPRE usa req.tenantId o req.sequelizeOptions
    const resources = await Resource.findAll({
      where: { 
        tenant_id: req.tenantId,  // Esplicito
        active: true 
      }
    });
    
    res.json({ status: 'success', data: resources });
  } catch (error) {
    next(error);
  }
}
```

**2. Transazioni multi-tenant**:
```javascript
const transaction = await sequelize.transaction();
try {
  const main = await MainModel.create(data, { 
    ...req.sequelizeOptions,  // Include tenantId
    transaction 
  });
  
  const related = await RelatedModel.create(relatedData, {
    ...req.sequelizeOptions,  // Propaga tenant
    transaction
  });
  
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
}
```

**3. Bulk operations**:
```javascript
const items = req.body.items.map(item => ({
  ...item,
  tenant_id: req.tenantId  // Esplicito per bulk
}));

await Model.bulkCreate(items, req.sequelizeOptions);
```

### Testing Multi-Tenant

**Test isolamento dati**:
```javascript
describe('Multi-tenant isolation', () => {
  let agency1, agency2;
  
  beforeEach(async () => {
    agency1 = await Tenant.create({ name: 'Agency1', domain: 'ag1' });
    agency2 = await Tenant.create({ name: 'Agency2', domain: 'ag2' });
    
    await Property.create({ title: 'House1', tenant_id: agency1.id });
    await Property.create({ title: 'House2', tenant_id: agency2.id });
  });
  
  it('should only return agency1 properties', async () => {
    const req = { tenantId: agency1.id, sequelizeOptions: { tenantId: agency1.id } };
    const properties = await Property.findAll({}, req.sequelizeOptions);
    
    expect(properties).toHaveLength(1);
    expect(properties[0].title).toBe('House1');
  });
});
```

---

## 🐛 Troubleshooting

### Errore "Tenant not found" (404)

**Cause comuni**:
1. **Subdomain errato**: Verifica che il domain nel database corrisponda
2. **Tenant inattivo**: `active: false` nel database  
3. **Header mancante**: In development, aggiungi `X-Tenant-ID`

**Debug**:
```bash
# Verifica tenant esistenti
DEBUG=tenant-middleware npm start

# Query database
SELECT id, name, domain, active FROM tenants;
```

### Dati di Altri Tenant Visibili

**Cause comuni**:
1. **Query senza filtro**: Manca `tenant_id` nella query
2. **Options non passate**: Manca `req.sequelizeOptions`
3. **Join non filtrati**: Include senza filtri tenant

**Fix**:
```javascript
// ❌ Errato
const all = await Model.findAll();

// ✅ Corretto  
const filtered = await Model.findAll({}, req.sequelizeOptions);
```

### Problemi di Autenticazione

**Sintomi**: Utenti non riescono a loggarsi

**Verifica**:
1. **tenantMiddleware** identifica correttamente il tenant
2. **Login query** include `tenant_id: req.tenantId`
3. **JWT payload** contiene `tenant_id`
4. **Token verification** verifica match tenant

**Debug login**:
```javascript
// Nel authController
logger.debug(`Login attempt: user=${username}, tenant=${req.tenantId}`);
```

### Performance Issues

**Query N+1 con tenant**:
```javascript
// ❌ Problema: query separate per ogni include
const properties = await Property.findAll({
  include: [{ model: User, as: 'agent' }]
});

// ✅ Soluzione: eager loading con filtri
const properties = await Property.findAll({
  where: { tenant_id: req.tenantId },
  include: [{
    model: User,
    as: 'agent',
    where: { tenant_id: req.tenantId }  // Explicit filter
  }]
});
```

---

## 📊 Monitoring e Analytics

### Metriche Multi-Tenant

**1. Usage per tenant**:
```javascript
// Esempio analytics
const tenantStats = await Property.findAll({
  attributes: [
    'tenant_id',
    [sequelize.fn('COUNT', '*'), 'property_count']
  ],
  group: ['tenant_id']
});
```

**2. Performance monitoring**:
```javascript
// Log duration per tenant
const startTime = Date.now();
const results = await Model.findAll({}, req.sequelizeOptions);
logger.info('Query completed', {
  duration: Date.now() - startTime,
  tenant: req.tenant.name,
  operation: 'findAll'
});
```

### Configurazioni per Tenant

Usa `settings` JSONB per configurazioni specifiche:

```javascript
// Set setting per tenant
await req.tenant.setSetting('max_listings', 1000);

// Get setting con default
const maxListings = req.tenant.getSetting('max_listings', 500);

// Check feature flags
const hasAdvancedSearch = req.tenant.getSetting('features.advanced_search', false);
```

---

## 🎯 Best Practices

### Security

1. **Usa sempre req.tenantId**: Non hardcodare mai tenant IDs
2. **Verifica cross-tenant**: Controlla tenant_id nelle policy critiche
3. **Audit logging**: Traccia accessi cross-tenant sospetti
4. **Validazione input**: Non fidarsi di tenant_id da client

### Performance

1. **Passa req.sequelizeOptions**: Attiva hooks automatici
2. **Index su tenant_id**: Su tutte le tabelle multi-tenant
3. **Query ottimizzate**: Include filtri tenant espliciti in join complessi
4. **Cache per tenant**: Considera caching separato per tenant

### Development

1. **Test isolamento**: Sempre testare con dati di multiple agenzie
2. **Environment consistency**: Usa header in development, subdomain in production
3. **Migration safety**: Aggiungi tenant_id a nuove tabelle
4. **Documentation**: Documenta quali modelli sono multi-tenant

### Deployment

1. **Database migrations**: Popola tenant_id su dati esistenti
2. **DNS configuration**: Setup subdomain in production
3. **Monitoring**: Alert su errori tenant not found
4. **Backup strategy**: Consider tenant-specific backup/restore

---

## 🚀 Conclusione

Il sistema multi-tenant fornisce **isolamento robusto** e **scalabilità** per servire multiple agenzie immobiliari. I componenti chiave:

- **tenantMiddleware**: Identificazione automatica tenant
- **Sequelize hooks**: Filtri automatici database  
- **JWT integration**: Sicurezza cross-tenant
- **Policy integration**: Controlli a livello business logic

**Per estendere il sistema**:
1. **Segui i pattern** esistenti con req.tenantId
2. **Usa req.sequelizeOptions** per hooks automatici  
3. **Testa sempre isolamento** dati tra tenant
4. **Monitora performance** e usage per tenant

Il rispetto di questi pattern garantisce **sicurezza**, **performance** e **maintainability** in ambiente multi-agenzia.