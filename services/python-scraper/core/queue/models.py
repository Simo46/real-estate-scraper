"""
Data models for the queue system.

Defines the structure of scraping jobs, job results, and related data.
"""

from enum import Enum
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
import uuid


class JobStatus(str, Enum):
    """Job status enumeration"""
    PENDING = "pending"
    RUNNING = "running" 
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETRYING = "retrying"


class JobPriority(str, Enum):
    """Job priority levels"""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class ScrapingTarget(BaseModel):
    """Target configuration for scraping"""
    site: str = Field(..., description="Target site (e.g., 'immobiliare.it')")
    url: Optional[str] = Field(None, description="Specific URL to scrape")
    search_criteria: Dict[str, Any] = Field(default_factory=dict, description="Search parameters")
    max_pages: int = Field(default=10, ge=1, le=100, description="Maximum pages to scrape")
    delay_ms: int = Field(default=1000, ge=100, description="Delay between requests in ms")


class ScrapingJob(BaseModel):
    """Scraping job model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique job ID")
    user_id: str = Field(..., description="User who created the job")
    tenant_id: str = Field(..., description="Tenant ID for multi-tenancy")
    title: str = Field(..., description="Human-readable job title")
    description: Optional[str] = Field(None, description="Job description")
    
    # Job configuration
    target: ScrapingTarget = Field(..., description="Scraping target configuration")
    priority: JobPriority = Field(default=JobPriority.NORMAL, description="Job priority")
    
    # Status and timing
    status: JobStatus = Field(default=JobStatus.PENDING, description="Current job status")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: Optional[datetime] = Field(None, description="When job started processing")
    completed_at: Optional[datetime] = Field(None, description="When job completed")
    
    # Retry configuration
    max_retries: int = Field(default=3, ge=0, le=10, description="Maximum retry attempts")
    current_retry: int = Field(default=0, ge=0, description="Current retry count")
    retry_delay: int = Field(default=60, ge=1, description="Delay between retries in seconds")
    
    # Progress tracking
    progress_percentage: float = Field(default=0.0, ge=0.0, le=100.0)
    pages_processed: int = Field(default=0, ge=0)
    items_found: int = Field(default=0, ge=0)
    
    # Error tracking
    last_error: Optional[str] = Field(None, description="Last error message")
    error_count: int = Field(default=0, ge=0, description="Total error count")
    
    # Metadata
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for Redis storage"""
        return self.model_dump(mode="json")
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ScrapingJob":
        """Create from dictionary from Redis"""
        return cls.model_validate(data)
    
    def update_status(self, status: JobStatus, error: Optional[str] = None) -> None:
        """Update job status with timestamp"""
        self.status = status
        
        if status == JobStatus.RUNNING and not self.started_at:
            self.started_at = datetime.now(timezone.utc)
        elif status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]:
            self.completed_at = datetime.now(timezone.utc)
        
        if error:
            self.last_error = error
            self.error_count += 1
    
    def update_progress(self, percentage: float, pages: int = 0, items: int = 0) -> None:
        """Update job progress"""
        self.progress_percentage = min(100.0, max(0.0, percentage))
        if pages > 0:
            self.pages_processed = pages
        if items > 0:
            self.items_found = items
    
    def can_retry(self) -> bool:
        """Check if job can be retried"""
        return (
            self.status == JobStatus.FAILED and 
            self.current_retry < self.max_retries
        )
    
    def increment_retry(self) -> None:
        """Increment retry counter"""
        self.current_retry += 1
        self.status = JobStatus.RETRYING


class JobResult(BaseModel):
    """Result of a completed scraping job"""
    job_id: str = Field(..., description="Associated job ID")
    status: JobStatus = Field(..., description="Final job status")
    
    # Results
    items_scraped: int = Field(default=0, ge=0, description="Total items scraped")
    pages_processed: int = Field(default=0, ge=0, description="Total pages processed")
    data_size_bytes: int = Field(default=0, ge=0, description="Size of scraped data")
    
    # Timing
    started_at: datetime = Field(..., description="Job start time")
    completed_at: datetime = Field(..., description="Job completion time")
    duration_seconds: float = Field(..., ge=0.0, description="Job duration")
    
    # Quality metrics
    success_rate: float = Field(default=100.0, ge=0.0, le=100.0, description="Success rate percentage")
    error_count: int = Field(default=0, ge=0, description="Total errors encountered")
    
    # Output information
    output_files: List[str] = Field(default_factory=list, description="Generated output files")
    storage_path: Optional[str] = Field(None, description="Path where data is stored")
    
    # Error information
    errors: List[str] = Field(default_factory=list, description="List of errors")
    warnings: List[str] = Field(default_factory=list, description="List of warnings")
    
    # Metadata
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional result metadata")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage"""
        return self.model_dump(mode="json")
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "JobResult":
        """Create from dictionary"""
        return cls.model_validate(data)


class QueueStats(BaseModel):
    """Queue statistics model"""
    total_jobs: int = Field(default=0, ge=0)
    pending_jobs: int = Field(default=0, ge=0)
    running_jobs: int = Field(default=0, ge=0)
    completed_jobs: int = Field(default=0, ge=0)
    failed_jobs: int = Field(default=0, ge=0)
    retrying_jobs: int = Field(default=0, ge=0)
    
    # Performance metrics
    average_duration: float = Field(default=0.0, ge=0.0, description="Average job duration in seconds")
    success_rate: float = Field(default=100.0, ge=0.0, le=100.0, description="Overall success rate")
    
    # System metrics
    queue_size: int = Field(default=0, ge=0, description="Current queue size")
    active_workers: int = Field(default=0, ge=0, description="Number of active workers")
    
    # Timing
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return self.model_dump(mode="json")
