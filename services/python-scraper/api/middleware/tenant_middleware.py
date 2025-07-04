"""
Multi-Tenant Data Isolation Middleware

Assicura isolamento dati per tenant nell'architettura multi-tenant.
Integra con il sistema di autenticazione esistente per fornire sicurezza a livello dati.
"""

from typing import Dict, List, Any, Optional
from datetime import datetime
import structlog
from uuid import uuid4

from services.data_pipeline import SearchResultMapper
from services.geolocation_service import GeolocationProcessor
from services.image_validator import ImageValidator

logger = structlog.get_logger(__name__)


class TenantDataIsolation:
    """Assicura isolamento dati per tenant."""
    
    def __init__(self):
        self.search_mapper = SearchResultMapper()
        self.geo_processor = GeolocationProcessor()
        
    def filter_results_by_tenant(
        self, 
        results: List[Dict[str, Any]], 
        tenant_id: str
    ) -> List[Dict[str, Any]]:
        """
        Filtra risultati per tenant specifico.
        
        Args:
            results: Lista di risultati search
            tenant_id: ID del tenant richiedente
            
        Returns:
            Lista filtrata per il tenant
        """
        logger.info(
            "Filtering results by tenant",
            tenant_id=tenant_id,
            total_results=len(results)
        )
        
        # Filter results che appartengono al tenant
        filtered_results = []
        for result in results:
            result_tenant_id = result.get('tenant_id')
            
            if result_tenant_id == tenant_id:
                # Rimuovi campi sensibili che potrebbero essere cross-tenant
                cleaned_result = self._clean_result_for_tenant(result, tenant_id)
                filtered_results.append(cleaned_result)
            else:
                logger.debug(
                    "Excluded result for different tenant",
                    result_tenant_id=result_tenant_id,
                    requesting_tenant_id=tenant_id,
                    result_id=result.get('id', 'unknown')
                )
        
        logger.info(
            "Results filtered by tenant",
            tenant_id=tenant_id,
            filtered_count=len(filtered_results),
            excluded_count=len(results) - len(filtered_results)
        )
        
        return filtered_results
    
    def create_search_execution_for_tenant(
        self, 
        search_data: Dict[str, Any], 
        tenant_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """
        Crea SearchExecution con tenant isolation.
        
        Args:
            search_data: Dati della ricerca
            tenant_id: ID del tenant
            user_id: ID dell'utente
            
        Returns:
            SearchExecution creato con isolamento tenant
        """
        search_execution_id = str(uuid4())
        
        logger.info(
            "Creating search execution for tenant",
            tenant_id=tenant_id,
            user_id=user_id,
            search_execution_id=search_execution_id
        )
        
        # Crea SearchExecution con tenant isolation
        search_execution = {
            'id': search_execution_id,
            'tenant_id': tenant_id,
            'user_id': user_id,
            'status': 'pending',
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat(),
            
            # Search parameters isolati per tenant
            'search_criteria': search_data.get('search_criteria', {}),
            'saved_search_id': search_data.get('saved_search_id'),
            'platform': search_data.get('platform', 'immobiliare_it'),
            'max_results': min(search_data.get('max_results', 100), 500),  # Limite per tenant
            
            # Metadata di tracking
            'metadata': {
                'source': 'python_scraper_api',
                'tenant_isolated': True,
                'created_by_user': user_id,
                'execution_context': 'multi_tenant'
            }
        }
        
        logger.info(
            "Search execution created for tenant",
            tenant_id=tenant_id,
            search_execution_id=search_execution_id,
            max_results=search_execution['max_results']
        )
        
        return search_execution
    
    def process_scraped_properties_for_tenant(
        self,
        properties: List[Dict[str, Any]],
        search_execution_id: str,
        tenant_id: str,
        saved_search_id: str,
        search_criteria: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Processa proprietà scraped per tenant specifico usando la pipeline dati.
        
        Args:
            properties: Lista proprietà scraped
            search_execution_id: ID dell'esecuzione
            tenant_id: ID del tenant
            saved_search_id: ID della saved search
            search_criteria: Criteri di ricerca
            
        Returns:
            Lista SearchResult processati per il tenant
        """
        logger.info(
            "Processing scraped properties for tenant",
            tenant_id=tenant_id,
            search_execution_id=search_execution_id,
            property_count=len(properties)
        )
        
        search_results = []
        
        for prop in properties:
            try:
                # Usa la pipeline dati per mapping verso SearchResult
                search_result = self.search_mapper.map_to_search_result(
                    scraped_property=prop,
                    search_execution_id=search_execution_id,
                    tenant_id=tenant_id,
                    saved_search_id=saved_search_id,
                    search_criteria=search_criteria
                )
                
                # Aggiungi tenant isolation metadata
                search_result['tenant_id'] = tenant_id
                search_result['processed_at'] = datetime.utcnow().isoformat()
                
                search_results.append(search_result)
                
            except Exception as e:
                logger.error(
                    "Failed to process property for tenant",
                    tenant_id=tenant_id,
                    property_url=prop.get('url', 'unknown'),
                    error=str(e)
                )
                continue
        
        logger.info(
            "Scraped properties processed for tenant",
            tenant_id=tenant_id,
            processed_count=len(search_results),
            failed_count=len(properties) - len(search_results)
        )
        
        return search_results
    
    def validate_tenant_access_to_resource(
        self,
        resource: Dict[str, Any],
        tenant_id: str,
        resource_type: str = "search_result"
    ) -> bool:
        """
        Valida che il tenant abbia accesso alla risorsa.
        
        Args:
            resource: Risorsa da validare
            tenant_id: ID del tenant richiedente
            resource_type: Tipo di risorsa
            
        Returns:
            True se l'accesso è consentito
        """
        resource_tenant_id = resource.get('tenant_id')
        
        if resource_tenant_id != tenant_id:
            logger.warning(
                "Tenant access denied to resource",
                tenant_id=tenant_id,
                resource_tenant_id=resource_tenant_id,
                resource_type=resource_type,
                resource_id=resource.get('id', 'unknown')
            )
            return False
        
        return True
    
    def _clean_result_for_tenant(
        self, 
        result: Dict[str, Any], 
        tenant_id: str
    ) -> Dict[str, Any]:
        """
        Pulisce il risultato rimuovendo informazioni sensibili cross-tenant.
        
        Args:
            result: Risultato da pulire
            tenant_id: ID del tenant
            
        Returns:
            Risultato pulito
        """
        # Lista di campi da rimuovere per sicurezza
        sensitive_fields = [
            'internal_id',
            'raw_scraped_data',
            'debug_info',
            'admin_metadata'
        ]
        
        cleaned_result = result.copy()
        
        # Rimuovi campi sensibili
        for field in sensitive_fields:
            cleaned_result.pop(field, None)
        
        # Assicurati che tenant_id sia corretto
        cleaned_result['tenant_id'] = tenant_id
        
        return cleaned_result


class TenantContextManager:
    """Gestisce il contesto tenant per le operazioni API."""
    
    def __init__(self, tenant_id: str, user_id: str):
        self.tenant_id = tenant_id
        self.user_id = user_id
        self.isolation = TenantDataIsolation()
    
    def __enter__(self):
        logger.info(
            "Entering tenant context",
            tenant_id=self.tenant_id,
            user_id=self.user_id
        )
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        logger.info(
            "Exiting tenant context",
            tenant_id=self.tenant_id,
            user_id=self.user_id
        )
    
    def create_search_execution(self, search_data: Dict[str, Any]) -> Dict[str, Any]:
        """Crea SearchExecution nel contesto tenant."""
        return self.isolation.create_search_execution_for_tenant(
            search_data, 
            self.tenant_id, 
            self.user_id
        )
    
    def process_scraped_results(
        self,
        properties: List[Dict[str, Any]],
        search_execution_id: str,
        saved_search_id: str,
        search_criteria: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Processa risultati scraped nel contesto tenant."""
        return self.isolation.process_scraped_properties_for_tenant(
            properties,
            search_execution_id,
            self.tenant_id,
            saved_search_id,
            search_criteria
        )
    
    def filter_results(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Filtra risultati per il tenant corrente."""
        return self.isolation.filter_results_by_tenant(results, self.tenant_id)
