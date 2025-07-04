"""
Core module for NLP Service
Task 5.2 - NLP Service Foundation with Ollama Integration

Modulo principale che fornisce tutte le funzionalità core del NLP Service.
"""

from .ollama_client import OllamaClient, OllamaConfig, ModelInfo, ModelStatus, OllamaModelError, OllamaConnectionError
from .model_manager import ModelManager, ModelCacheConfig, ModelUsageStats
from .chat_service import ChatService, ChatRequest, ChatResponse, ChatMessage
from .error_handler import ErrorHandler, FallbackConfig, ErrorType, ErrorSeverity
from .monitoring import (
    StructuredLogger, MetricsCollector, PerformanceMonitor, HealthChecker,
    get_logger, get_metrics, get_performance_monitor, get_health_checker
)

__all__ = [
    # Ollama Client
    "OllamaClient",
    "OllamaConfig",
    "ModelInfo",
    "ModelStatus",
    "OllamaModelError",
    "OllamaConnectionError",
    
    # Model Manager
    "ModelManager",
    "ModelCacheConfig",
    "ModelUsageStats",
    
    # Chat Service
    "ChatService",
    "ChatRequest",
    "ChatResponse",
    "ChatMessage",
    
    # Error Handler
    "ErrorHandler",
    "FallbackConfig",
    "ErrorType",
    "ErrorSeverity",
    
    # Monitoring
    "StructuredLogger",
    "MetricsCollector",
    "PerformanceMonitor",
    "HealthChecker",
    "get_logger",
    "get_metrics",
    "get_performance_monitor",
    "get_health_checker"
]
