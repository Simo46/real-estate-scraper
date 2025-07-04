# Sistema Multi-Tenant - Python Scraper Service

## 🎯 Overview Multi-Tenant

Il Python Scraper Service implementa un sistema di **multi-tenancy completo** che garantisce isolamento totale dei dati tra tenant diversi. Ogni tenant (organizzazione/azienda) ha accesso esclusivo ai propri dati di scraping senza possibilità di cross-contamination.

## 🏗️ Architettura Multi-Tenant

### **Design Pattern: Shared Infrastructure, Isolated Data**

Il servizio utilizza il pattern **"Shared Database, Separated Schema"** adattato per processing real-time:

```
HTTP Request → [Tenant Extraction] → [Context Propagation] → [Data Isolation] → [Filtered Response]
     ↓              ↓                    ↓                    ↓                   ↓
[JWT Claims] → [TenantContext] → [ProcessingPipeline] → [FilterResults] → [TenantSafeData]
```

### **Principi Fondamentali**

1. **Zero Cross-Tenant Access**: Impossibilità di accedere a dati di altri tenant
2. **Context Propagation**: Tenant context presente in ogni operazione
3. **Automatic Filtering**: Filtering automatico senza necessità di check manuali
4. **Audit Trail**: Logging completo per compliance e debug

## 🔐 Tenant Authentication & Authorization

### **JWT Token Structure**

Ogni richiesta deve contenere un JWT token con claims tenant:

```json
{
  "user_id": "user_123",
  "tenant_id": "tenant_456",
  "role": "user|admin|tenant_admin",
  "permissions": ["scraping:execute", "results:read"],
  "exp": 1735737600,
  "iat": 1735651200,
  "iss": "real-estate-api-gateway"
}
```

### **Tenant Context Extraction**

#### **AuthMiddleware** (`middleware/auth_middleware.py`)
```python
async def extract_tenant_from_token(token: str) -> TenantContext:
    """
    Estrae e valida tenant context da JWT token.
    
    Returns:
        TenantContext con user_id, tenant_id, role
        
    Raises:
        UnauthorizedError: Se token non valido
        ForbiddenError: Se tenant non autorizzato
    """
    payload = decode_jwt_token(token)
    
    return TenantContext(
        tenant_id=payload["tenant_id"],
        user_id=payload["user_id"], 
        role=payload["role"],
        permissions=payload.get("permissions", [])
    )
```

#### **Dependencies Injection** (`api/dependencies.py`)
```python
async def get_tenant_context(
    current_user: dict = Depends(get_current_user)
) -> TenantContext:
    """FastAPI dependency per tenant context injection."""
    return TenantContext(
        tenant_id=current_user["tenant_id"],
        user_id=current_user["user_id"],
        role=current_user["role"]
    )

# Usage in routes
@router.post("/execute-search")
async def execute_search(
    search_request: SearchRequest,
    tenant_ctx: TenantContext = Depends(get_tenant_context)
):
    # Automatic tenant context injection
    return await scraping_service.execute_search(search_request, tenant_ctx)
```

## 🛡️ Data Isolation Implementation

### **TenantDataIsolation Class** (`api/middleware/tenant_middleware.py`)

#### **Core Isolation Logic**
```python
class TenantDataIsolation:
    """
    Gestisce isolamento completo dati multi-tenant.
    """
    
    async def filter_results_by_tenant(
        self, 
        results: List[dict], 
        tenant_id: str
    ) -> List[dict]:
        """
        Filtra tutti i risultati per tenant specifico.
        
        Automatic filtering applicato a:
        - Search results 
        - Execution status
        - Background task results
        """
        return [
            result for result in results 
            if result.get('tenant_id') == tenant_id
        ]
    
    async def validate_tenant_access(
        self,
        resource_id: str,
        tenant_id: str,
        resource_type: str = "search_execution"
    ) -> bool:
        """
        Valida se tenant ha accesso a specifica risorsa.
        
        Raises:
            ForbiddenError: Se accesso negato
        """
        # Query resource con tenant context
        resource = await self._get_resource(resource_id, resource_type)
        
        if not resource or resource.get('tenant_id') != tenant_id:
            raise ForbiddenError(
                f"Access denied to {resource_type} {resource_id}"
            )
        
        return True
    
    async def add_tenant_context(
        self, 
        data: dict, 
        tenant_context: TenantContext
    ) -> dict:
        """
        Aggiunge tenant context a tutti i dati processati.
        """
        return {
            **data,
            "tenant_id": tenant_context.tenant_id,
            "created_by": tenant_context.user_id,
            "tenant_context": {
                "tenant_id": tenant_context.tenant_id,
                "user_role": tenant_context.role
            }
        }
```

### **Context Propagation Pattern**

#### **Processing Pipeline con Tenant Context**
```python
# services/data_pipeline.py
class SearchResultMapper:
    async def process_properties(
        self, 
        properties: List[dict], 
        tenant_context: TenantContext
    ) -> List[dict]:
        """
        Processa proprietà mantenendo tenant context.
        """
        processed_results = []
        
        for property_data in properties:
            # Add tenant context ad ogni risultato
            processed_property = await self._transform_property(property_data)
            
            # Tenant isolation enforcement
            processed_property = await self.tenant_isolation.add_tenant_context(
                processed_property, 
                tenant_context
            )
            
            processed_results.append(processed_property)
            
        return processed_results
```

#### **Background Tasks con Tenant Context**
```python
# api/routes/multitenant_scraping.py
async def process_search_execution(
    execution_id: str,
    search_criteria: dict,
    tenant_context: TenantContext
):
    """
    Background task che mantiene tenant context.
    """
    try:
        # Set tenant context per tutto il processing
        structlog.contextvars.bind_contextvars(
            tenant_id=tenant_context.tenant_id,
            user_id=tenant_context.user_id,
            execution_id=execution_id
        )
        
        # Process con tenant context
        results = await scraping_service.execute_scraping(
            search_criteria, 
            tenant_context
        )
        
        # Store results con tenant isolation
        await storage_service.store_results(
            execution_id,
            results,
            tenant_context
        )
        
    except Exception as e:
        logger.error(
            "Background processing failed",
            error=str(e),
            tenant_id=tenant_context.tenant_id,
            execution_id=execution_id
        )
```

## 🔄 Multi-Tenant API Endpoints

### **Execute Search con Tenant Isolation**

#### **Endpoint Implementation**
```python
@router.post("/execute-search")
async def execute_search(
    search_request: SearchRequest,
    background_tasks: BackgroundTasks,
    tenant_ctx: TenantContext = Depends(get_tenant_context)
) -> SearchExecutionResponse:
    """
    Esegue ricerca con isolamento tenant completo.
    """
    # Generate tenant-specific execution ID
    execution_id = f"exec_{tenant_ctx.tenant_id}_{generate_uuid()}"
    
    # Create search execution con tenant context
    search_execution = {
        "search_execution_id": execution_id,
        "tenant_id": tenant_ctx.tenant_id,
        "created_by": tenant_ctx.user_id,
        "search_criteria": search_request.search_criteria,
        "status": "pending",
        "created_at": datetime.utcnow().isoformat()
    }
    
    # Store execution metadata con tenant isolation
    await search_execution_storage.store(search_execution, tenant_ctx)
    
    # Background processing con tenant context
    background_tasks.add_task(
        process_search_execution,
        execution_id,
        search_request.search_criteria,
        tenant_ctx
    )
    
    return SearchExecutionResponse(**search_execution)
```

### **Get Results con Access Control**

#### **Tenant-Safe Results Retrieval**
```python
@router.get("/results/{search_execution_id}")
async def get_search_results(
    search_execution_id: str,
    tenant_ctx: TenantContext = Depends(get_tenant_context)
) -> SearchResultsResponse:
    """
    Recupera risultati con validation tenant access.
    """
    # Validate tenant access to resource
    await tenant_isolation.validate_tenant_access(
        search_execution_id,
        tenant_ctx.tenant_id,
        "search_execution"
    )
    
    # Get results con automatic tenant filtering
    raw_results = await results_storage.get_results(search_execution_id)
    
    # Additional tenant filtering (defense in depth)
    filtered_results = await tenant_isolation.filter_results_by_tenant(
        raw_results,
        tenant_ctx.tenant_id
    )
    
    return SearchResultsResponse(
        search_execution_id=search_execution_id,
        tenant_id=tenant_ctx.tenant_id,
        results=filtered_results
    )
```

## 🏪 Tenant Storage Isolation

### **In-Memory Storage con Tenant Partitioning**

#### **TenantAwareStorage Pattern**
```python
class TenantAwareSearchExecutionStorage:
    """
    Storage in-memory con partitioning per tenant.
    """
    
    def __init__(self):
        # Partitioned storage: {tenant_id: {execution_id: data}}
        self._tenant_partitions: Dict[str, Dict[str, dict]] = {}
        self._lock = asyncio.Lock()
    
    async def store(
        self, 
        execution_data: dict, 
        tenant_context: TenantContext
    ) -> None:
        """Store execution con tenant isolation."""
        async with self._lock:
            tenant_id = tenant_context.tenant_id
            
            if tenant_id not in self._tenant_partitions:
                self._tenant_partitions[tenant_id] = {}
                
            self._tenant_partitions[tenant_id][
                execution_data["search_execution_id"]
            ] = {
                **execution_data,
                "tenant_id": tenant_id,  # Enforce tenant_id
                "stored_at": datetime.utcnow().isoformat()
            }
    
    async def get(
        self, 
        execution_id: str, 
        tenant_context: TenantContext
    ) -> Optional[dict]:
        """Get execution con automatic tenant filtering."""
        tenant_id = tenant_context.tenant_id
        
        tenant_partition = self._tenant_partitions.get(tenant_id, {})
        execution_data = tenant_partition.get(execution_id)
        
        # Double-check tenant isolation
        if execution_data and execution_data.get('tenant_id') != tenant_id:
            logger.warning(
                "Tenant isolation violation detected",
                execution_id=execution_id,
                expected_tenant=tenant_id,
                actual_tenant=execution_data.get('tenant_id')
            )
            return None
            
        return execution_data
    
    async def list_by_tenant(
        self, 
        tenant_context: TenantContext
    ) -> List[dict]:
        """Lista tutte le executions per tenant."""
        tenant_partition = self._tenant_partitions.get(
            tenant_context.tenant_id, 
            {}
        )
        return list(tenant_partition.values())
```

## 📊 Monitoring e Audit Multi-Tenant

### **Structured Logging con Tenant Context**

#### **Automatic Tenant Context in Logs**
```python
# Ogni log automaticamente include tenant context
logger.info(
    "Search execution started",
    tenant_id=tenant_ctx.tenant_id,
    user_id=tenant_ctx.user_id,
    execution_id=execution_id,
    search_criteria=search_criteria
)

# Output log con tenant isolation
{
    "timestamp": "2025-01-01T10:00:00Z",
    "level": "info",
    "message": "Search execution started",
    "tenant_id": "tenant_456",
    "user_id": "user_123", 
    "execution_id": "exec_tenant_456_abc123",
    "search_criteria": {...}
}
```

### **Tenant-Specific Metrics**

#### **Per-Tenant Performance Monitoring**
```python
class TenantMetrics:
    """Metrics collection con tenant isolation."""
    
    def __init__(self):
        self._tenant_metrics: Dict[str, dict] = {}
    
    async def record_request(
        self, 
        tenant_id: str, 
        endpoint: str, 
        response_time_ms: int
    ):
        """Record metrics per tenant."""
        if tenant_id not in self._tenant_metrics:
            self._tenant_metrics[tenant_id] = {
                "request_count": 0,
                "average_response_time": 0,
                "endpoint_stats": {}
            }
        
        tenant_stats = self._tenant_metrics[tenant_id]
        tenant_stats["request_count"] += 1
        
        # Update average response time
        current_avg = tenant_stats["average_response_time"]
        count = tenant_stats["request_count"]
        tenant_stats["average_response_time"] = (
            (current_avg * (count - 1) + response_time_ms) / count
        )
    
    async def get_tenant_stats(self, tenant_id: str) -> dict:
        """Get performance stats per tenant."""
        return self._tenant_metrics.get(tenant_id, {})
```

## 🧪 Testing Multi-Tenant Isolation

### **Test di Isolamento Completo**

#### **Cross-Tenant Access Prevention**
```python
# test_multitenant_api.py
async def test_cross_tenant_access_prevention():
    """
    Verifica che tenant A non possa accedere a dati di tenant B.
    """
    # Create search execution per tenant A
    tenant_a_token = create_jwt_token(tenant_id="tenant_a", user_id="user_a")
    execution_response = await client.post(
        "/api/scraping/v2/execute-search",
        headers={"Authorization": f"Bearer {tenant_a_token}"},
        json=sample_search_request
    )
    execution_id = execution_response.json()["search_execution_id"]
    
    # Attempt access da tenant B (should fail)
    tenant_b_token = create_jwt_token(tenant_id="tenant_b", user_id="user_b")
    access_response = await client.get(
        f"/api/scraping/v2/results/{execution_id}",
        headers={"Authorization": f"Bearer {tenant_b_token}"}
    )
    
    # Verifica access denied
    assert access_response.status_code == 403
    assert "Access denied" in access_response.json()["error"]["message"]
```

#### **Data Isolation Verification**
```python
async def test_data_isolation_in_processing():
    """
    Verifica che processing pipeline mantiene isolamento.
    """
    # Process data per tenant A
    tenant_a_context = TenantContext(tenant_id="tenant_a", user_id="user_a")
    results_a = await data_pipeline.process_properties(
        sample_properties, 
        tenant_a_context
    )
    
    # Process stessi data per tenant B  
    tenant_b_context = TenantContext(tenant_id="tenant_b", user_id="user_b")
    results_b = await data_pipeline.process_properties(
        sample_properties,
        tenant_b_context
    )
    
    # Verifica che risultati hanno tenant_id corretti
    for result in results_a:
        assert result["tenant_id"] == "tenant_a"
        
    for result in results_b:
        assert result["tenant_id"] == "tenant_b"
    
    # Verifica no cross-contamination
    assert results_a != results_b  # Stesso input, diverso tenant context
```

## 🔧 Configuration Multi-Tenant

### **Tenant-Specific Settings**

```python
# config/tenant_settings.py
TENANT_SPECIFIC_CONFIG = {
    "default": {
        "max_concurrent_searches": 5,
        "max_results_per_search": 50,
        "rate_limit_requests_per_minute": 10
    },
    "tenant_premium": {
        "max_concurrent_searches": 20,
        "max_results_per_search": 200,
        "rate_limit_requests_per_minute": 60
    }
}

async def get_tenant_config(tenant_id: str) -> dict:
    """Get configuration specifica per tenant."""
    # Load tenant-specific config o fallback a default
    return TENANT_SPECIFIC_CONFIG.get(
        tenant_id, 
        TENANT_SPECIFIC_CONFIG["default"]
    )
```

## 🎯 Best Practices Multi-Tenant

### **Security Guidelines**

1. **Always Validate Tenant Access**: Mai assumere che token sia valido
2. **Context Propagation**: Tenant context in ogni operazione
3. **Defense in Depth**: Multiple layer di isolation checks
4. **Audit Everything**: Log completo per compliance

### **Performance Considerations**

1. **Tenant Partitioning**: Partizionamento storage per performance
2. **Resource Limits**: Limits per-tenant per fair usage
3. **Caching Strategy**: Cache isolation per tenant
4. **Background Processing**: Queue separation per tenant

### **Error Handling**

```python
# Sempre include tenant context in error handling
try:
    results = await process_tenant_data(data, tenant_ctx)
except Exception as e:
    logger.error(
        "Tenant operation failed",
        tenant_id=tenant_ctx.tenant_id,
        user_id=tenant_ctx.user_id,
        error=str(e),
        operation="data_processing"
    )
    raise TenantOperationError(
        f"Operation failed for tenant {tenant_ctx.tenant_id}"
    )
```

---

**🛡️ Il sistema multi-tenant garantisce isolamento completo e sicurezza. Per testing dell'isolation, esegui `python test_multitenant_api.py`.**
