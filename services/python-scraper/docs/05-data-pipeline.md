# Data Pipeline - Python Scraper Service

## 🔄 Overview Pipeline

La **Data Pipeline** è il cuore del Python Scraper Service. Trasforma dati immobiliari raw scraped da Immobiliare.it in SearchResult normalizzati e arricchiti, pronti per l'integrazione con l'API Node.js principale.

## 🎯 Filosofia Pipeline

### **Principi di Design**

1. **Transform, Don't Store**: Processing real-time senza persistenza
2. **Quality First**: Ogni fase migliora la qualità dei dati
3. **Fail Gracefully**: Degradazione controllata su errori
4. **Tenant Isolation**: Context tenant attraverso tutta la pipeline

### **Pipeline Flow**
```
Raw Scraped Data → [Mapping] → [Geolocation] → [Images] → [Quality] → SearchResult
       ↓              ↓           ↓            ↓         ↓           ↓
[Platform JSON] → [Normalize] → [Enrich] → [Validate] → [Score] → [AI Insights]
```

## 🧩 Pipeline Components

### **1. SearchResultMapper** 

#### **Responsabilità Core**
Il `SearchResultMapper` in `services/data_pipeline.py` è il primo stadio della pipeline:

```python
class SearchResultMapper:
    """
    Trasforma proprietà scraped in SearchResult standardizzato.
    """
    
    async def transform_property(
        self, 
        scraped_property: dict, 
        tenant_context: TenantContext
    ) -> dict:
        """
        Main transformation method.
        
        Pipeline stages:
        1. Field mapping platform-specific → standard
        2. Data cleaning e normalization  
        3. Price processing e currency conversion
        4. Property details extraction
        5. Tenant context injection
        """
```

#### **Field Mapping Logic**

**Input Format (Immobiliare.it)**:
```python
scraped_property = {
    "titolo": "Appartamento Milano - Via Montenapoleone, 3 locali",
    "prezzo": "€ 450.000",
    "superficie": "85 mq commerciali", 
    "locali": "3 locali + cucina abitabile",
    "piano": "2° piano di 4",
    "spese_condominiali": "€ 150/mese",
    "classe_energetica": "C",
    "url": "https://www.immobiliare.it/annunci/12345",
    "indirizzo": "Via Montenapoleone, Milano MI",
    "descrizione": "Luminoso appartamento in palazzo d'epoca...",
    "caratteristiche": ["Ascensore", "Balcone", "Cantina"],
    "immagini": ["img1.jpg", "img2.jpg", "img3.jpg"]
}
```

**Output Format (SearchResult)**:
```python
search_result = {
    "external_url": "https://www.immobiliare.it/annunci/12345",
    "basic_title": "Appartamento Milano",  # Cleaned title
    "basic_price": 450000,  # Normalized integer
    "basic_location": "Milano, Via Montenapoleone",
    "property_details": {
        "rooms": 3,  # Extracted da "3 locali"
        "bathrooms": 1,  # Inferred o extracted
        "surface_area": 85,  # Numeric da "85 mq"
        "floor": 2,  # Extracted da "2° piano"
        "total_floors": 4,  # Extracted da "di 4"
        "elevator": True,  # From caratteristiche
        "balcony": True,  # From caratteristiche
        "energy_class": "C"
    },
    "additional_costs": {
        "monthly_fees": 150  # Da spese condominiali
    },
    "raw_description": "Luminoso appartamento in palazzo d'epoca...",
    "features": ["Ascensore", "Balcone", "Cantina"],
    "tenant_id": "tenant_456",  # Injected
    "scraped_at": "2025-01-01T10:00:00Z"
}
```

#### **Price Processing Algorithm**

```python
def normalize_price(price_string: str) -> Optional[int]:
    """
    Normalizza prezzi da formato human-readable a integer.
    
    Examples:
        "€ 450.000" → 450000
        "€450,000" → 450000  
        "450K" → 450000
        "Trattativa riservata" → None
    """
    if not price_string or "trattativa" in price_string.lower():
        return None
        
    # Remove currency symbols e spaces
    clean_price = re.sub(r'[€$£\s]', '', price_string)
    
    # Handle thousands separators
    clean_price = re.sub(r'[.,](?=\d{3}(?!\d))', '', clean_price)
    
    # Handle K/M notation
    if clean_price.endswith('K'):
        return int(float(clean_price[:-1]) * 1000)
    elif clean_price.endswith('M'):
        return int(float(clean_price[:-1]) * 1000000)
    
    try:
        return int(float(clean_price))
    except (ValueError, TypeError):
        return None
```

#### **Room Count Extraction**

```python
def extract_room_count(locali_string: str) -> Optional[int]:
    """
    Estrae numero stanze da description italiana.
    
    Patterns supportati:
    - "3 locali" → 3
    - "trilocale" → 3  
    - "3 locali + cucina" → 3
    - "tre stanze" → 3
    """
    ROOM_PATTERNS = [
        r'(\d+)\s*local',           # "3 locali"
        r'(\d+)\s*stanz',           # "3 stanze" 
        r'(bi|tri|quadri)locale',   # "trilocale"
        r'(due|tre|quattro)\s*stanz' # "tre stanze"
    ]
    
    WORD_TO_NUMBER = {
        'bi': 2, 'tri': 3, 'quadri': 4,
        'due': 2, 'tre': 3, 'quattro': 4
    }
    
    for pattern in ROOM_PATTERNS:
        match = re.search(pattern, locali_string.lower())
        if match:
            value = match.group(1)
            return WORD_TO_NUMBER.get(value, int(value) if value.isdigit() else None)
    
    return None
```

### **2. GeolocationProcessor**

#### **Location Normalization** (`services/geolocation_service.py`)

Il GeolocationProcessor arricchisce i dati location con informazioni geografiche italiane:

```python
class GeolocationProcessor:
    """
    Normalizza e arricchisce dati location per l'Italia.
    """
    
    def __init__(self):
        self.italian_cities_db = self._load_italian_cities()
        self.province_mapping = self._load_province_mapping()
    
    async def process_location(
        self, 
        location_string: str,
        search_criteria: dict = None
    ) -> LocationData:
        """
        Main processing method per location data.
        
        Steps:
        1. City/province extraction da location string
        2. Normalization usando database italiano
        3. Zone classification (centro/periferia)
        4. Coordinate lookup quando disponibili
        5. Relevance scoring vs search criteria
        """
```

#### **Italian Cities Database**

```python
ITALIAN_CITIES_DATABASE = {
    "milano": {
        "official_name": "Milano",
        "province": "Milano",
        "province_code": "MI", 
        "region": "Lombardia",
        "population": 1396059,
        "aliases": ["milan", "mailand", "milano città"],
        "zones": {
            "centro": [
                "centro storico", "brera", "porta garibaldi",
                "navigli", "porta venezia", "quadrilatero"
            ],
            "semicentro": [
                "porta romana", "lambrate", "città studi",
                "buenos aires", "porta genova"
            ],
            "periferia": [
                "bicocca", "niguarda", "bovisa", "quarto oggiaro"
            ]
        },
        "coordinates": {"lat": 45.4642, "lng": 9.1900}
    },
    # ... altre città italiane
}
```

#### **Location Processing Logic**

```python
async def normalize_location_string(self, location: str) -> LocationData:
    """
    Normalizza location string italiana.
    
    Examples:
        "Milano Centro" → {city: "Milano", zone: "centro"}
        "Roma, Trastevere" → {city: "Roma", zone: "trastevere"}
        "Firenze FI" → {city: "Firenze", province: "Firenze"}
    """
    # 1. Clean e standardize
    clean_location = self._clean_location_string(location)
    
    # 2. Extract city
    city_info = self._extract_city(clean_location)
    if not city_info:
        return LocationData(original=location, normalized=False)
    
    # 3. Extract zone/neighborhood
    zone_info = self._classify_zone(clean_location, city_info)
    
    # 4. Add coordinates
    coordinates = self._get_coordinates(city_info, zone_info)
    
    return LocationData(
        city=city_info["official_name"],
        province=city_info["province"],
        region=city_info["region"],
        zone_type=zone_info.get("type"),  # centro/semicentro/periferia
        zone_name=zone_info.get("name"),
        coordinates=coordinates,
        original=location,
        normalized=True
    )
```

#### **Zone Classification Algorithm**

```python
def classify_zone_type(self, location_text: str, city_info: dict) -> dict:
    """
    Classifica zona come centro/semicentro/periferia.
    """
    zone_keywords = city_info.get("zones", {})
    location_lower = location_text.lower()
    
    # Check exact zone matches
    for zone_type, zone_names in zone_keywords.items():
        for zone_name in zone_names:
            if zone_name in location_lower:
                return {
                    "type": zone_type,
                    "name": zone_name,
                    "confidence": 0.9
                }
    
    # Fallback: keyword-based classification
    centro_keywords = ["centro", "central", "storico"]
    periferia_keywords = ["periferia", "suburb", "fuori"]
    
    if any(keyword in location_lower for keyword in centro_keywords):
        return {"type": "centro", "confidence": 0.7}
    elif any(keyword in location_lower for keyword in periferia_keywords):
        return {"type": "periferia", "confidence": 0.7}
    
    return {"type": "unknown", "confidence": 0.1}
```

#### **Relevance Scoring**

```python
def calculate_location_relevance(
    self, 
    property_location: LocationData,
    search_criteria: dict
) -> float:
    """
    Calcola relevance score location vs criteri ricerca.
    
    Scoring factors:
    - Exact city match: +0.5
    - Province match: +0.3  
    - Zone type preference: +0.2
    - Distance from center: -0.1 to +0.1
    """
    score = 0.0
    search_location = search_criteria.get("location", "").lower()
    
    # City match
    if property_location.city.lower() in search_location:
        score += 0.5
    elif property_location.province.lower() in search_location:
        score += 0.3
        
    # Zone preference (implicit da search location)
    if "centro" in search_location and property_location.zone_type == "centro":
        score += 0.2
    elif "periferia" in search_location and property_location.zone_type == "periferia":
        score += 0.2
        
    return min(score, 1.0)  # Cap a 1.0
```

### **3. ImageValidator**

#### **Image Quality Assessment** (`services/image_validator.py`)

```python
class ImageValidator:
    """
    Valida e assess qualità immagini proprietà.
    """
    
    async def validate_property_images(
        self, 
        image_urls: List[str]
    ) -> ImageValidationResult:
        """
        Valida lista immagini e calcola quality score.
        
        Validation steps:
        1. URL format validation
        2. HTTP accessibility check
        3. Image dimension extraction (selective)
        4. Duplicate detection
        5. Quality scoring
        """
```

#### **URL Validation Logic**

```python
def is_valid_image_url(self, url: str) -> bool:
    """
    Valida format URL immagine.
    
    Supported formats: .jpg, .jpeg, .png, .webp
    Blocked patterns: thumbnails, watermarks
    """
    if not url or not url.startswith(('http://', 'https://')):
        return False
        
    # Check file extension
    valid_extensions = ['.jpg', '.jpeg', '.png', '.webp']
    if not any(url.lower().endswith(ext) for ext in valid_extensions):
        return False
        
    # Block low-quality patterns
    blocked_patterns = ['thumb', 'thumbnail', 'watermark', 'logo']
    if any(pattern in url.lower() for pattern in blocked_patterns):
        return False
        
    return True
```

#### **Async Image Checking**

```python
async def check_image_accessibility(self, urls: List[str]) -> List[dict]:
    """
    Check accessibility immagini via HTTP HEAD requests.
    """
    async with httpx.AsyncClient(timeout=5.0) as client:
        tasks = [
            self._check_single_image(client, url) 
            for url in urls[:10]  # Limit per performance
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
    return [r for r in results if isinstance(r, dict)]

async def _check_single_image(self, client: httpx.AsyncClient, url: str) -> dict:
    """Check singola immagine."""
    try:
        response = await client.head(url)
        if response.status_code == 200:
            content_type = response.headers.get('content-type', '')
            content_length = int(response.headers.get('content-length', 0))
            
            return {
                "url": url,
                "accessible": True,
                "content_type": content_type,
                "size_bytes": content_length,
                "estimated_dimensions": self._estimate_dimensions(content_length)
            }
    except Exception as e:
        logger.debug(f"Image check failed for {url}: {e}")
        
    return {"url": url, "accessible": False}
```

#### **Quality Scoring Algorithm**

```python
def calculate_image_quality_score(self, validation_results: List[dict]) -> float:
    """
    Calcola overall quality score per le immagini.
    
    Scoring factors:
    - Image count: Più immagini = score migliore
    - Accessibility: Immagini accessibili vs broken links
    - Estimated size: Dimensioni stimate da content-length
    - Variety: Diversità nelle dimensioni
    """
    if not validation_results:
        return 0.0
        
    accessible_images = [r for r in validation_results if r.get("accessible")]
    if not accessible_images:
        return 0.1  # Minimal score se nessuna immagine accessible
    
    # Base score da count
    image_count = len(accessible_images)
    count_score = min(image_count / 8.0, 1.0)  # Optimal: 8+ images
    
    # Size quality score
    size_scores = []
    for img in accessible_images:
        size_bytes = img.get("size_bytes", 0)
        if size_bytes > 100000:  # >100KB = good quality
            size_scores.append(0.9)
        elif size_bytes > 50000:  # >50KB = medium
            size_scores.append(0.6)
        else:  # Small images
            size_scores.append(0.3)
    
    avg_size_score = sum(size_scores) / len(size_scores) if size_scores else 0.5
    
    # Combine scores
    final_score = (count_score * 0.6) + (avg_size_score * 0.4)
    return round(final_score, 2)
```

### **4. Quality Assessment & AI Insights**

#### **Overall Quality Scoring**

```python
class QualityAssessment:
    """
    Calcola quality score e AI insights per SearchResult.
    """
    
    def calculate_overall_quality(self, search_result: dict) -> dict:
        """
        Calcola quality score complessivo e genera AI insights.
        
        Quality factors:
        - Data completeness (40%)
        - Image quality (30%) 
        - Location accuracy (20%)
        - Price reasonableness (10%)
        """
        # Data completeness score
        completeness = self._calculate_completeness_score(search_result)
        
        # Image quality score  
        image_quality = search_result.get("images", {}).get("quality_score", 0.5)
        
        # Location accuracy
        location_relevance = search_result.get("location_data", {}).get("relevance_score", 0.5)
        
        # Price reasonableness (vs market data se disponibile)
        price_score = self._assess_price_reasonableness(search_result)
        
        # Weighted average
        overall_score = (
            completeness * 0.4 +
            image_quality * 0.3 + 
            location_relevance * 0.2 +
            price_score * 0.1
        )
        
        return {
            "quality_score": round(overall_score, 2),
            "breakdown": {
                "completeness": completeness,
                "images": image_quality, 
                "location": location_relevance,
                "price": price_score
            }
        }
```

#### **AI Insights Generation**

```python
def generate_ai_insights(self, search_result: dict, quality_data: dict) -> dict:
    """
    Genera AI insights e recommendations.
    """
    insights = {
        "recommendation": self._generate_recommendation(quality_data),
        "summary": self._generate_summary(search_result),
        "strengths": self._identify_strengths(search_result, quality_data),
        "considerations": self._identify_considerations(search_result, quality_data)
    }
    
    return insights

def _generate_recommendation(self, quality_data: dict) -> str:
    """Generate recommendation basata su quality score."""
    score = quality_data["quality_score"]
    
    if score >= 0.8:
        return "Ottima corrispondenza - altamente raccomandato"
    elif score >= 0.6:
        return "Buona corrispondenza - da considerare"
    elif score >= 0.4:
        return "Discreta corrispondenza - verifica dettagli"
    else:
        return "Corrispondenza limitata - richiede approfondimento"

def _identify_strengths(self, search_result: dict, quality_data: dict) -> List[str]:
    """Identifica punti di forza della proprietà."""
    strengths = []
    
    # Location strengths
    location_data = search_result.get("location_data", {})
    if location_data.get("zone_type") == "centro":
        strengths.append("Posizione centrale")
    
    # Property strengths
    details = search_result.get("property_details", {})
    if details.get("elevator"):
        strengths.append("Presenza ascensore")
    if details.get("balcony"):
        strengths.append("Balcone disponibile")
        
    # Image strengths
    if quality_data["breakdown"]["images"] > 0.7:
        strengths.append("Buona documentazione fotografica")
        
    return strengths
```

## 🔄 Pipeline Execution Flow

### **Complete Processing Example**

```python
async def process_complete_pipeline(
    scraped_properties: List[dict],
    search_criteria: dict,
    tenant_context: TenantContext
) -> List[dict]:
    """
    Esegue pipeline completa per lista proprietà.
    """
    processed_results = []
    
    for property_data in scraped_properties:
        try:
            # Stage 1: Data Mapping
            mapped_result = await search_result_mapper.transform_property(
                property_data, 
                tenant_context
            )
            
            # Stage 2: Geolocation Processing
            location_data = await geolocation_processor.process_location(
                mapped_result.get("basic_location", ""),
                search_criteria
            )
            mapped_result["location_data"] = location_data.__dict__
            
            # Stage 3: Image Validation
            image_urls = property_data.get("immagini", [])
            image_results = await image_validator.validate_property_images(image_urls)
            mapped_result["images"] = image_results.__dict__
            
            # Stage 4: Quality Assessment
            quality_data = quality_assessor.calculate_overall_quality(mapped_result)
            ai_insights = quality_assessor.generate_ai_insights(mapped_result, quality_data)
            
            mapped_result.update({
                "relevance_score": quality_data["quality_score"],
                "ai_insights": ai_insights
            })
            
            processed_results.append(mapped_result)
            
        except Exception as e:
            # Graceful degradation: log error ma continua processing
            logger.error(
                "Property processing failed",
                property_url=property_data.get("url"),
                error=str(e),
                tenant_id=tenant_context.tenant_id
            )
            
            # Add minimal result per visibility
            processed_results.append({
                "external_url": property_data.get("url", ""),
                "basic_title": "Errore Processing",
                "basic_price": None,
                "processing_error": True,
                "error_message": "Dati non disponibili",
                "tenant_id": tenant_context.tenant_id
            })
    
    return processed_results
```

## 📊 Pipeline Monitoring

### **Performance Metrics**

```python
class PipelineMetrics:
    """Monitoring performance pipeline."""
    
    async def record_pipeline_execution(
        self,
        execution_id: str,
        tenant_id: str,
        metrics: dict
    ):
        """Record metrics esecuzione pipeline."""
        pipeline_stats = {
            "execution_id": execution_id,
            "tenant_id": tenant_id,
            "total_properties": metrics["input_count"],
            "successfully_processed": metrics["success_count"],
            "processing_errors": metrics["error_count"],
            "total_time_ms": metrics["total_time_ms"],
            "average_time_per_property": metrics["total_time_ms"] / metrics["input_count"],
            "stages_performance": {
                "mapping_ms": metrics.get("mapping_time", 0),
                "geolocation_ms": metrics.get("geolocation_time", 0),
                "images_ms": metrics.get("images_time", 0),
                "quality_ms": metrics.get("quality_time", 0)
            },
            "quality_distribution": metrics.get("quality_scores", [])
        }
        
        logger.info(
            "Pipeline execution completed",
            **pipeline_stats
        )
```

### **Error Tracking**

```python
# Pipeline error patterns da monitorare
PIPELINE_ERROR_PATTERNS = {
    "mapping_errors": "Errori nel mapping dati platform-specific",
    "geolocation_failures": "Fallimenti normalizzazione location",
    "image_validation_timeouts": "Timeout validation immagini",
    "quality_assessment_errors": "Errori calcolo quality score"
}

async def track_pipeline_errors(error: Exception, stage: str, context: dict):
    """Track errori pipeline per monitoring."""
    error_data = {
        "stage": stage,
        "error_type": type(error).__name__,
        "error_message": str(error),
        "tenant_id": context.get("tenant_id"),
        "property_url": context.get("property_url"),
        "timestamp": datetime.utcnow().isoformat()
    }
    
    logger.error("Pipeline stage error", **error_data)
    
    # Increment error counter per monitoring
    await pipeline_metrics.increment_error_counter(stage, error_data)
```

---

**🔄 La Data Pipeline è il cuore del processing. Per test completo, esegui `python test_integration_pipeline.py`.**
