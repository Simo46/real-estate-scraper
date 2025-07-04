# Development Guide - Python Scraper Service

## 💻 Panoramica Development

Questa guida fornisce tutto ciò che serve per sviluppare efficacemente sul Python Scraper Service. Copre setup ambiente, workflow di sviluppo, debugging, e best practices per contribuire al codice.

## 🚀 Development Cheat Sheet

### **Quick Commands**
```bash
# Setup development environment
cd services/python-scraper
python -m venv .venv && source .venv/bin/activate
pip install -r requirements/dev.txt

# Start development server
python app.py

# Run tests during development
python test_integration_pipeline.py    # Quick pipeline test
python test_multitenant_api.py        # Multi-tenant test
pytest tests/ -v                      # Full test suite

# Debug specific component
python -c "from services.data_pipeline import SearchResultMapper; print('OK')"

# Code quality checks
black services/ --check               # Code formatting
flake8 services/                     # Linting
mypy services/                       # Type checking
```

### **Development URLs**
- **API Server**: http://localhost:8002
- **Health Check**: http://localhost:8002/health
- **API Docs**: http://localhost:8002/docs (auto-generated)
- **Detailed Health**: http://localhost:8002/api/health/detailed

## 🛠️ Development Environment Setup

### **Prerequisites**
- **Python 3.12+**: Required per async features e type hints
- **Virtual Environment**: Isolamento dipendenze
- **Docker**: Per integration testing completo
- **Git**: Version control

### **Step-by-Step Setup**

#### **1. Repository Setup**
```bash
# Clone repository (se non già fatto)
git clone [repository-url]
cd real-estate-scraper/services/python-scraper

# Check branch corrente
git branch --show-current
```

#### **2. Python Environment**
```bash
# Create virtual environment
python -m venv .venv

# Activate (Linux/Mac)
source .venv/bin/activate

# Activate (Windows)
.venv\Scripts\activate

# Verify Python version
python --version  # Should be 3.12+
```

#### **3. Dependencies Installation**
```bash
# Install development dependencies
pip install -r requirements/dev.txt

# Verify installation
pip list | grep fastapi
pip list | grep pytest

# Install in editable mode per development
pip install -e .
```

#### **4. Environment Configuration**
```bash
# Copy environment template
cp .env.example .env

# Edit environment variables
vim .env
```

**Environment Variables for Development**:
```ini
# .env file
ENVIRONMENT=development
LOG_LEVEL=debug
HOST=0.0.0.0
PORT=8002

# Development settings
MAX_CONCURRENT_REQUESTS=50
TENANT_ISOLATION_ENABLED=true

# JWT settings (shared con API Gateway)
JWT_SECRET=development_secret_key
JWT_ALGORITHM=HS256

# Testing settings
TEST_MODE=true
```

#### **5. Verify Setup**
```bash
# Test basic import
python -c "from app import app; print('✓ App import OK')"

# Start development server
python app.py

# In another terminal - test health
curl http://localhost:8002/health
# Expected: {"status": "healthy"}
```

## 🔄 Development Workflow

### **Feature Development Process**

#### **1. Branch Strategy**
```bash
# Create feature branch
git checkout -b feature/description-of-feature

# Work on feature
git add .
git commit -m "Add: brief description of change"

# Push feature branch
git push origin feature/description-of-feature
```

#### **2. Development Cycle**
```bash
# 1. Edit code
vim services/data_pipeline.py

# 2. Run relevant tests
python test_data_pipeline.py

# 3. Test integration
python test_integration_pipeline.py

# 4. Format code
black services/

# 5. Check linting
flake8 services/

# 6. Commit changes
git add .
git commit -m "Fix: issue description"
```

#### **3. Testing During Development**
```bash
# Quick component test
python -m pytest tests/test_data_pipeline.py -v

# Test with coverage
pytest tests/ --cov=services/ --cov-report=term-missing

# Test specific function
pytest tests/test_data_pipeline.py::TestSearchResultMapper::test_price_normalization -v

# Test con real data (integration)
python test_integration_pipeline.py
```

### **Code Editing Best Practices**

#### **1. File Structure Understanding**
```
python-scraper/
├── app.py                 # FastAPI app entry point
├── config/               # Configuration e settings
├── api/                  # API layer
│   ├── routes/          # API endpoints
│   ├── middleware/      # Request middleware
│   └── models.py        # Pydantic schemas
├── services/            # Business logic
│   ├── data_pipeline.py      # Core data transformation
│   ├── geolocation_service.py # Location processing
│   └── image_validator.py    # Image validation
├── core/               # Core utilities
├── middleware/         # Global middleware
└── tests/             # Test files
```

#### **2. Adding New Features**

**Example: Adding New Property Field**

1. **Update Scraped Data Schema** (se necessario):
```python
# In scrapers/immobiliare_scraper.py
def extract_property_data(self, property_element):
    return {
        # ... existing fields ...
        "new_field": self._extract_new_field(property_element)
    }
```

2. **Update SearchResult Mapping**:
```python
# In services/data_pipeline.py  
class SearchResultMapper:
    async def transform_property(self, scraped_property: dict, tenant_context: TenantContext) -> dict:
        # ... existing mapping ...
        
        # Add new field processing
        new_field_value = self._process_new_field(scraped_property.get("new_field"))
        
        return {
            # ... existing fields ...
            "new_processed_field": new_field_value
        }
    
    def _process_new_field(self, raw_value: str) -> Any:
        """Process new field con validation e normalization."""
        if not raw_value:
            return None
        # Processing logic here
        return processed_value
```

3. **Update API Models**:
```python
# In api/models.py
class SearchResult(BaseModel):
    # ... existing fields ...
    new_processed_field: Optional[Any] = None
```

4. **Add Tests**:
```python
# In tests/test_data_pipeline.py
async def test_new_field_processing(self, mapper):
    """Test processing del nuovo campo."""
    scraped_data = {
        "new_field": "test_value"
    }
    
    result = await mapper.transform_property(scraped_data, tenant_context)
    
    assert result["new_processed_field"] == expected_value
```

#### **3. Modifying Existing Logic**

**Example: Migliorare Price Normalization**

```python
# In services/data_pipeline.py
def normalize_price(self, price_string: str) -> Optional[int]:
    """
    Enhanced price normalization con support per più format.
    """
    if not price_string or "trattativa" in price_string.lower():
        return None
    
    # NEW: Handle range prices "€300.000 - €450.000"
    if " - " in price_string:
        prices = price_string.split(" - ")
        # Take lower price del range
        price_string = prices[0]
    
    # Existing logic...
    clean_price = re.sub(r'[€$£\s]', '', price_string)
    
    # NEW: Handle decimal notation "€450.5K"
    if price_string.endswith('.5K'):
        base_price = float(price_string[:-3])
        return int(base_price * 1000)
    
    # ... rest of existing logic
```

### **Debugging e Troubleshooting**

#### **1. Local Debugging Setup**

**VS Code Configuration** (`.vscode/launch.json`):
```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Python Scraper Debug",
            "type": "python", 
            "request": "launch",
            "program": "app.py",
            "console": "integratedTerminal",
            "cwd": "${workspaceFolder}/services/python-scraper",
            "env": {
                "ENVIRONMENT": "development",
                "LOG_LEVEL": "debug"
            }
        }
    ]
}
```

#### **2. Logging per Debugging**

**Enable Debug Logging**:
```python
# In config/settings.py
LOG_LEVEL = "debug"  # Show all debug info

# In code - add debug logs
import structlog
logger = structlog.get_logger()

async def debug_function(data):
    logger.debug(
        "Function entry",
        input_data=data,
        function="debug_function"
    )
    
    # ... logic ...
    
    logger.debug(
        "Function exit", 
        result=result,
        processing_time=time.time() - start_time
    )
```

**View Logs in Real-Time**:
```bash
# Follow application logs
tail -f logs/app.log

# Filter specific tenant
tail -f logs/app.log | grep "tenant_456"

# Show only errors
tail -f logs/app.log | grep ERROR
```

#### **3. Component Testing**

**Test Single Components**:
```python
# Test data pipeline standalone
python -c "
from services.data_pipeline import SearchResultMapper
from api.models import TenantContext

mapper = SearchResultMapper()
ctx = TenantContext(tenant_id='test', user_id='test', role='user')

test_data = {
    'titolo': 'Test Property',
    'prezzo': '€ 300.000'
}

import asyncio
result = asyncio.run(mapper.transform_property(test_data, ctx))
print('Result:', result)
"
```

**Test API Endpoints**:
```bash
# Test con curl
curl -X POST http://localhost:8002/api/scraping/v2/execute-search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test_token" \
  -d '{
    "saved_search_id": "test_search",
    "search_criteria": {"location": "milano"},
    "platform": "immobiliare_it"
  }'
```

#### **4. Performance Debugging**

**Profile Function Performance**:
```python
import cProfile
import pstats
from io import StringIO

def profile_function():
    """Profile a specific function."""
    pr = cProfile.Profile()
    pr.enable()
    
    # Run function to profile
    result = your_function_to_profile()
    
    pr.disable()
    s = StringIO()
    ps = pstats.Stats(pr, stream=s).sort_stats('cumulative')
    ps.print_stats()
    
    print(s.getvalue())
    return result
```

**Memory Usage Monitoring**:
```python
import psutil
import os

def monitor_memory():
    """Monitor memory usage during processing."""
    process = psutil.Process(os.getpid())
    memory_mb = process.memory_info().rss / 1024 / 1024
    logger.info(f"Memory usage: {memory_mb:.1f} MB")
```

### **Code Quality e Standards**

#### **1. Code Formatting**

```bash
# Auto-format code con Black
black services/ api/ core/

# Check formatting without changes
black services/ --check

# Format single file
black services/data_pipeline.py
```

#### **2. Linting**

```bash
# Check linting issues
flake8 services/ api/ core/

# Ignore specific errors (se necessario)
flake8 services/ --ignore=E501,W503

# Check single file
flake8 services/data_pipeline.py
```

#### **3. Type Checking**

```bash
# Run MyPy type checking
mypy services/ api/ core/

# Check specific file
mypy services/data_pipeline.py

# Ignore missing imports (se necessario)
mypy services/ --ignore-missing-imports
```

#### **4. Pre-commit Hooks**

**Setup Pre-commit**:
```bash
# Install pre-commit
pip install pre-commit

# Install hooks
pre-commit install

# Run manually
pre-commit run --all-files
```

**Pre-commit Configuration** (`.pre-commit-config.yaml`):
```yaml
repos:
  - repo: https://github.com/psf/black
    rev: 23.3.0
    hooks:
      - id: black
        language_version: python3.12
        
  - repo: https://github.com/pycqa/flake8
    rev: 6.0.0
    hooks:
      - id: flake8
        
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.3.0
    hooks:
      - id: mypy
```

### **Performance Optimization**

#### **1. Profiling Guidelines**

**Identify Bottlenecks**:
```python
# Add timing decorators
import time
from functools import wraps

def timer(func):
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start = time.time()
        result = await func(*args, **kwargs)
        end = time.time()
        logger.info(f"{func.__name__} took {end-start:.2f}s")
        return result
    return wrapper

# Use decorator
@timer
async def slow_function():
    # Function implementation
    pass
```

**Memory Profiling**:
```bash
# Install memory profiler
pip install memory-profiler

# Profile memory usage
python -m memory_profiler your_script.py
```

#### **2. Common Performance Patterns**

**Async Best Practices**:
```python
# ✅ Good: Use asyncio.gather per parallel operations
async def process_multiple_properties(properties):
    tasks = [process_single_property(prop) for prop in properties]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return results

# ❌ Bad: Sequential processing
async def process_multiple_properties_slow(properties):
    results = []
    for prop in properties:
        result = await process_single_property(prop)
        results.append(result)
    return results
```

**HTTP Client Optimization**:
```python
# ✅ Good: Reuse HTTP client
class ImageValidator:
    def __init__(self):
        self.http_client = httpx.AsyncClient(
            timeout=5.0,
            limits=httpx.Limits(max_keepalive_connections=10)
        )
    
    async def validate_images(self, urls):
        # Reuse client for multiple requests
        tasks = [self._check_image(url) for url in urls]
        return await asyncio.gather(*tasks)

# ❌ Bad: Create new client per request
async def validate_image_slow(url):
    async with httpx.AsyncClient() as client:  # New client ogni volta
        response = await client.head(url)
        return response.status_code == 200
```

### **Error Handling Patterns**

#### **1. Structured Error Handling**

```python
# Custom exception types
class PipelineError(Exception):
    """Base exception per pipeline errors."""
    pass

class DataMappingError(PipelineError):
    """Error durante data mapping."""
    pass

class GeolocationError(PipelineError):
    """Error durante geolocation processing."""
    pass

# Usage pattern
async def transform_property(self, data: dict) -> dict:
    try:
        # Transformation logic
        return transformed_data
    except KeyError as e:
        logger.error("Missing required field", field=str(e), data=data)
        raise DataMappingError(f"Missing field: {e}")
    except Exception as e:
        logger.error("Unexpected transformation error", error=str(e))
        raise PipelineError("Property transformation failed")
```

#### **2. Graceful Degradation**

```python
async def process_with_fallback(self, data: dict) -> dict:
    """Process con fallback se components fail."""
    result = await self.basic_mapping(data)
    
    # Try geolocation enhancement (non-critical)
    try:
        location_data = await self.geolocation_service.process(data)
        result["location_data"] = location_data
    except GeolocationError:
        logger.warning("Geolocation failed, using basic location")
        result["location_data"] = {"error": "processing_failed"}
    
    # Try image validation (non-critical)
    try:
        image_data = await self.image_validator.validate(data.get("images", []))
        result["images"] = image_data
    except Exception:
        logger.warning("Image validation failed")
        result["images"] = {"error": "validation_failed"}
    
    return result
```

### **Integration Testing During Development**

#### **1. Local Integration Testing**

```bash
# Test con mock data
python test_integration_pipeline.py --use-mock-data

# Test con real scraping (limited)
python test_integration_pipeline.py --real-data --limit=5

# Test specific tenant scenario
python test_multitenant_api.py --tenant-id=test_tenant
```

#### **2. Docker Integration Testing**

```bash
# Build e test con Docker
docker compose -f docker-compose.dev.yml up python-scraper

# Test API attraverso Docker
curl http://localhost:8002/health

# View logs
docker compose logs -f python-scraper
```

---

**💻 Happy coding! Per domande o problemi, controlla prima i logs e i test. Usa sempre il workflow git corretto per contributi.**
