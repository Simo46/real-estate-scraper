"""
Geolocation Processing Service
Handles advanced location normalization and processing for Italian real estate.
"""

import re
from typing import Dict, Optional, List, Tuple
from dataclasses import dataclass
import math


@dataclass
class LocationInfo:
    """Structured location information."""
    city: str
    province: Optional[str] = None
    region: Optional[str] = None
    neighborhood: Optional[str] = None
    zone_type: Optional[str] = None  # centro, periferia, semicentro
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class GeolocationProcessor:
    """Advanced geolocation processing for Italian real estate."""
    
    def __init__(self):
        # Italian cities database with major cities and their provinces/regions
        self.italian_cities = {
            # Major cities with aliases
            'roma': {'province': 'RM', 'region': 'Lazio', 'aliases': ['rome']},
            'milano': {'province': 'MI', 'region': 'Lombardia', 'aliases': ['milan']},
            'napoli': {'province': 'NA', 'region': 'Campania', 'aliases': ['naples']},
            'torino': {'province': 'TO', 'region': 'Piemonte', 'aliases': ['turin']},
            'palermo': {'province': 'PA', 'region': 'Sicilia', 'aliases': []},
            'genova': {'province': 'GE', 'region': 'Liguria', 'aliases': ['genoa']},
            'bologna': {'province': 'BO', 'region': 'Emilia-Romagna', 'aliases': []},
            'firenze': {'province': 'FI', 'region': 'Toscana', 'aliases': ['florence']},
            'catania': {'province': 'CT', 'region': 'Sicilia', 'aliases': []},
            'venezia': {'province': 'VE', 'region': 'Veneto', 'aliases': ['venice']},
            'verona': {'province': 'VR', 'region': 'Veneto', 'aliases': []},
            'messina': {'province': 'ME', 'region': 'Sicilia', 'aliases': []},
            'padova': {'province': 'PD', 'region': 'Veneto', 'aliases': ['padua']},
            'trieste': {'province': 'TS', 'region': 'Friuli-Venezia Giulia', 'aliases': []},
            'brescia': {'province': 'BS', 'region': 'Lombardia', 'aliases': []},
            'parma': {'province': 'PR', 'region': 'Emilia-Romagna', 'aliases': []},
            'modena': {'province': 'MO', 'region': 'Emilia-Romagna', 'aliases': []},
            'reggio calabria': {'province': 'RC', 'region': 'Calabria', 'aliases': []},
            'reggio emilia': {'province': 'RE', 'region': 'Emilia-Romagna', 'aliases': []},
            'perugia': {'province': 'PG', 'region': 'Umbria', 'aliases': []},
            'bari': {'province': 'BA', 'region': 'Puglia', 'aliases': []},
            'cagliari': {'province': 'CA', 'region': 'Sardegna', 'aliases': []},
        }
        
        # Common neighborhoods and zones for major cities
        self.neighborhoods = {
            'roma': {
                'centro': ['centro storico', 'pantheon', 'campo marzio', 'ponte', 'parione'],
                'semicentro': ['prati', 'flaminio', 'salario', 'trieste', 'nomentano', 'tiburtino'],
                'periferia': ['eur', 'ostia', 'centocelle', 'prenestino', 'casilino']
            },
            'milano': {
                'centro': ['duomo', 'brera', 'centro storico', 'quadrilatero'],
                'semicentro': ['porta garibaldi', 'isola', 'navigli', 'porta venezia', 'lambrate'],
                'periferia': ['bicocca', 'corvetto', 'quarto oggiaro', 'barona']
            },
            'torino': {
                'centro': ['centro storico', 'quadrilatero romano', 'crocetta'],
                'semicentro': ['san salvario', 'vanchiglia', 'borgo po', 'santa rita'],
                'periferia': ['mirafiori', 'barriera di milano', 'borgata vittoria']
            },
            'napoli': {
                'centro': ['centro storico', 'chiaia', 'posillipo'],
                'semicentro': ['vomero', 'fuorigrotta', 'mergellina'],
                'periferia': ['bagnoli', 'pianura', 'secondigliano']
            }
        }
        
        # Province codes mapping
        self.province_codes = {
            'AG': 'Agrigento', 'AL': 'Alessandria', 'AN': 'Ancona', 'AO': 'Aosta',
            'AR': 'Arezzo', 'AP': 'Ascoli Piceno', 'AT': 'Asti', 'AV': 'Avellino',
            'BA': 'Bari', 'BT': 'Barletta-Andria-Trani', 'BL': 'Belluno', 'BN': 'Benevento',
            'BG': 'Bergamo', 'BI': 'Biella', 'BO': 'Bologna', 'BZ': 'Bolzano',
            'BS': 'Brescia', 'BR': 'Brindisi', 'CA': 'Cagliari', 'CL': 'Caltanissetta',
            'CB': 'Campobasso', 'CI': 'Carbonia-Iglesias', 'CE': 'Caserta', 'CT': 'Catania',
            'CZ': 'Catanzaro', 'CH': 'Chieti', 'CO': 'Como', 'CS': 'Cosenza',
            'CR': 'Cremona', 'KR': 'Crotone', 'CN': 'Cuneo', 'EN': 'Enna',
            'FM': 'Fermo', 'FE': 'Ferrara', 'FI': 'Firenze', 'FG': 'Foggia',
            'FC': 'Forlì-Cesena', 'FR': 'Frosinone', 'GE': 'Genova', 'GO': 'Gorizia',
            'GR': 'Grosseto', 'IM': 'Imperia', 'IS': 'Isernia', 'AQ': 'L\'Aquila',
            'SP': 'La Spezia', 'LT': 'Latina', 'LE': 'Lecce', 'LC': 'Lecco',
            'LI': 'Livorno', 'LO': 'Lodi', 'LU': 'Lucca', 'MC': 'Macerata',
            'MN': 'Mantova', 'MS': 'Massa-Carrara', 'MT': 'Matera', 'VS': 'Medio Campidano',
            'ME': 'Messina', 'MI': 'Milano', 'MO': 'Modena', 'MB': 'Monza e Brianza',
            'NA': 'Napoli', 'NO': 'Novara', 'NU': 'Nuoro', 'OG': 'Ogliastra',
            'OT': 'Olbia-Tempio', 'OR': 'Oristano', 'PD': 'Padova', 'PA': 'Palermo',
            'PR': 'Parma', 'PV': 'Pavia', 'PG': 'Perugia', 'PU': 'Pesaro e Urbino',
            'PE': 'Pescara', 'PC': 'Piacenza', 'PI': 'Pisa', 'PT': 'Pistoia',
            'PN': 'Pordenone', 'PZ': 'Potenza', 'PO': 'Prato', 'RG': 'Ragusa',
            'RA': 'Ravenna', 'RC': 'Reggio Calabria', 'RE': 'Reggio Emilia', 'RI': 'Rieti',
            'RN': 'Rimini', 'RM': 'Roma', 'RO': 'Rovigo', 'SA': 'Salerno',
            'SS': 'Sassari', 'SV': 'Savona', 'SI': 'Siena', 'SR': 'Siracusa',
            'SO': 'Sondrio', 'TA': 'Taranto', 'TE': 'Teramo', 'TR': 'Terni',
            'TO': 'Torino', 'TP': 'Trapani', 'TN': 'Trento', 'TV': 'Treviso',
            'TS': 'Trieste', 'UD': 'Udine', 'VA': 'Varese', 'VE': 'Venezia',
            'VB': 'Verbano-Cusio-Ossola', 'VC': 'Vercelli', 'VR': 'Verona',
            'VV': 'Vibo Valentia', 'VI': 'Vicenza', 'VT': 'Viterbo'
        }
    
    def normalize_italian_location(self, location_text: str) -> LocationInfo:
        """
        Normalize Italian location text into structured format.
        
        Args:
            location_text: Raw location string from scraped data
            
        Returns:
            LocationInfo: Structured location information
        """
        if not location_text:
            return LocationInfo(city="Unknown")
        
        # Clean and normalize text
        normalized_text = self._clean_location_text(location_text)
        
        # Extract city, province, and neighborhood information
        city, province, neighborhood = self._parse_location_components(normalized_text)
        
        # Get region and additional info
        region = None
        zone_type = None
        
        if city and city.lower() in self.italian_cities:
            city_info = self.italian_cities[city.lower()]
            province = province or city_info.get('province')
            region = city_info.get('region')
            zone_type = self._classify_zone_type(city.lower(), neighborhood)
        
        return LocationInfo(
            city=city or "Unknown",
            province=province,
            region=region,
            neighborhood=neighborhood,
            zone_type=zone_type
        )
    
    def calculate_relevance_score(self, property_location: str, search_criteria: dict) -> float:
        """
        Calculate location relevance score based on search criteria.
        
        Args:
            property_location: Property location string
            search_criteria: Search criteria dict with location preferences
            
        Returns:
            float: Relevance score 0-1
        """
        if not search_criteria.get('location'):
            return 0.5  # Neutral score if no location criteria
        
        property_info = self.normalize_italian_location(property_location)
        search_location = search_criteria['location'].lower()
        
        score = 0.0
        
        # Exact city match (case insensitive)
        if property_info.city and property_info.city.lower() == search_location:
            score += 0.8
        
        # Province match
        elif property_info.province and property_info.province.lower() == search_location:
            score += 0.6
        
        # Region match
        elif property_info.region and property_info.region.lower() == search_location:
            score += 0.4
        
        # Neighborhood match
        elif property_info.neighborhood and search_location in property_info.neighborhood.lower():
            score += 0.9
        
        # Partial city name match
        elif property_info.city and search_location in property_info.city.lower():
            score += 0.7
        
        # Fallback: check if search term appears anywhere in the location string
        elif search_location in property_location.lower():
            score += 0.5
        
        # Zone type preference bonus
        if search_criteria.get('zone_preference'):
            zone_pref = search_criteria['zone_preference'].lower()
            if property_info.zone_type and property_info.zone_type == zone_pref:
                score += 0.1
        
        return min(score, 1.0)
    
    def extract_neighborhood_info(self, location: str) -> Dict[str, str]:
        """
        Extract detailed neighborhood information from location string.
        
        Args:
            location: Location string
            
        Returns:
            dict: Neighborhood information
        """
        location_info = self.normalize_italian_location(location)
        
        result = {
            'city': location_info.city,
            'neighborhood': location_info.neighborhood or "N/A",
            'zone_type': location_info.zone_type or "unknown",
            'province': location_info.province or "N/A",
            'region': location_info.region or "N/A"
        }
        
        # Add distance estimation from city center (mock implementation)
        if location_info.city and location_info.zone_type:
            if location_info.zone_type == 'centro':
                result['distance_from_center'] = "0-2 km"
            elif location_info.zone_type == 'semicentro':
                result['distance_from_center'] = "2-8 km"
            else:
                result['distance_from_center'] = "8+ km"
        else:
            result['distance_from_center'] = "unknown"
        
        return result
    
    def calculate_distance_km(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """
        Calculate distance between two coordinates using Haversine formula.
        
        Args:
            lat1, lon1: First coordinate
            lat2, lon2: Second coordinate
            
        Returns:
            float: Distance in kilometers
        """
        # Convert latitude and longitude from degrees to radians
        lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
        
        # Haversine formula
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
        c = 2 * math.asin(math.sqrt(a))
        
        # Radius of earth in kilometers
        r = 6371
        
        return c * r
    
    def _clean_location_text(self, text: str) -> str:
        """Clean and normalize location text."""
        # Remove extra whitespace and convert to lowercase
        text = re.sub(r'\s+', ' ', text.strip().lower())
        
        # Remove common prefixes/suffixes
        text = re.sub(r'^(via|viale|piazza|corso|largo|vicolo)\s+', '', text)
        text = re.sub(r'\s+(italia|italy)$', '', text)
        
        return text
    
    def _parse_location_components(self, text: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """Parse location text into city, province, and neighborhood components."""
        city = None
        province = None
        neighborhood = None
        
        # Look for province codes in parentheses: "Milano (MI)"
        province_match = re.search(r'\(([A-Z]{2})\)', text)
        if province_match:
            province = province_match.group(1)
            text = re.sub(r'\s*\([A-Z]{2}\)', '', text)
        
        # Look for comma-separated components: "Neighborhood, City" or "City, Neighborhood"
        parts = [part.strip() for part in text.split(',')]
        
        if len(parts) >= 2:
            # Try both orders: last part as city, first part as city
            potential_cities = [parts[-1], parts[0]]
            potential_neighborhoods = [parts[0], parts[-1]]
            
            for i, potential_city in enumerate(potential_cities):
                # Check if potential_city matches known cities (case insensitive)
                if potential_city.lower() in self.italian_cities:
                    city = potential_city.title()
                    neighborhood = potential_neighborhoods[i] if potential_neighborhoods[i] != potential_city else None
                    break
                    
                # Check aliases
                found_by_alias = False
                for city_name, city_data in self.italian_cities.items():
                    if potential_city.lower() in city_data.get('aliases', []):
                        city = city_name.title()
                        neighborhood = potential_neighborhoods[i] if potential_neighborhoods[i] != potential_city else None
                        found_by_alias = True
                        break
                
                if found_by_alias:
                    break
            
            # If no known city found, treat as unknown city with neighborhood
            if not city:
                city = parts[-1].title()  # Assume last part is city
                neighborhood = parts[0] if parts[0] != parts[-1] else None
                
        else:
            # Single component - check if it's a known city
            if text.lower() in self.italian_cities:
                city = text.title()
            else:
                # Check aliases
                found_by_alias = False
                for city_name, city_data in self.italian_cities.items():
                    if text.lower() in city_data.get('aliases', []):
                        city = city_name.title()
                        found_by_alias = True
                        break
                
                if not found_by_alias:
                    # Might be a neighborhood or unknown city
                    city = text.title()
        
        return city, province, neighborhood
    
    def _classify_zone_type(self, city: str, neighborhood: str) -> Optional[str]:
        """Classify zone type based on city and neighborhood."""
        if not neighborhood:
            return None
        
        city_neighborhoods = self.neighborhoods.get(city, {})
        neighborhood_lower = neighborhood.lower()
        
        for zone_type, neighborhoods in city_neighborhoods.items():
            if any(hood in neighborhood_lower for hood in neighborhoods):
                return zone_type
        
        # Default classification based on keywords
        if any(keyword in neighborhood_lower for keyword in ['centro', 'centrale', 'storico']):
            return 'centro'
        elif any(keyword in neighborhood_lower for keyword in ['periferia', 'borgata', 'quartiere']):
            return 'periferia'
        else:
            return 'semicentro'
