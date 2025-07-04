"""
Common models for NLP Service
Task 5.3 - Query Understanding Engine
"""

from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum

class BaseResponse(BaseModel):
    """Base response model"""
    success: bool = Field(default=True, description="Indica se l'operazione è andata a buon fine")
    timestamp: datetime = Field(default_factory=datetime.now, description="Timestamp della risposta")
    processing_time_ms: Optional[float] = Field(None, description="Tempo di elaborazione in millisecondi")
    request_id: Optional[str] = Field(None, description="ID della richiesta per tracking")

class ErrorResponse(BaseResponse):
    """Error response model"""
    success: bool = Field(default=False)
    error_code: str = Field(..., description="Codice dell'errore")
    error_message: str = Field(..., description="Messaggio dell'errore")
    error_details: Optional[Dict[str, Any]] = Field(None, description="Dettagli aggiuntivi dell'errore")

class ValidationError(BaseModel):
    """Validation error model"""
    field: str = Field(..., description="Campo che ha causato l'errore")
    message: str = Field(..., description="Messaggio di errore")
    code: str = Field(..., description="Codice dell'errore")
    value: Optional[Any] = Field(None, description="Valore che ha causato l'errore")
