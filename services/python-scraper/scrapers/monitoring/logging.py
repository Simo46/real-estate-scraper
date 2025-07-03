"""
Comprehensive logging system for scrapers.
"""

import logging
import logging.handlers
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional
from pathlib import Path
import traceback
from contextlib import contextmanager

from config.settings import get_settings


class ScraperFormatter(logging.Formatter):
    """Custom formatter for scraper logs with structured output."""
    
    def format(self, record: logging.LogRecord) -> str:
        """Format log record with structured data."""
        
        # Create base log structure
        log_data = {
            'timestamp': datetime.utcnow().isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno
        }
        
        # Add scraper-specific context if available
        if hasattr(record, 'scraper_name'):
            log_data['scraper_name'] = record.scraper_name
        
        if hasattr(record, 'url'):
            log_data['url'] = record.url
        
        if hasattr(record, 'duration'):
            log_data['duration'] = record.duration
        
        if hasattr(record, 'status_code'):
            log_data['status_code'] = record.status_code
        
        if hasattr(record, 'properties_count'):
            log_data['properties_count'] = record.properties_count
        
        # Add exception info if present
        if record.exc_info:
            log_data['exception'] = {
                'type': record.exc_info[0].__name__,
                'message': str(record.exc_info[1]),
                'traceback': traceback.format_exception(*record.exc_info)
            }
        
        # Add extra fields from record
        for key, value in record.__dict__.items():
            if key not in ['name', 'msg', 'args', 'levelname', 'levelno', 'pathname',
                          'filename', 'module', 'lineno', 'funcName', 'created',
                          'msecs', 'relativeCreated', 'thread', 'threadName',
                          'processName', 'process', 'exc_info', 'exc_text', 'stack_info']:
                if not key.startswith('_'):
                    log_data[key] = value
        
        return json.dumps(log_data, ensure_ascii=False)


class ScraperLogger:
    """Enhanced logger for scraper operations."""
    
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
        self.scraper_name = name
        
        if not self.logger.handlers:
            self._setup_logger()
    
    def _setup_logger(self):
        """Setup logger with appropriate handlers."""
        settings = get_settings()
        
        # Set level
        self.logger.setLevel(getattr(logging, settings.logging.level.upper()))
        
        # Console handler with colored output for development
        console_handler = logging.StreamHandler()
        console_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        console_handler.setFormatter(console_formatter)
        self.logger.addHandler(console_handler)
        
        # File handler with structured JSON logs
        # Create a default log file path since it's not in settings
        log_file_path = "logs/scraper.log"
        log_path = Path(log_file_path)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        
        file_handler = logging.handlers.RotatingFileHandler(
            log_path,
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=5
        )
        file_handler.setFormatter(ScraperFormatter())
        self.logger.addHandler(file_handler)
    
    def info(self, message: str, **kwargs):
        """Log info message with optional context."""
        self._log_with_context(logging.INFO, message, **kwargs)
    
    def warning(self, message: str, **kwargs):
        """Log warning message with optional context."""
        self._log_with_context(logging.WARNING, message, **kwargs)
    
    def error(self, message: str, **kwargs):
        """Log error message with optional context."""
        self._log_with_context(logging.ERROR, message, **kwargs)
    
    def debug(self, message: str, **kwargs):
        """Log debug message with optional context."""
        self._log_with_context(logging.DEBUG, message, **kwargs)
    
    def critical(self, message: str, **kwargs):
        """Log critical message with optional context."""
        self._log_with_context(logging.CRITICAL, message, **kwargs)
    
    def _log_with_context(self, level: int, message: str, **kwargs):
        """Log message with scraper context."""
        # Add scraper name to context
        kwargs['scraper_name'] = self.scraper_name
        
        # Handle exc_info specially - it's a reserved parameter
        exc_info = kwargs.pop('exc_info', False)
        
        # Create log record with extra context
        extra = {k: v for k, v in kwargs.items() if v is not None}
        self.logger.log(level, message, extra=extra, exc_info=exc_info)
    
    @contextmanager
    def operation(self, operation_name: str, **context):
        """Context manager for logging operations with timing."""
        start_time = time.time()
        
        self.info(f"Starting {operation_name}", operation=operation_name, **context)
        
        try:
            yield
            duration = time.time() - start_time
            self.info(
                f"Completed {operation_name}",
                operation=operation_name,
                duration=duration,
                status="success",
                **context
            )
        except Exception as e:
            duration = time.time() - start_time
            self.error(
                f"Failed {operation_name}: {str(e)}",
                operation=operation_name,
                duration=duration,
                status="error",
                error_type=type(e).__name__,
                **context,
                exc_info=True
            )
            raise


def get_scraper_logger(name: str) -> ScraperLogger:
    """Get or create a scraper logger."""
    return ScraperLogger(name)
