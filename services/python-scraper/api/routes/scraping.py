"""
Scraping Control API Routes

Provides endpoints for controlling and monitoring scraping operations.
Handles job creation, status monitoring, and scraping management using the queue system.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime

import structlog
from fastapi import APIRouter, HTTPException, Depends, status, Request
from pydantic import BaseModel, Field

from config.settings import get_settings
from api.dependencies import get_current_user
from core.queue.job_manager import get_job_manager
from core.queue.models import (
    ScrapingJob, ScrapingTarget, JobStatus, JobPriority, 
    JobResult, QueueStats
)

logger = structlog.get_logger(__name__)

router = APIRouter()


# Request/Response Models

class CreateJobRequest(BaseModel):
    """Request model for creating a scraping job."""
    
    title: str = Field(..., description="Human-readable job title")
    description: Optional[str] = Field(None, description="Job description")
    site: str = Field(..., description="Target site (e.g., 'immobiliare.it')")
    url: Optional[str] = Field(None, description="Specific URL to scrape")
    search_criteria: Dict[str, Any] = Field(default_factory=dict, description="Search parameters")
    max_pages: int = Field(default=10, ge=1, le=100, description="Maximum pages to scrape")
    delay_ms: int = Field(default=1000, ge=100, description="Delay between requests in ms")
    priority: JobPriority = Field(default=JobPriority.NORMAL, description="Job priority")
    max_retries: int = Field(default=3, ge=0, le=10, description="Maximum retry attempts")
    
    class Config:
        json_schema_extra = {
            "example": {
                "title": "Scrape Milano Apartments",
                "description": "Scrape apartment listings in Milano",
                "site": "immobiliare.it",
                "url": "https://www.immobiliare.it/vendita-case/milano/",
                "search_criteria": {
                    "property_type": "apartment",
                    "price_range": "200000-500000"
                },
                "max_pages": 5,
                "delay_ms": 1500,
                "priority": "normal",
                "max_retries": 3
            }
        }


class JobResponse(BaseModel):
    """Response model for job information."""
    
    id: str
    title: str
    description: Optional[str]
    status: JobStatus
    priority: JobPriority
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    progress_percentage: float
    pages_processed: int
    items_found: int
    current_retry: int
    max_retries: int
    last_error: Optional[str]
    
    class Config:
        from_attributes = True


class JobListResponse(BaseModel):
    """Response model for job listing."""
    
    jobs: List[JobResponse]
    total: int
    page: int
    limit: int
    has_next: bool


class JobResultResponse(BaseModel):
    """Response model for job results."""
    
    job_id: str
    status: JobStatus
    items_scraped: int
    pages_processed: int
    duration_seconds: float
    success_rate: float
    error_count: int
    output_files: List[str]
    storage_path: Optional[str]
    
    class Config:
        from_attributes = True


class QueueStatsResponse(BaseModel):
    """Response model for queue statistics."""
    
    total_jobs: int
    pending_jobs: int
    running_jobs: int
    completed_jobs: int
    failed_jobs: int
    success_rate: float
    queue_size: int
    active_workers: int
    last_updated: datetime
    
    class Config:
        from_attributes = True


# API Endpoints

@router.post("/jobs", response_model=JobResponse)
async def create_scraping_job(
    request: CreateJobRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Create a new scraping job.
    
    Creates and enqueues a new scraping job with the specified parameters.
    The job will be processed by available workers.
    """
    try:
        job_manager = await get_job_manager()
        
        # Create scraping target
        target = ScrapingTarget(
            site=request.site,
            url=request.url,
            search_criteria=request.search_criteria,
            max_pages=request.max_pages,
            delay_ms=request.delay_ms
        )
        
        # Create job
        job = await job_manager.create_job(
            user_id=user["id"],
            tenant_id=user["tenant_id"],
            title=request.title,
            target=target,
            description=request.description,
            priority=request.priority,
            max_retries=request.max_retries
        )
        
        if not job:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create scraping job"
            )
        
        logger.info("Scraping job created", job_id=job.id, user_id=user["id"])
        
        return JobResponse.from_orm(job)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to create scraping job", error=str(e), user_object=user)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while creating job"
        )

@router.get("/jobs", response_model=JobListResponse)
async def list_scraping_jobs(
    status_filter: Optional[JobStatus] = None,
    page: int = 1,
    limit: int = 20,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    List scraping jobs for the current user.
    
    Returns a paginated list of scraping jobs with optional status filtering.
    """
    try:
        job_manager = await get_job_manager()
        
        offset = (page - 1) * limit
        
        jobs = await job_manager.list_user_jobs(
            user_id=user["id"],
            tenant_id=user["tenant_id"],
            status=status_filter,
            limit=limit + 1,  # Get one extra to check if there are more
            offset=offset
        )
        
        has_next = len(jobs) > limit
        if has_next:
            jobs = jobs[:-1]  # Remove the extra job
        
        job_responses = [JobResponse.from_orm(job) for job in jobs]
        
        return JobListResponse(
            jobs=job_responses,
            total=len(job_responses),  # Note: This is not the total count across all pages
            page=page,
            limit=limit,
            has_next=has_next
        )
        
    except Exception as e:
        logger.error("Failed to list scraping jobs", error=str(e), user_id=user["id"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while listing jobs"
        )


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_scraping_job(
    job_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get details of a specific scraping job.
    
    Returns detailed information about a scraping job, including current status and progress.
    """
    try:
        job_manager = await get_job_manager()
        
        job = await job_manager.get_job(job_id)
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Job not found"
            )
        
        # Verify ownership
        if job.user_id != user["id"] or job.tenant_id != user["tenant_id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this job"
            )
        
        return JobResponse.from_orm(job)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get scraping job", job_id=job_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while retrieving job"
        )


@router.post("/jobs/{job_id}/cancel")
async def cancel_scraping_job(
    job_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Cancel a scraping job.
    
    Cancels a pending or running scraping job. Completed jobs cannot be cancelled.
    """
    try:
        job_manager = await get_job_manager()
        
        success = await job_manager.cancel_job(
            job_id=job_id,
            user_id=user["id"],
            tenant_id=user["tenant_id"]
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot cancel job (not found, not owned by user, or not cancellable)"
            )
        
        logger.info("Job cancelled", job_id=job_id, user_id=user["id"])
        
        return {"message": "Job cancelled successfully", "job_id": job_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to cancel job", job_id=job_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while cancelling job"
        )


@router.post("/jobs/{job_id}/retry")
async def retry_scraping_job(
    job_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Retry a failed scraping job.
    
    Retries a failed scraping job if retry attempts are remaining.
    """
    try:
        job_manager = await get_job_manager()
        
        success = await job_manager.retry_job(
            job_id=job_id,
            user_id=user["id"],
            tenant_id=user["tenant_id"]
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot retry job (not found, not owned by user, or not retryable)"
            )
        
        logger.info("Job retry initiated", job_id=job_id, user_id=user["id"])
        
        return {"message": "Job retry initiated", "job_id": job_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to retry job", job_id=job_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while retrying job"
        )


@router.get("/jobs/{job_id}/result", response_model=JobResultResponse)
async def get_job_result(
    job_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get results of a completed scraping job.
    
    Returns detailed results and statistics for a completed job.
    """
    try:
        job_manager = await get_job_manager()
        
        # Verify job ownership
        job = await job_manager.get_job(job_id)
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Job not found"
            )
        
        if job.user_id != user["id"] or job.tenant_id != user["tenant_id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this job"
            )
        
        # Get job result
        result = await job_manager.get_job_result(job_id)
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Job result not available"
            )
        
        return JobResultResponse.from_orm(result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get job result", job_id=job_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while retrieving job result"
        )


@router.get("/stats", response_model=QueueStatsResponse)
async def get_queue_stats(
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get queue statistics and system status.
    
    Returns information about job queues, processing statistics, and system health.
    """
    try:
        job_manager = await get_job_manager()
        
        stats = await job_manager.get_stats(tenant_id=user["tenant_id"])
        
        return QueueStatsResponse.from_orm(stats)
        
    except Exception as e:
        logger.error("Failed to get queue stats", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while retrieving queue statistics"
        )



