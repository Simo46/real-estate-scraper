# Testing Guide - Python Scraper Service

## 🧪 Panoramica Testing

Il Python Scraper Service implementa una **strategia di testing completa** che copre tutti i livelli dell'architettura, dal testing unitario dei singoli componenti fino ai test di integrazione end-to-end della pipeline completa.

## 🎯 Strategia Testing

### **Testing Pyramid**

```
         [E2E Tests]           <- Full pipeline integration
        /           \
   [Integration Tests]         <- Component interaction  
  /                   \
[Unit Tests]     [API Tests]   <- Individual components
```

### **Test Categories**

1. **Unit Tests**: Singoli componenti isolati
2. **Integration Tests**: Interaction tra componenti
3. **API Tests**: Endpoint testing con tenant isolation
4. **Pipeline Tests**: End-to-end data flow
5. **Multi-Tenant Tests**: Isolation e security

## 🛠️ Testing Cheat Sheet

### **Quick Test Commands**
```bash
# Test pipeline completa end-to-end
python test_integration_pipeline.py

# Test isolamento multi-tenant
python test_multitenant_api.py

# Test componenti specifici
python test_data_pipeline.py        # Data mapping
python test_geolocation_service.py  # Location processing
python test_image_validator.py      # Image validation

# Test con pytest (coverage completo)
pytest tests/ -v --cov=services/

# Test specifico modulo
pytest tests/test_data_pipeline.py -v

# Test con output dettagliato
pytest tests/ -v -s --tb=short
```

### **Test Environment Setup**
```bash
# Setup testing environment
cd services/python-scraper
python -m venv .venv
source .venv/bin/activate

# Install testing dependencies
pip install -r requirements/dev.txt

# Run all tests
python -m pytest tests/ -v
```

## 🔬 Unit Testing

### **Data Pipeline Unit Tests**

#### **SearchResultMapper Testing** (`test_data_pipeline.py`)

```python
import pytest
from services.data_pipeline import SearchResultMapper
from api.models import TenantContext

class TestSearchResultMapper:
    """Test suite per SearchResultMapper."""
    
    @pytest.fixture
    def mapper(self):
        return SearchResultMapper()
    
    @pytest.fixture  
    def tenant_context(self):
        return TenantContext(
            tenant_id="test_tenant",
            user_id="test_user",
            role="user"
        )
    
    @pytest.fixture
    def sample_scraped_property(self):
        return {
            "titolo": "Appartamento Milano - Via Montenapoleone, 3 locali",
            "prezzo": "€ 450.000",
            "superficie": "85 mq commerciali",
            "locali": "3 locali + cucina abitabile", 
            "piano": "2° piano di 4",
            "url": "https://www.immobiliare.it/annunci/12345",
            "immagini": ["img1.jpg", "img2.jpg"]
        }
    
    async def test_basic_property_mapping(
        self, 
        mapper, 
        sample_scraped_property, 
        tenant_context
    ):
        """Test mapping base da scraped data a SearchResult."""
        result = await mapper.transform_property(
            sample_scraped_property, 
            tenant_context
        )
        
        # Verify basic fields
        assert result["external_url"] == "https://www.immobiliare.it/annunci/12345"
        assert result["basic_title"] == "Appartamento Milano"
        assert result["basic_price"] == 450000
        assert result["tenant_id"] == "test_tenant"
        
        # Verify property details extraction
        details = result["property_details"]
        assert details["rooms"] == 3
        assert details["surface_area"] == 85
        assert details["floor"] == 2
        assert details["total_floors"] == 4
    
    @pytest.mark.parametrize("price_input,expected", [
        ("€ 450.000", 450000),
        ("€450,000", 450000),
        ("450K", 450000),
        ("Trattativa riservata", None),
        ("€ 1.200.000", 1200000),
        ("invalid", None)
    ])
    async def test_price_normalization(self, mapper, price_input, expected):
        """Test normalization prezzi da format diversi."""
        result = mapper.normalize_price(price_input)
        assert result == expected
    
    @pytest.mark.parametrize("locali_input,expected", [
        ("3 locali", 3),
        ("trilocale", 3),
        ("3 locali + cucina", 3),
        ("tre stanze", 3),
        ("bilocale", 2),
        ("invalid", None)
    ])
    async def test_room_extraction(self, mapper, locali_input, expected):
        """Test estrazione numero stanze."""
        result = mapper.extract_room_count(locali_input)
        assert result == expected
```

### **Geolocation Service Unit Tests**

```python
class TestGeolocationProcessor:
    """Test suite per GeolocationProcessor."""
    
    @pytest.fixture
    def geo_processor(self):
        return GeolocationProcessor()
    
    @pytest.mark.parametrize("location_input,expected_city,expected_zone", [
        ("Milano Centro", "Milano", "centro"),
        ("Roma, Trastevere", "Roma", "trastevere"),
        ("Firenze FI", "Firenze", None),
        ("Milano, Via Montenapoleone", "Milano", "centro"),
        ("Location Unknown", None, None)
    ])
    async def test_location_normalization(
        self, 
        geo_processor, 
        location_input, 
        expected_city, 
        expected_zone
    ):
        """Test normalization location strings."""
        result = await geo_processor.normalize_location_string(location_input)
        
        if expected_city:
            assert result.city == expected_city
            assert result.normalized == True
            if expected_zone:
                assert result.zone_type == expected_zone
        else:
            assert result.normalized == False
    
    async def test_relevance_scoring(self, geo_processor):
        """Test relevance scoring vs search criteria."""
        location_data = LocationData(
            city="Milano",
            province="Milano",
            region="Lombardia",
            zone_type="centro"
        )
        
        search_criteria = {"location": "milano centro"}
        
        score = geo_processor.calculate_location_relevance(
            location_data, 
            search_criteria
        )
        
        assert score >= 0.7  # High score per exact match
        assert score <= 1.0
```

### **Image Validator Unit Tests**

```python
class TestImageValidator:
    """Test suite per ImageValidator."""
    
    @pytest.fixture
    def image_validator(self):
        return ImageValidator()
    
    @pytest.mark.parametrize("url,expected_valid", [
        ("https://img.immobiliare.it/foto.jpg", True),
        ("https://example.com/image.png", True),
        ("https://site.com/photo.webp", True),
        ("http://site.com/thumb.jpg", False),  # Blocked pattern
        ("invalid-url", False),
        ("https://site.com/document.pdf", False)  # Wrong format
    ])
    def test_url_validation(self, image_validator, url, expected_valid):
        """Test validation URL format."""
        result = image_validator.is_valid_image_url(url)
        assert result == expected_valid
    
    async def test_quality_scoring(self, image_validator):
        """Test image quality scoring algorithm."""
        validation_results = [
            {"url": "img1.jpg", "accessible": True, "size_bytes": 150000},
            {"url": "img2.jpg", "accessible": True, "size_bytes": 80000},
            {"url": "img3.jpg", "accessible": False},
            {"url": "img4.jpg", "accessible": True, "size_bytes": 200000}
        ]
        
        score = image_validator.calculate_image_quality_score(validation_results)
        
        assert 0.0 <= score <= 1.0
        assert score > 0.5  # Should be decent con 3/4 accessible images
```

## 🔗 Integration Testing

### **Pipeline Integration Tests** (`test_integration_pipeline.py`)

```python
class TestPipelineIntegration:
    """Test integration completa della pipeline."""
    
    @pytest.fixture
    def sample_scraped_properties(self):
        return [
            {
                "titolo": "Appartamento Milano Centro",
                "prezzo": "€ 450.000",
                "superficie": "85 mq",
                "locali": "3 locali",
                "indirizzo": "Milano, Centro Storico",
                "url": "https://immobiliare.it/12345",
                "immagini": [
                    "https://img.immobiliare.it/foto1.jpg",
                    "https://img.immobiliare.it/foto2.jpg"
                ]
            },
            {
                "titolo": "Villa Roma EUR",
                "prezzo": "€ 850.000", 
                "superficie": "150 mq",
                "locali": "4 locali + cucina",
                "indirizzo": "Roma, EUR",
                "url": "https://immobiliare.it/67890",
                "immagini": ["https://img.immobiliare.it/villa1.jpg"]
            }
        ]
    
    @pytest.fixture
    def search_criteria(self):
        return {
            "location": "milano",
            "property_type": "apartment",
            "min_price": 300000,
            "max_price": 600000
        }
    
    async def test_complete_pipeline_processing(
        self,
        sample_scraped_properties,
        search_criteria,
        tenant_context
    ):
        """Test pipeline completa end-to-end."""
        # Execute complete pipeline
        results = await pipeline_processor.process_complete_pipeline(
            sample_scraped_properties,
            search_criteria, 
            tenant_context
        )
        
        assert len(results) == 2
        
        # Verify first result (Milano - should match criteria)
        milano_result = results[0]
        assert milano_result["basic_title"] == "Appartamento Milano Centro"
        assert milano_result["basic_price"] == 450000
        assert milano_result["tenant_id"] == tenant_context.tenant_id
        
        # Verify location data processing
        location_data = milano_result["location_data"]
        assert location_data["city"] == "Milano"
        assert location_data["zone_type"] == "centro"
        assert location_data["normalized"] == True
        
        # Verify image validation
        images = milano_result["images"]
        assert images["image_count"] == 2
        assert images["quality_score"] > 0
        
        # Verify AI insights generation
        ai_insights = milano_result["ai_insights"]
        assert "recommendation" in ai_insights
        assert "quality_score" in ai_insights
        assert 0 <= ai_insights["quality_score"] <= 1
        
        # Verify relevance scoring
        assert milano_result["relevance_score"] > 0.5  # Should match search criteria
    
    async def test_pipeline_error_handling(self, tenant_context):
        """Test graceful degradation su errori."""
        # Property con dati malformed
        malformed_property = {
            "titolo": None,  # Missing title
            "prezzo": "invalid price",
            "url": "not-a-url"
        }
        
        results = await pipeline_processor.process_complete_pipeline(
            [malformed_property],
            {},
            tenant_context
        )
        
        # Should handle gracefully
        assert len(results) == 1
        result = results[0]
        
        # Should have error indicators
        assert result.get("processing_error") == True
        assert "error_message" in result
        assert result["tenant_id"] == tenant_context.tenant_id
    
    async def test_pipeline_performance(
        self,
        sample_scraped_properties,
        tenant_context
    ):
        """Test performance pipeline su dataset."""
        import time
        
        start_time = time.time()
        
        results = await pipeline_processor.process_complete_pipeline(
            sample_scraped_properties * 10,  # 20 properties
            {},
            tenant_context
        )
        
        end_time = time.time()
        processing_time = end_time - start_time
        
        # Performance assertions
        assert len(results) == 20
        assert processing_time < 30.0  # Should complete in <30 seconds
        
        # Average time per property
        avg_time_per_property = processing_time / 20
        assert avg_time_per_property < 2.5  # Target: <2.5s per property
```

## 🔐 Multi-Tenant Testing

### **Tenant Isolation Tests** (`test_multitenant_api.py`)

```python
class TestMultiTenantIsolation:
    """Test complete isolation multi-tenant."""
    
    @pytest.fixture
    def tenant_a_context(self):
        return TenantContext(
            tenant_id="tenant_a",
            user_id="user_a", 
            role="user"
        )
    
    @pytest.fixture
    def tenant_b_context(self):
        return TenantContext(
            tenant_id="tenant_b",
            user_id="user_b",
            role="user"
        )
    
    async def test_data_isolation_in_processing(
        self, 
        tenant_a_context, 
        tenant_b_context
    ):
        """Test che processing mantiene isolamento dati."""
        sample_property = {
            "titolo": "Test Property",
            "prezzo": "€ 300.000",
            "url": "https://test.com/property"
        }
        
        # Process same data per entrambi i tenant
        result_a = await data_pipeline.process_properties(
            [sample_property],
            tenant_a_context
        )
        
        result_b = await data_pipeline.process_properties(
            [sample_property],
            tenant_b_context  
        )
        
        # Verify tenant isolation
        assert result_a[0]["tenant_id"] == "tenant_a"
        assert result_b[0]["tenant_id"] == "tenant_b"
        
        # Same input, different tenant context should have different IDs
        assert result_a[0]["tenant_id"] != result_b[0]["tenant_id"]
    
    async def test_tenant_context_propagation(self, tenant_a_context):
        """Test che tenant context si propaga attraverso pipeline."""
        property_data = {
            "titolo": "Context Test Property",
            "prezzo": "€ 400.000"
        }
        
        # Process attraverso tutti gli stages
        mapped = await search_result_mapper.transform_property(
            property_data, 
            tenant_a_context
        )
        
        enhanced = await geolocation_processor.process_with_context(
            mapped,
            tenant_a_context
        )
        
        # Verify context propagation
        assert mapped["tenant_id"] == "tenant_a"
        assert enhanced.get("tenant_context", {}).get("tenant_id") == "tenant_a"
    
    async def test_cross_tenant_access_prevention(self):
        """Test che tenant non può accedere a dati di altri tenant."""
        # Setup: Create execution per tenant A
        tenant_a_execution = await create_test_search_execution("tenant_a")
        execution_id = tenant_a_execution["search_execution_id"]
        
        # Test: Tenant B prova ad accedere
        tenant_b_context = TenantContext(
            tenant_id="tenant_b",
            user_id="user_b",
            role="user"
        )
        
        # Should raise ForbiddenError
        with pytest.raises(ForbiddenError):
            await search_execution_service.get_results(
                execution_id,
                tenant_b_context
            )
```

## 🌐 API Testing

### **FastAPI Test Client Setup**

```python
import pytest
from fastapi.testclient import TestClient
from app import app

class TestAPI:
    """Test API endpoints con authentication."""
    
    @pytest.fixture
    def client(self):
        return TestClient(app)
    
    @pytest.fixture
    def auth_headers_tenant_a(self):
        token = create_test_jwt_token(
            tenant_id="tenant_a",
            user_id="user_a"
        )
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture
    def auth_headers_tenant_b(self):
        token = create_test_jwt_token(
            tenant_id="tenant_b", 
            user_id="user_b"
        )
        return {"Authorization": f"Bearer {token}"}
    
    def test_execute_search_endpoint(self, client, auth_headers_tenant_a):
        """Test execute search API endpoint."""
        search_request = {
            "saved_search_id": "search_123",
            "search_criteria": {
                "location": "milano",
                "property_type": "apartment"
            },
            "platform": "immobiliare_it",
            "max_results": 20
        }
        
        response = client.post(
            "/api/scraping/v2/execute-search",
            headers=auth_headers_tenant_a,
            json=search_request
        )
        
        assert response.status_code == 202
        data = response.json()
        
        assert "search_execution_id" in data
        assert data["tenant_id"] == "tenant_a"
        assert data["status"] == "pending"
    
    def test_get_results_endpoint(self, client, auth_headers_tenant_a):
        """Test get results API endpoint."""
        # Setup: Create search execution
        execution_id = "test_execution_123"
        
        response = client.get(
            f"/api/scraping/v2/results/{execution_id}",
            headers=auth_headers_tenant_a
        )
        
        # May be 404 se execution non esiste, ma should not be 401/403
        assert response.status_code in [200, 202, 404]
        
        if response.status_code == 200:
            data = response.json()
            assert "results" in data
            assert data["tenant_id"] == "tenant_a"
    
    def test_cross_tenant_api_access(
        self, 
        client, 
        auth_headers_tenant_a, 
        auth_headers_tenant_b
    ):
        """Test API isolation tra tenant."""
        # Create execution con tenant A
        execution_response = client.post(
            "/api/scraping/v2/execute-search",
            headers=auth_headers_tenant_a,
            json={
                "saved_search_id": "test_search",
                "search_criteria": {"location": "test"},
                "platform": "immobiliare_it"
            }
        )
        
        execution_id = execution_response.json()["search_execution_id"]
        
        # Try access con tenant B (should fail)
        access_response = client.get(
            f"/api/scraping/v2/results/{execution_id}",
            headers=auth_headers_tenant_b
        )
        
        assert access_response.status_code == 403
        assert "Access denied" in access_response.json()["error"]["message"]
```

## 📊 Test Monitoring & Reporting

### **Test Coverage Analysis**

```python
# coverage.py configuration
[run]
source = services/, api/, core/
omit = 
    tests/*
    */migrations/*
    */venv/*
    */__pycache__/*

[report]
exclude_lines =
    pragma: no cover
    def __repr__
    if self.debug:
    if settings.DEBUG
    raise AssertionError
    raise NotImplementedError
```

### **Performance Benchmarking**

```python
class TestPerformanceBenchmarks:
    """Performance benchmarks per monitoring regression."""
    
    @pytest.mark.performance
    async def test_data_pipeline_performance(self):
        """Benchmark data pipeline processing."""
        properties = generate_test_properties(100)  # 100 properties
        tenant_ctx = create_test_tenant_context()
        
        start_time = time.time()
        results = await pipeline_processor.process_complete_pipeline(
            properties,
            {},
            tenant_ctx
        )
        end_time = time.time()
        
        processing_time = end_time - start_time
        
        # Performance assertions
        assert len(results) == 100
        assert processing_time < 60.0  # Max 60 seconds per 100 properties
        
        avg_time = processing_time / 100
        assert avg_time < 0.6  # Max 600ms per property
        
        # Log performance metrics
        logger.info(
            "Pipeline performance benchmark",
            total_time=processing_time,
            avg_per_property=avg_time,
            properties_count=100
        )
    
    @pytest.mark.performance  
    async def test_api_response_time(self, client, auth_headers):
        """Benchmark API response times."""
        start_time = time.time()
        
        response = client.post(
            "/api/scraping/v2/execute-search",
            headers=auth_headers,
            json=create_test_search_request()
        )
        
        end_time = time.time()
        response_time = end_time - start_time
        
        assert response.status_code == 202
        assert response_time < 2.0  # Max 2 seconds per API call
```

### **Test Utilities**

```python
# tests/conftest.py - Shared test utilities
import pytest
from datetime import datetime, timedelta
import jwt

@pytest.fixture
def tenant_context():
    """Default tenant context per tests."""
    return TenantContext(
        tenant_id="test_tenant",
        user_id="test_user",
        role="user"
    )

def create_test_jwt_token(tenant_id: str, user_id: str) -> str:
    """Create JWT token per testing."""
    payload = {
        "user_id": user_id,
        "tenant_id": tenant_id,
        "role": "user",
        "exp": datetime.utcnow() + timedelta(hours=1),
        "iat": datetime.utcnow()
    }
    return jwt.encode(payload, "test_secret", algorithm="HS256")

def generate_test_properties(count: int) -> List[dict]:
    """Generate test properties per performance testing."""
    return [
        {
            "titolo": f"Test Property {i}",
            "prezzo": f"€ {300000 + i * 1000}",
            "superficie": f"{80 + i} mq",
            "locali": f"{2 + (i % 3)} locali",
            "url": f"https://test.com/property-{i}"
        }
        for i in range(count)
    ]
```

## 🚀 Continuous Testing

### **GitHub Actions Integration**

```yaml
# .github/workflows/python-scraper-tests.yml
name: Python Scraper Tests

on:
  push:
    paths:
      - 'services/python-scraper/**'
  pull_request:
    paths:
      - 'services/python-scraper/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.12'
          
      - name: Install dependencies
        working-directory: services/python-scraper
        run: |
          pip install -r requirements/dev.txt
          
      - name: Run tests with coverage
        working-directory: services/python-scraper
        run: |
          pytest tests/ -v --cov=services/ --cov-report=xml
          
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: services/python-scraper/coverage.xml
```

---

**🧪 Esegui sempre i test prima di commit! Per test completo: `python test_integration_pipeline.py && python test_multitenant_api.py`**
