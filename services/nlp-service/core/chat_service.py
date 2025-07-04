"""
Chat Service
Task 5.2.8 - Basic /chat endpoint per testing

Implementa endpoint per chat con Ollama per testing e validazione.
"""

import asyncio
import logging
from typing import Optional, Dict, Any, List, Union
from datetime import datetime
import json
import time
from pydantic import BaseModel, Field, validator
from fastapi import HTTPException

from .ollama_client import OllamaClient, OllamaConnectionError, OllamaModelError
from .model_manager import ModelManager

logger = logging.getLogger(__name__)

class ChatMessage(BaseModel):
    """Messaggio di chat"""
    role: str = Field(..., description="Ruolo del messaggio: user, assistant, system")
    content: str = Field(..., description="Contenuto del messaggio")
    timestamp: Optional[datetime] = Field(default_factory=datetime.now)
    
    @validator('role')
    def validate_role(cls, v):
        if v not in ['user', 'assistant', 'system']:
            raise ValueError('Role deve essere: user, assistant, o system')
        return v

class ChatRequest(BaseModel):
    """Richiesta chat"""
    message: str = Field(..., description="Messaggio da inviare")
    model: Optional[str] = Field(None, description="Modello da utilizzare")
    conversation_id: Optional[str] = Field(None, description="ID conversazione per contesto")
    system_prompt: Optional[str] = Field(None, description="Prompt di sistema")
    
    # Parametri di generazione
    temperature: float = Field(0.7, ge=0.0, le=2.0, description="Creatività della risposta")
    max_tokens: int = Field(1000, ge=1, le=4000, description="Massimo numero di token")
    top_p: float = Field(0.9, ge=0.0, le=1.0, description="Top-p sampling")
    stream: bool = Field(False, description="Streaming della risposta")
    
    @validator('temperature')
    def validate_temperature(cls, v):
        if not 0.0 <= v <= 2.0:
            raise ValueError('Temperature deve essere tra 0.0 e 2.0')
        return v

class ChatResponse(BaseModel):
    """Risposta chat"""
    message: str = Field(..., description="Messaggio di risposta")
    model: str = Field(..., description="Modello utilizzato")
    conversation_id: Optional[str] = Field(None, description="ID conversazione")
    
    # Metadati
    tokens_used: int = Field(0, description="Token utilizzati")
    processing_time: float = Field(0.0, description="Tempo di elaborazione in secondi")
    timestamp: datetime = Field(default_factory=datetime.now)
    
    # Statistiche
    prompt_tokens: int = Field(0, description="Token del prompt")
    completion_tokens: int = Field(0, description="Token della risposta")
    total_tokens: int = Field(0, description="Token totali")
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "message": self.message,
            "model": self.model,
            "conversation_id": self.conversation_id,
            "tokens_used": self.tokens_used,
            "processing_time": self.processing_time,
            "timestamp": self.timestamp.isoformat(),
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.total_tokens
        }

class ChatError(BaseModel):
    """Errore chat"""
    error: str = Field(..., description="Tipo di errore")
    message: str = Field(..., description="Messaggio di errore")
    model: Optional[str] = Field(None, description="Modello che ha causato l'errore")
    timestamp: datetime = Field(default_factory=datetime.now)

class ConversationManager:
    """Gestisce le conversazioni multi-turno"""
    
    def __init__(self, max_conversations: int = 100, max_messages_per_conversation: int = 50):
        self.conversations: Dict[str, List[ChatMessage]] = {}
        self.max_conversations = max_conversations
        self.max_messages_per_conversation = max_messages_per_conversation
        self._lock = asyncio.Lock()
    
    async def add_message(self, conversation_id: str, message: ChatMessage):
        """Aggiunge un messaggio alla conversazione"""
        async with self._lock:
            if conversation_id not in self.conversations:
                self.conversations[conversation_id] = []
            
            self.conversations[conversation_id].append(message)
            
            # Limita numero di messaggi per conversazione
            if len(self.conversations[conversation_id]) > self.max_messages_per_conversation:
                self.conversations[conversation_id] = self.conversations[conversation_id][-self.max_messages_per_conversation:]
            
            # Limita numero totale di conversazioni
            if len(self.conversations) > self.max_conversations:
                oldest_conversation = min(self.conversations.keys())
                del self.conversations[oldest_conversation]
    
    async def get_conversation(self, conversation_id: str) -> List[ChatMessage]:
        """Ottiene i messaggi di una conversazione"""
        return self.conversations.get(conversation_id, [])
    
    async def clear_conversation(self, conversation_id: str):
        """Pulisce una conversazione"""
        async with self._lock:
            if conversation_id in self.conversations:
                del self.conversations[conversation_id]
    
    def get_stats(self) -> Dict[str, Any]:
        """Ottiene statistiche delle conversazioni"""
        total_messages = sum(len(messages) for messages in self.conversations.values())
        return {
            "total_conversations": len(self.conversations),
            "total_messages": total_messages,
            "avg_messages_per_conversation": total_messages / len(self.conversations) if self.conversations else 0,
            "max_conversations": self.max_conversations,
            "max_messages_per_conversation": self.max_messages_per_conversation
        }

class ChatService:
    """Servizio di chat con Ollama"""
    
    def __init__(self, client: OllamaClient, model_manager: ModelManager):
        self.client = client
        self.model_manager = model_manager
        self.conversation_manager = ConversationManager()
        self.default_model = client.config.default_model
        
        # Statistiche
        self.total_requests = 0
        self.successful_requests = 0
        self.failed_requests = 0
        self.total_tokens = 0
        self.avg_response_time = 0.0
        
        logger.info(f"Inizializzato ChatService con modello default: {self.default_model}")
    
    async def chat(self, request: ChatRequest) -> ChatResponse:
        """
        Elabora una richiesta di chat
        
        Args:
            request: Richiesta di chat
            
        Returns:
            ChatResponse: Risposta del modello
        """
        start_time = time.time()
        model_name = request.model or self.default_model
        
        try:
            # Verifica e carica il modello
            await self.model_manager.ensure_model_loaded(model_name)
            
            # Prepara il prompt
            prompt = await self._prepare_prompt(request)
            
            # Esegui la richiesta
            response_data = await self._execute_chat_request(model_name, prompt, request)
            
            # Prepara la risposta
            processing_time = time.time() - start_time
            response = await self._prepare_response(response_data, model_name, request, processing_time)
            
            # Aggiorna statistiche
            await self._update_stats(model_name, processing_time, True, response.total_tokens)
            
            # Salva nella conversazione se specificato
            if request.conversation_id:
                await self._save_to_conversation(request, response)
            
            return response
            
        except Exception as e:
            processing_time = time.time() - start_time
            await self._update_stats(model_name, processing_time, False, 0)
            
            logger.error(f"Errore chat con modello {model_name}: {e}")
            
            # Propaga l'errore senza trasformarlo
            raise e
    
    async def _prepare_prompt(self, request: ChatRequest) -> str:
        """Prepara il prompt per Ollama"""
        # Se c'è un conversation_id, recupera il contesto
        if request.conversation_id:
            conversation = await self.conversation_manager.get_conversation(request.conversation_id)
            
            # Costruisci prompt con contesto
            prompt_parts = []
            
            # Aggiungi system prompt se presente
            if request.system_prompt:
                prompt_parts.append(f"System: {request.system_prompt}")
            
            # Aggiungi messaggi precedenti
            for message in conversation[-10:]:  # Ultimi 10 messaggi per evitare prompt troppo lunghi
                if message.role == "user":
                    prompt_parts.append(f"User: {message.content}")
                elif message.role == "assistant":
                    prompt_parts.append(f"Assistant: {message.content}")
                elif message.role == "system":
                    prompt_parts.append(f"System: {message.content}")
            
            # Aggiungi messaggio corrente
            prompt_parts.append(f"User: {request.message}")
            prompt_parts.append("Assistant:")
            
            return "\n".join(prompt_parts)
        
        else:
            # Senza contesto, usa solo il messaggio
            prompt_parts = []
            
            if request.system_prompt:
                prompt_parts.append(f"System: {request.system_prompt}")
            
            prompt_parts.append(f"User: {request.message}")
            prompt_parts.append("Assistant:")
            
            return "\n".join(prompt_parts)
    
    async def _execute_chat_request(self, model_name: str, prompt: str, request: ChatRequest) -> Dict[str, Any]:
        """Esegue la richiesta a Ollama"""
        payload = {
            "model": model_name,
            "prompt": prompt,
            "stream": request.stream,
            "options": {
                "temperature": request.temperature,
                "top_p": request.top_p,
                "num_predict": request.max_tokens,
            }
        }
        
        try:
            response = await self.client._make_request(
                "POST",
                "/api/generate",
                json=payload,
                timeout=60.0  # Timeout più lungo per generazione
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                raise OllamaModelError(f"Errore Ollama: {response.status_code} - {response.text}")
                
        except Exception as e:
            raise OllamaConnectionError(f"Errore comunicazione con Ollama: {e}")
    
    async def _prepare_response(self, response_data: Dict[str, Any], model_name: str, request: ChatRequest, processing_time: float) -> ChatResponse:
        """Prepara la risposta finale"""
        # Estrai informazioni dalla risposta Ollama
        message = response_data.get("response", "")
        
        # Estrai statistiche sui token (se disponibili)
        eval_count = response_data.get("eval_count", 0)
        prompt_eval_count = response_data.get("prompt_eval_count", 0)
        
        return ChatResponse(
            message=message,
            model=model_name,
            conversation_id=request.conversation_id,
            tokens_used=eval_count,
            processing_time=processing_time,
            prompt_tokens=prompt_eval_count,
            completion_tokens=eval_count,
            total_tokens=prompt_eval_count + eval_count
        )
    
    async def _save_to_conversation(self, request: ChatRequest, response: ChatResponse):
        """Salva messaggio e risposta nella conversazione"""
        if request.conversation_id:
            # Salva messaggio utente
            user_message = ChatMessage(
                role="user",
                content=request.message
            )
            await self.conversation_manager.add_message(request.conversation_id, user_message)
            
            # Salva risposta assistant
            assistant_message = ChatMessage(
                role="assistant",
                content=response.message
            )
            await self.conversation_manager.add_message(request.conversation_id, assistant_message)
    
    async def _update_stats(self, model_name: str, processing_time: float, success: bool, tokens: int):
        """Aggiorna statistiche del servizio"""
        self.total_requests += 1
        self.total_tokens += tokens
        
        if success:
            self.successful_requests += 1
            # Aggiorna media mobile tempo di risposta
            if self.avg_response_time == 0:
                self.avg_response_time = processing_time
            else:
                self.avg_response_time = (self.avg_response_time * 0.9) + (processing_time * 0.1)
        else:
            self.failed_requests += 1
        
        # Aggiorna statistiche nel model manager
        self.model_manager.record_model_usage(model_name, processing_time, success, tokens)
    
    async def get_conversation_history(self, conversation_id: str) -> List[Dict[str, Any]]:
        """Ottiene storico di una conversazione"""
        messages = await self.conversation_manager.get_conversation(conversation_id)
        return [
            {
                "role": msg.role,
                "content": msg.content,
                "timestamp": msg.timestamp.isoformat() if msg.timestamp else None
            }
            for msg in messages
        ]
    
    async def clear_conversation(self, conversation_id: str):
        """Pulisce una conversazione"""
        await self.conversation_manager.clear_conversation(conversation_id)
    
    def get_service_stats(self) -> Dict[str, Any]:
        """Ottiene statistiche del servizio"""
        success_rate = self.successful_requests / self.total_requests if self.total_requests > 0 else 0
        
        return {
            "total_requests": self.total_requests,
            "successful_requests": self.successful_requests,
            "failed_requests": self.failed_requests,
            "success_rate": success_rate,
            "total_tokens": self.total_tokens,
            "avg_response_time": self.avg_response_time,
            "default_model": self.default_model,
            "conversation_stats": self.conversation_manager.get_stats()
        }
    
    async def test_model(self, model_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Test rapido di un modello
        
        Args:
            model_name: Nome del modello da testare
            
        Returns:
            Dict[str, Any]: Risultato del test
        """
        test_model = model_name or self.default_model
        
        try:
            start_time = time.time()
            
            # Test semplice
            test_request = ChatRequest(
                message="Ciao! Dimmi solo 'Ciao' in risposta.",
                model=test_model,
                temperature=0.1,
                max_tokens=10
            )
            
            response = await self.chat(test_request)
            test_time = time.time() - start_time
            
            return {
                "model": test_model,
                "status": "success",
                "response_preview": response.message[:100],
                "test_time": test_time,
                "tokens_used": response.total_tokens,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "model": test_model,
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
