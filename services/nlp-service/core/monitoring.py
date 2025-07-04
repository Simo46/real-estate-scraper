"""
Logging e Monitoring System
Task 5.2.10 - Logging e monitoring setup

Sistema di logging e monitoring per il NLP Service.
"""

import logging
import logging.handlers
import json
import os
import time
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict
from enum import Enum
import asyncio
from pathlib import Path

class LogLevel(Enum):
    """Livelli di log"""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"

class MetricType(Enum):
    """Tipi di metriche"""
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    TIMER = "timer"

@dataclass
class LogEntry:
    """Entry di log strutturato"""
    timestamp: str
    level: str
    message: str
    service: str = "nlp-service"
    component: str = "main"
    request_id: Optional[str] = None
    user_id: Optional[str] = None
    model: Optional[str] = None
    processing_time: Optional[float] = None
    tokens: Optional[int] = None
    context: Dict[str, Any] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

@dataclass
class Metric:
    """Metrica del sistema"""
    name: str
    value: float
    metric_type: MetricType
    timestamp: datetime
    tags: Dict[str, str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "value": self.value,
            "type": self.metric_type.value,
            "timestamp": self.timestamp.isoformat(),
            "tags": self.tags or {}
        }

class StructuredLogger:
    """Logger strutturato per il NLP Service"""
    
    def __init__(self, service_name: str = "nlp-service", log_level: str = "INFO"):
        self.service_name = service_name
        self.log_level = log_level
        self.logger = logging.getLogger(service_name)
        self.request_id = None
        
        # Configurazione logger
        self._setup_logger()
    
    def _setup_logger(self):
        """Configura il logger"""
        # Rimuovi handler esistenti
        for handler in self.logger.handlers[:]:
            self.logger.removeHandler(handler)
        
        # Imposta livello
        self.logger.setLevel(getattr(logging, self.log_level.upper()))
        
        # Formatter JSON
        class JSONFormatter(logging.Formatter):
            def format(self, record):
                log_entry = {
                    "timestamp": datetime.fromtimestamp(record.created).isoformat(),
                    "level": record.levelname,
                    "message": record.getMessage(),
                    "service": "nlp-service",
                    "component": getattr(record, 'component', 'main'),
                    "file": f"{record.filename}:{record.lineno}",
                    "function": record.funcName
                }
                
                # Aggiungi campi custom se presenti
                for key, value in record.__dict__.items():
                    if key.startswith('custom_'):
                        log_entry[key[7:]] = value
                
                return json.dumps(log_entry)
        
        # Handler per console
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(JSONFormatter())
        self.logger.addHandler(console_handler)
        
        # Handler per file (se directory log esiste)
        log_dir = Path("/app/logs")
        if log_dir.exists():
            file_handler = logging.handlers.RotatingFileHandler(
                log_dir / "nlp-service.log",
                maxBytes=10*1024*1024,  # 10MB
                backupCount=5
            )
            file_handler.setFormatter(JSONFormatter())
            self.logger.addHandler(file_handler)
    
    def set_request_id(self, request_id: str):
        """Imposta ID richiesta per correlazione log"""
        self.request_id = request_id
    
    def _log(self, level: LogLevel, message: str, **kwargs):
        """Log con informazioni strutturate"""
        extra = {}
        
        # Aggiungi request_id se presente
        if self.request_id:
            extra['custom_request_id'] = self.request_id
        
        # Aggiungi parametri custom
        for key, value in kwargs.items():
            extra[f'custom_{key}'] = value
        
        # Esegui log
        self.logger.log(getattr(logging, level.value), message, extra=extra)
    
    def debug(self, message: str, **kwargs):
        """Log debug"""
        self._log(LogLevel.DEBUG, message, **kwargs)
    
    def info(self, message: str, **kwargs):
        """Log info"""
        self._log(LogLevel.INFO, message, **kwargs)
    
    def warning(self, message: str, **kwargs):
        """Log warning"""
        self._log(LogLevel.WARNING, message, **kwargs)
    
    def error(self, message: str, **kwargs):
        """Log error"""
        self._log(LogLevel.ERROR, message, **kwargs)
    
    def critical(self, message: str, **kwargs):
        """Log critical"""
        self._log(LogLevel.CRITICAL, message, **kwargs)
    
    def log_request(self, method: str, endpoint: str, status_code: int, processing_time: float, **kwargs):
        """Log richiesta HTTP"""
        self.info(
            f"{method} {endpoint} - {status_code}",
            method=method,
            endpoint=endpoint,
            status_code=status_code,
            processing_time=processing_time,
            **kwargs
        )
    
    def log_model_usage(self, model: str, prompt_tokens: int, completion_tokens: int, processing_time: float, **kwargs):
        """Log utilizzo modello"""
        self.info(
            f"Model usage: {model}",
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
            processing_time=processing_time,
            **kwargs
        )
    
    def log_error(self, error: Exception, context: Dict[str, Any] = None, **kwargs):
        """Log errore con contesto"""
        self.error(
            f"Error: {str(error)}",
            error_type=type(error).__name__,
            error_message=str(error),
            context=context or {},
            **kwargs
        )

class MetricsCollector:
    """Collettore di metriche per monitoring"""
    
    def __init__(self, service_name: str = "nlp-service"):
        self.service_name = service_name
        self.metrics: Dict[str, List[Metric]] = {}
        self.counters: Dict[str, float] = {}
        self.gauges: Dict[str, float] = {}
        self.histograms: Dict[str, List[float]] = {}
        self._lock = asyncio.Lock()
        
        # Metriche di base
        self.start_time = time.time()
        self.request_count = 0
        self.error_count = 0
        self.total_processing_time = 0.0
        self.total_tokens = 0
    
    async def increment_counter(self, name: str, value: float = 1.0, tags: Dict[str, str] = None):
        """Incrementa contatore"""
        async with self._lock:
            self.counters[name] = self.counters.get(name, 0) + value
            
            metric = Metric(
                name=name,
                value=self.counters[name],
                metric_type=MetricType.COUNTER,
                timestamp=datetime.now(),
                tags=tags
            )
            
            if name not in self.metrics:
                self.metrics[name] = []
            self.metrics[name].append(metric)
    
    async def set_gauge(self, name: str, value: float, tags: Dict[str, str] = None):
        """Imposta gauge"""
        async with self._lock:
            self.gauges[name] = value
            
            metric = Metric(
                name=name,
                value=value,
                metric_type=MetricType.GAUGE,
                timestamp=datetime.now(),
                tags=tags
            )
            
            if name not in self.metrics:
                self.metrics[name] = []
            self.metrics[name].append(metric)
    
    async def record_histogram(self, name: str, value: float, tags: Dict[str, str] = None):
        """Registra valore in histogram"""
        async with self._lock:
            if name not in self.histograms:
                self.histograms[name] = []
            
            self.histograms[name].append(value)
            
            # Mantieni solo ultimi 1000 valori
            if len(self.histograms[name]) > 1000:
                self.histograms[name] = self.histograms[name][-1000:]
            
            metric = Metric(
                name=name,
                value=value,
                metric_type=MetricType.HISTOGRAM,
                timestamp=datetime.now(),
                tags=tags
            )
            
            if name not in self.metrics:
                self.metrics[name] = []
            self.metrics[name].append(metric)
    
    async def record_timer(self, name: str, duration: float, tags: Dict[str, str] = None):
        """Registra durata"""
        await self.record_histogram(name, duration, tags)
    
    async def record_request(self, method: str, endpoint: str, status_code: int, processing_time: float):
        """Registra richiesta HTTP"""
        self.request_count += 1
        self.total_processing_time += processing_time
        
        if status_code >= 400:
            self.error_count += 1
        
        await self.increment_counter("http_requests_total", tags={
            "method": method,
            "endpoint": endpoint,
            "status": str(status_code)
        })
        
        await self.record_timer("http_request_duration_seconds", processing_time, tags={
            "method": method,
            "endpoint": endpoint
        })
    
    async def record_model_usage(self, model: str, prompt_tokens: int, completion_tokens: int, processing_time: float):
        """Registra utilizzo modello"""
        total_tokens = prompt_tokens + completion_tokens
        self.total_tokens += total_tokens
        
        await self.increment_counter("model_requests_total", tags={"model": model})
        await self.increment_counter("tokens_processed_total", value=total_tokens, tags={"model": model})
        await self.record_timer("model_processing_time_seconds", processing_time, tags={"model": model})
        
        await self.set_gauge("model_prompt_tokens", prompt_tokens, tags={"model": model})
        await self.set_gauge("model_completion_tokens", completion_tokens, tags={"model": model})
    
    def get_summary_stats(self) -> Dict[str, Any]:
        """Ottiene statistiche riassuntive"""
        uptime = time.time() - self.start_time
        
        return {
            "uptime_seconds": uptime,
            "total_requests": self.request_count,
            "total_errors": self.error_count,
            "error_rate": self.error_count / max(1, self.request_count),
            "avg_processing_time": self.total_processing_time / max(1, self.request_count),
            "total_tokens": self.total_tokens,
            "requests_per_second": self.request_count / max(1, uptime),
            "tokens_per_second": self.total_tokens / max(1, uptime)
        }
    
    def get_metrics(self, metric_name: str = None, last_minutes: int = 60) -> Dict[str, Any]:
        """Ottiene metriche"""
        cutoff_time = datetime.now() - timedelta(minutes=last_minutes)
        
        if metric_name:
            if metric_name in self.metrics:
                recent_metrics = [
                    m for m in self.metrics[metric_name] 
                    if m.timestamp > cutoff_time
                ]
                return {
                    "name": metric_name,
                    "metrics": [m.to_dict() for m in recent_metrics],
                    "count": len(recent_metrics)
                }
            return {"name": metric_name, "metrics": [], "count": 0}
        
        # Tutte le metriche
        all_metrics = {}
        for name, metrics_list in self.metrics.items():
            recent_metrics = [
                m for m in metrics_list 
                if m.timestamp > cutoff_time
            ]
            all_metrics[name] = {
                "metrics": [m.to_dict() for m in recent_metrics],
                "count": len(recent_metrics)
            }
        
        return all_metrics
    
    def get_histogram_stats(self, name: str) -> Dict[str, Any]:
        """Ottiene statistiche histogram"""
        if name not in self.histograms or not self.histograms[name]:
            return {"name": name, "count": 0}
        
        values = self.histograms[name]
        values.sort()
        
        count = len(values)
        return {
            "name": name,
            "count": count,
            "min": values[0],
            "max": values[-1],
            "avg": sum(values) / count,
            "median": values[count // 2],
            "p95": values[int(count * 0.95)],
            "p99": values[int(count * 0.99)]
        }

class PerformanceMonitor:
    """Monitor delle performance"""
    
    def __init__(self, logger: StructuredLogger, metrics: MetricsCollector):
        self.logger = logger
        self.metrics = metrics
        self.active_requests: Dict[str, float] = {}
        self._lock = asyncio.Lock()
    
    async def start_request(self, request_id: str, method: str, endpoint: str) -> str:
        """Inizia monitoring richiesta"""
        async with self._lock:
            self.active_requests[request_id] = time.time()
            
            self.logger.set_request_id(request_id)
            self.logger.info(f"Started request: {method} {endpoint}", 
                           method=method, endpoint=endpoint)
            
            return request_id
    
    async def end_request(self, request_id: str, method: str, endpoint: str, status_code: int, **kwargs):
        """Termina monitoring richiesta"""
        async with self._lock:
            if request_id in self.active_requests:
                processing_time = time.time() - self.active_requests[request_id]
                del self.active_requests[request_id]
                
                # Remove processing_time from kwargs if present to avoid duplicate argument
                kwargs.pop('processing_time', None)
                
                self.logger.log_request(method, endpoint, status_code, processing_time, **kwargs)
                await self.metrics.record_request(method, endpoint, status_code, processing_time)
    
    async def monitor_model_usage(self, model: str, prompt_tokens: int, completion_tokens: int, processing_time: float):
        """Monitora utilizzo modello"""
        self.logger.log_model_usage(model, prompt_tokens, completion_tokens, processing_time)
        await self.metrics.record_model_usage(model, prompt_tokens, completion_tokens, processing_time)
    
    def get_active_requests(self) -> Dict[str, Any]:
        """Ottiene richieste attive"""
        current_time = time.time()
        active = {}
        
        for request_id, start_time in self.active_requests.items():
            active[request_id] = {
                "start_time": datetime.fromtimestamp(start_time).isoformat(),
                "duration": current_time - start_time
            }
        
        return active

class HealthChecker:
    """Checker della salute del sistema"""
    
    def __init__(self, logger: StructuredLogger, metrics: MetricsCollector):
        self.logger = logger
        self.metrics = metrics
        self.last_check = None
        self.health_status = "healthy"
        self.issues = []
    
    async def check_health(self) -> Dict[str, Any]:
        """Verifica salute del sistema"""
        self.last_check = datetime.now()
        self.issues = []
        
        # Verifica metriche
        stats = self.metrics.get_summary_stats()
        
        # Verifica error rate
        if stats["error_rate"] > 0.1:  # Più del 10% di errori
            self.issues.append({
                "type": "high_error_rate",
                "message": f"Error rate elevato: {stats['error_rate']:.2%}",
                "severity": "warning"
            })
        
        # Verifica tempo di risposta
        if stats["avg_processing_time"] > 10.0:  # Più di 10 secondi
            self.issues.append({
                "type": "slow_response",
                "message": f"Tempo di risposta elevato: {stats['avg_processing_time']:.2f}s",
                "severity": "warning"
            })
        
        # Verifica richieste attive
        active_requests = self.metrics.request_count  # È già un intero
        if active_requests > 100:
            self.issues.append({
                "type": "high_load",
                "message": f"Carico elevato: {active_requests} richieste",
                "severity": "warning"
            })
        
        # Determina stato generale
        if any(issue["severity"] == "critical" for issue in self.issues):
            self.health_status = "critical"
        elif any(issue["severity"] == "warning" for issue in self.issues):
            self.health_status = "warning"
        else:
            self.health_status = "healthy"
        
        return {
            "status": self.health_status,
            "timestamp": self.last_check.isoformat(),
            "issues": self.issues,
            "stats": stats
        }

# Singleton globali
_logger: Optional[StructuredLogger] = None
_metrics: Optional[MetricsCollector] = None
_performance_monitor: Optional[PerformanceMonitor] = None
_health_checker: Optional[HealthChecker] = None

def get_logger() -> StructuredLogger:
    """Ottiene logger singleton"""
    global _logger
    if _logger is None:
        log_level = os.getenv("LOG_LEVEL", "INFO")
        _logger = StructuredLogger(log_level=log_level)
    return _logger

def get_metrics() -> MetricsCollector:
    """Ottiene metrics collector singleton"""
    global _metrics
    if _metrics is None:
        _metrics = MetricsCollector()
    return _metrics

def get_performance_monitor() -> PerformanceMonitor:
    """Ottiene performance monitor singleton"""
    global _performance_monitor
    if _performance_monitor is None:
        _performance_monitor = PerformanceMonitor(get_logger(), get_metrics())
    return _performance_monitor

def get_health_checker() -> HealthChecker:
    """Ottiene health checker singleton"""
    global _health_checker
    if _health_checker is None:
        _health_checker = HealthChecker(get_logger(), get_metrics())
    return _health_checker
