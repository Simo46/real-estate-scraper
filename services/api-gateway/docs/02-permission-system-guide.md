# Sistema di Autorizzazione e Permessi

## 🚀 Quick Reference

**Concetti chiave:**
- **CASL**: Libreria per definire e verificare permessi granulari
- **Policy**: Classi che decidono se un utente può fare un'azione (BasePolicy + specifiche)
- **AbilityService**: Converte ruoli/permessi in oggetti CASL
- **Middleware**: Verifica automatica permessi su ogni route

**Ruoli di sistema:**
```bash
admin    # Accesso completo (action: 'manage', subject: 'all')
user     # Permessi base per utenti normali  
system   # Per operazioni automatiche (scraping, job)
```

**Flusso autorizzazione:**
```
Request → authMiddleware → policyMiddlewareFactory → BasePolicy → CASL → Controller
```

**Policy middleware su routes:**
```javascript
// Lettura con filtro automatico campi
policyMiddlewareFactory.createList('User', { applyFilters: true })

// Operazioni CRUD standard  
policyMiddlewareFactory.create('User', 'read|create|update|delete')
```

**File chiave:**
- `src/policies/BasePolicy.js` - Logica base autorizzazioni
- `src/services/abilityService.js` - Costruzione permessi CASL
- `src/middleware/policyMiddlewareFactory.js` - Middleware per routes
- `src/middleware/fieldFilterMiddleware.js` - Filtro automatico campi risposta
- `src/seeders/base/03_base_abilities.js` - Permessi iniziali del sistema

**Debug comandi:**
```bash
# Log autorizzazioni dettagliati
DEBUG=middleware:policyMiddlewareFactory npm start

# Verifica permessi utente in controller
const ability = await abilityService.defineAbilityFor(req.user);
console.log('Can read User:', ability.can('read', 'User'));
```

---

## 📖 Panoramica Sistema

Il sistema implementa un modello **RBAC** (Role-Based Access Control) utilizzando **CASL** come motore di autorizzazioni. L'architettura segue il pattern Policy per centralizzare la logica di controllo accessi.

### Architettura Componenti

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   HTTP Request  │────│  authMiddleware  │────│ policyMiddleware│
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  User + Roles   │────│  abilityService  │────│   BasePolicy    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   CASL Ability  │────│ Permission Check │────│   Controller    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

---

## 🔐 Database Schema Autorizzazioni

### Tabelle Principali

**users**: Utenti del sistema
```sql
id (UUID), tenant_id, username, email, password, active, settings
```

**roles**: Ruoli disponibili (admin, user, system)
```sql
id (UUID), name, description
```

**user_roles**: Associazione utenti-ruoli (many-to-many)
```sql
user_id, role_id, tenant_id
```

**abilities**: Permessi CASL associati ai ruoli
```sql
role_id, action, subject, conditions, fields, inverted, priority
```

**user_abilities**: Permessi individuali per utenti specifici
```sql
user_id, action, subject, conditions, fields, inverted, priority
```

### Dati Iniziali (Base Seeders)

Il sistema viene inizializzato con:
- **3 ruoli base**: admin (tutto), user (base), system (automazioni)
- **Utente admin** default: `username: admin`, `password: admin123`
- **Permessi admin**: `action: 'manage', subject: 'all'` (accesso completo)

---

## 🔄 Flusso di Autorizzazione Dettagliato

### 1. Autenticazione (authMiddleware)

```javascript
// src/middleware/authMiddleware.js
const authenticate = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (!user) return next(AppError.authentication('Token non valido'));
    req.user = user; // User con roles precaricati
    next();
  })(req, res, next);
};
```

### 2. Controllo Autorizzazioni (policyMiddlewareFactory)

```javascript
// Esempio route protetta
router.get('/users/:id',
  authenticate,                                    // 1. Verifica JWT
  policyMiddlewareFactory.create('User', 'read'),  // 2. Verifica permessi
  userController.getUserById                       // 3. Esegue controller
);
```

Il middleware esegue:
1. **Carica risorsa** (se req.params.id presente): `req.resource = await Model.findByPk(id)`
2. **Ottiene policy**: `UserPolicy` o fallback su `BasePolicy`
3. **Verifica permessi**: `policy.canRead(user, resource)`
4. **Applica filtro campi**: Solo per operazioni di lettura

### 3. Generazione Ability (abilityService)

```javascript
// src/services/abilityService.js
async defineAbilityFor(user) {
  // 1. Estrae permessi dai ruoli dell'utente
  const roleAbilities = await this.extractAbilitiesFromUser(user);
  
  // 2. Aggiunge permessi individuali (user_abilities)
  const userAbilities = await this.extractUserAbilitiesFromUser(user);
  
  // 3. Ordina per priorità e costruisce Ability CASL
  const sortedAbilities = this.sortAbilitiesByPriority([...roleAbilities, ...userAbilities]);
  return this.buildAbility(sortedAbilities, user);
}
```

### 4. Valutazione Policy (BasePolicy)

```javascript
// src/policies/BasePolicy.js
async can(action, user, resource, data = {}) {
  const ability = await abilityService.defineAbilityFor(user);
  
  // Verifica base CASL
  if (ability.cannot(action, resourceType)) return false;
  
  // Se risorsa specifica, valuta condizioni
  if (typeof resource !== 'string' && resource) {
    const rules = ability.rulesFor(action, resourceType);
    return permissionEvaluator.evaluateRules(rules, user, resource);
  }
  
  return true;
}
```

### 5. Filtro Campi Automatico (fieldFilterMiddleware)

Per operazioni di lettura, il sistema filtra automaticamente i campi della risposta:

```javascript
// Intercetta res.json() e filtra campi in base ai permessi
const originalJson = res.json;
res.json = function(data) {
  const filteredData = FieldFilterMiddleware.filterResourceObject(
    data, allowedFields, resourceType
  );
  return originalJson.call(this, filteredData);
};
```

---

## 🛠️ Come Aggiungere una Nuova Risorsa

### 1. Crea il Modello Sequelize

```bash
# Genera modello e migration
npx sequelize-cli model:generate --name Property --attributes title:string,price:decimal,location:string
```

### 2. Crea la Policy (Opzionale)

Se serve logica custom, altrimenti `BasePolicy` gestisce tutto:

```javascript
// src/policies/PropertyPolicy.js
const BasePolicy = require('./BasePolicy');

class PropertyPolicy extends BasePolicy {
  constructor() {
    super('Property');
  }

  // Sovrascrivi solo se serve logica specifica
  async canUpdate(user, resource, data) {
    const baseAllowed = await super.canUpdate(user, resource, data);
    if (!baseAllowed) return false;
    
    // Logica custom: solo il proprietario può modificare
    return resource.created_by === user.id;
  }
}

module.exports = new PropertyPolicy();
```

### 3. Aggiungi Routes con Middleware

```javascript
// src/api/routes/propertyRoutes.js
const router = express.Router();
const policyMiddlewareFactory = require('../../middleware/policyMiddlewareFactory');

router.get('/',
  authenticate,
  policyMiddlewareFactory.createList('Property', { applyFilters: true }),
  propertyController.getList
);

router.post('/',
  authenticate,
  propertyValidators.create,
  policyMiddlewareFactory.create('Property', 'create'),
  propertyController.create
);

router.put('/:id',
  authenticate,
  propertyValidators.update,
  policyMiddlewareFactory.create('Property', 'update'),
  propertyController.update
);
```

### 4. Aggiungi Permessi nel Database

```javascript
// Migration o seeder
{
  role_id: adminRoleId,
  action: 'manage',
  subject: 'Property',
  priority: 10
},
{
  role_id: userRoleId,
  action: 'read',
  subject: 'Property',
  priority: 5
}
```

---

## 🔍 Sistema di Permessi CASL

### Azioni Standard

- **manage**: Accesso completo (crea, legge, aggiorna, elimina)
- **create**: Creazione nuove risorse
- **read**: Lettura/visualizzazione risorse
- **update**: Modifica risorse esistenti
- **delete**: Eliminazione risorse

### Soggetti (Subjects)

- **all**: Tutte le risorse (solo admin)
- **User**: Gestione utenti
- **Role**: Gestione ruoli
- **Property**: Gestione immobili (esempio)
- **ScrapingJob**: Operazioni di scraping

### Condizioni Dinamiche

Le abilities possono includere condizioni che limitano l'accesso:

```javascript
// Esempio: utente può modificare solo le proprie proprietà
{
  action: 'update',
  subject: 'Property',
  conditions: { created_by: '$user.id' }
}

// Esempio: limitare per tenant
{
  action: 'read',
  subject: 'User',
  conditions: { tenant_id: '$user.tenant_id' }
}
```

### Restrizioni sui Campi

```javascript
// Utente può leggere User ma non vedere email/password
{
  action: 'read',
  subject: 'User',
  fields: ['id', 'username', 'name', 'active']
}
```

---

## 🎯 Permessi Individuali (User Abilities)

Oltre ai permessi di ruolo, gli utenti possono avere permessi specifici:

### Creazione Permesso Individuale

```javascript
// API: POST /api/users/:userId/abilities
{
  "action": "delete",
  "subject": "Property",
  "priority": 15,
  "reason": "Autorizzazione speciale per property management"
}
```

### Sistema di Priorità

I permessi con priorità più alta vincono sui conflitti:
- **Permessi individuali**: priority 10-20 (più alta)
- **Permessi di ruolo**: priority 1-10 (più bassa)

```javascript
// Esempio: permesso individuale sovrascrive ruolo
// Ruolo user: cannot delete Property (priority: 5)
// Permesso individuale: can delete Property (priority: 15)
// Risultato: l'utente PUÒ eliminare proprietà
```

---

## 🐛 Risoluzione Problemi Comuni

### "Non autorizzato per [azione] su [risorsa]"

**Causa**: Utente non ha permessi sufficienti

**Debug**:
```javascript
// Nel controller, verifica permessi
const ability = await abilityService.defineAbilityFor(req.user);
console.log('User roles:', req.user.roles.map(r => r.name));
console.log('Can read User:', ability.can('read', 'User'));
console.log('Rules for read User:', ability.rulesFor('read', 'User'));
```

**Soluzioni**:
1. Verifica ruoli utente nel database: `user_roles` table
2. Controlla abilities per il ruolo: `abilities` table
3. Aggiungi permesso mancante o permesso individuale

### "Non autorizzato a modificare i campi: [campi]"

**Causa**: Ability ha restrizioni sui campi (`fields` array)

**Debug**:
```javascript
// Verifica campi consentiti
const policy = require('../policies/UserPolicy');
const fieldCheck = await policy.verifyAllowedFields(req.user, req.resource, req.body);
console.log('Field check result:', fieldCheck);
```

**Soluzioni**:
1. Rimuovi campi non autorizzati dalla richiesta
2. Modifica ability per includere i campi necessari
3. Aggiungi permesso individuale senza restrizioni campi

### "Policy per [risorsa] non trovata"

**Causa**: File policy mancante o errore di caricamento

**Soluzioni**:
1. Crea file: `src/policies/ResourceTypePolicy.js`
2. Assicurati esporti un'istanza: `module.exports = new ResourcePolicy();`
3. Usa `BasePolicy` se non serve logica custom

### Campi non filtrati nelle risposte

**Causa**: `FieldFilterMiddleware` non applicato

**Soluzioni**:
1. Usa `policyMiddlewareFactory.createList()` per liste
2. Usa `policyMiddlewareFactory.create()` per singole risorse
3. Verifica log `middleware:fieldFilter` per debug

---

## 🔧 Testing Autorizzazioni

### Setup Test

```javascript
// test/helpers/authHelper.js
const createUserWithRole = async (roleName = 'user') => {
  const user = await User.create({
    username: 'testuser',
    email: 'test@example.com',
    password: await bcrypt.hash('password', 10)
  });
  
  const role = await Role.findOne({ where: { name: roleName } });
  await user.addRole(role);
  
  return user;
};
```

### Test Case Esempio

```javascript
// test/policies/userPolicy.test.js
describe('UserPolicy', () => {
  it('admin può gestire tutti gli utenti', async () => {
    const admin = await createUserWithRole('admin');
    const policy = new UserPolicy();
    
    const canCreate = await policy.canCreate(admin, {});
    const canRead = await policy.canRead(admin, otherUser);
    
    expect(canCreate).toBe(true);
    expect(canRead).toBe(true);
  });
  
  it('user normale non può eliminare altri utenti', async () => {
    const user = await createUserWithRole('user');
    const otherUser = await createUserWithRole('user');
    const policy = new UserPolicy();
    
    const canDelete = await policy.canDelete(user, otherUser);
    expect(canDelete).toBe(false);
  });
});
```

---

## 📊 Monitoring e Performance

### Log Utili

Attiva logging specifico per debugging:

```bash
# Log dettagliati autorizzazioni
DEBUG=middleware:policyMiddlewareFactory,policies:base npm start

# Log servizio abilities
DEBUG=services:ability npm start

# Log filtro campi
DEBUG=middleware:fieldFilter npm start
```

### Ottimizzazione Performance

1. **Eager Loading**: Precarica ruoli negli user queries
```javascript
const user = await User.findByPk(id, {
  include: ['roles', 'userAbilities']
});
```

2. **Cache Abilities**: Per utenti con molte richieste
```javascript
// Implementare caching in abilityService.defineAbilityFor()
```

3. **Database Indexing**: Su campi usati nelle condizioni
```sql
CREATE INDEX idx_user_abilities_user_subject ON user_abilities(user_id, subject);
CREATE INDEX idx_abilities_role_subject ON abilities(role_id, subject);
```

---

## 🚀 Best Practices

### Per le Policy

1. **Eredita da BasePolicy**: Sempre, sovrascrivi solo quando necessario
2. **Gestisci errori**: Try/catch nei metodi custom
3. **Log appropriato**: Per debugging e audit
4. **Validazione input**: Verifica user e resource sempre

### Per le Abilities

1. **Usa priorità**: Per gestire conflitti tra regole
2. **Condizioni specifiche**: Evita `manage all` tranne per admin
3. **Campi limitati**: Solo quando necessario per sicurezza
4. **Documentazione**: Commenta regole complesse

### Per le Routes

1. **Ordine middleware**: `authenticate` sempre primo
2. **Usa factory methods**: `createList()` per liste, `create()` per singole
3. **Validazione prima**: Valida input prima dei controlli policy
4. **Error handling**: Gestisci errori di autorizzazione appropriatamente

### Sicurezza

1. **Principio minimo privilegio**: Parti da no access, aggiungi necessario
2. **Audit logging**: Log accessi e modifiche permessi
3. **Revisione periodica**: Controlla permessi utenti regolarmente
4. **Test coverage**: Testa scenari di autorizzazione critici

---

## 📝 Conclusione

Il sistema di autorizzazione fornisce un framework flessibile e sicuro per gestire l'accesso alle risorse. La combinazione di CASL, Policy pattern e middleware automatici permette di implementare controlli granulari mantenendo il codice pulito e mantenibile.

Per estendere il sistema, segui i pattern stabiliti e la documentazione. In caso di dubbi, i log dettagliati e i test aiutano a debugging problemi di autorizzazione.