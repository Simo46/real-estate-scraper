"""
Job Manager for orchestrating scraping jobs.

Provides high-level job management with worker coordination and error handling.
"""

import asyncio
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Callable
import structlog
from uuid import uuid4

from .job_queue import JobQueue, get_job_queue
from .models import (
    ScrapingJob, ScrapingTarget, JobStatus, JobPriority, 
    JobResult, QueueStats
)

logger = structlog.get_logger(__name__)


class JobManager:
    """High-level job management with worker coordination"""
    
    def __init__(self, job_queue: Optional[JobQueue] = None):
        """Initialize job manager"""
        self.queue = job_queue or None
        self.workers: Dict[str, asyncio.Task] = {}
        self.worker_callbacks: Dict[str, Callable] = {}
        self.running = False
        
        logger.info("JobManager initialized")
    
    async def start(self):
        """Start job manager"""
        if not self.queue:
            self.queue = await get_job_queue()
        
        self.running = True
        logger.info("JobManager started")
    
    async def stop(self):
        """Stop job manager and clean up workers"""
        self.running = False
        
        # Cancel all workers
        for worker_id, task in self.workers.items():
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                logger.info("Worker stopped", worker_id=worker_id)
        
        self.workers.clear()
        self.worker_callbacks.clear()
        
        if self.queue:
            await self.queue.close()
        
        logger.info("JobManager stopped")
    
    async def create_job(self,
                        user_id: str,
                        tenant_id: str,
                        title: str,
                        target: ScrapingTarget,
                        description: Optional[str] = None,
                        priority: JobPriority = JobPriority.NORMAL,
                        max_retries: int = 3) -> Optional[ScrapingJob]:
        """
        Create and enqueue a new scraping job.
        
        Args:
            user_id: User creating the job
            tenant_id: Tenant ID for multi-tenancy
            title: Human-readable job title
            target: Scraping target configuration
            description: Optional job description
            priority: Job priority
            max_retries: Maximum retry attempts
            
        Returns:
            Created job or None if failed
        """
        try:
            job = ScrapingJob(
                user_id=user_id,
                tenant_id=tenant_id,
                title=title,
                description=description,
                target=target,
                priority=priority,
                max_retries=max_retries
            )
            
            if not self.queue:
                self.queue = await get_job_queue()
            
            success = await self.queue.enqueue(job)
            if success:
                logger.info("Job created", job_id=job.id, title=title, user_id=user_id)
                return job
            else:
                logger.error("Failed to enqueue job", title=title, user_id=user_id)
                return None
                
        except Exception as e:
            logger.error("Failed to create job", title=title, error=str(e))
            return None
    
    async def get_job(self, job_id: str) -> Optional[ScrapingJob]:
        """Get job by ID"""
        if not self.queue:
            self.queue = await get_job_queue()
        return await self.queue.get_job(job_id)
    
    async def get_job_result(self, job_id: str) -> Optional[JobResult]:
        """Get job result by ID"""
        if not self.queue:
            self.queue = await get_job_queue()
        return await self.queue.get_job_result(job_id)
    
    async def list_user_jobs(self,
                            user_id: str,
                            tenant_id: str,
                            status: Optional[JobStatus] = None,
                            limit: int = 50,
                            offset: int = 0) -> List[ScrapingJob]:
        """List jobs for a specific user"""
        if not self.queue:
            self.queue = await get_job_queue()
        
        return await self.queue.list_jobs(
            status=status,
            user_id=user_id,
            tenant_id=tenant_id,
            limit=limit,
            offset=offset
        )
    
    async def cancel_job(self, job_id: str, user_id: str, tenant_id: str) -> bool:
        """
        Cancel a job (with user/tenant validation).
        
        Args:
            job_id: Job to cancel
            user_id: User requesting cancellation
            tenant_id: Tenant ID for validation
            
        Returns:
            bool: True if cancelled successfully
        """
        try:
            # Validate ownership
            job = await self.get_job(job_id)
            if not job:
                logger.warning("Job not found for cancellation", job_id=job_id)
                return False
            
            if job.user_id != user_id or job.tenant_id != tenant_id:
                logger.warning("Unauthorized job cancellation attempt", 
                             job_id=job_id, user_id=user_id)
                return False
            
            if job.status not in [JobStatus.PENDING, JobStatus.RUNNING]:
                logger.warning("Cannot cancel job in current status", 
                             job_id=job_id, status=job.status.value)
                return False
            
            success = await self.queue.cancel_job(job_id)
            if success:
                logger.info("Job cancelled", job_id=job_id, user_id=user_id)
            
            return success
            
        except Exception as e:
            logger.error("Failed to cancel job", job_id=job_id, error=str(e))
            return False
    
    async def retry_job(self, job_id: str, user_id: str, tenant_id: str) -> bool:
        """
        Retry a failed job (with user/tenant validation).
        
        Args:
            job_id: Job to retry
            user_id: User requesting retry
            tenant_id: Tenant ID for validation
            
        Returns:
            bool: True if retry initiated successfully
        """
        try:
            # Validate ownership
            job = await self.get_job(job_id)
            if not job:
                logger.warning("Job not found for retry", job_id=job_id)
                return False
            
            if job.user_id != user_id or job.tenant_id != tenant_id:
                logger.warning("Unauthorized job retry attempt", 
                             job_id=job_id, user_id=user_id)
                return False
            
            if not job.can_retry():
                logger.warning("Job cannot be retried", job_id=job_id, 
                             status=job.status.value, retries=job.current_retry)
                return False
            
            success = await self.queue.retry_job(job_id)
            if success:
                logger.info("Job retry initiated", job_id=job_id, user_id=user_id)
            
            return success
            
        except Exception as e:
            logger.error("Failed to retry job", job_id=job_id, error=str(e))
            return False
    
    async def get_stats(self, tenant_id: Optional[str] = None) -> QueueStats:
        """
        Get queue statistics, optionally filtered by tenant.
        
        Args:
            tenant_id: Optional tenant filter
            
        Returns:
            Queue statistics
        """
        if not self.queue:
            self.queue = await get_job_queue()
        
        # Get global stats
        stats = await self.queue.get_queue_stats()
        
        # If tenant filtering is needed, we'd need to implement it
        # For now, return global stats
        # TODO: Implement tenant-specific statistics
        
        return stats
    
    async def register_worker(self, 
                             worker_id: str, 
                             callback: Callable[[ScrapingJob], None]) -> bool:
        """
        Register a worker to process jobs.
        
        Args:
            worker_id: Unique worker identifier
            callback: Function to call when job is received
            
        Returns:
            bool: True if worker registered successfully
        """
        try:
            if worker_id in self.workers:
                logger.warning("Worker already registered", worker_id=worker_id)
                return False
            
            # Store callback
            self.worker_callbacks[worker_id] = callback
            
            # Start worker task
            task = asyncio.create_task(self._worker_loop(worker_id))
            self.workers[worker_id] = task
            
            logger.info("Worker registered", worker_id=worker_id)
            return True
            
        except Exception as e:
            logger.error("Failed to register worker", worker_id=worker_id, error=str(e))
            return False
    
    async def unregister_worker(self, worker_id: str) -> bool:
        """Unregister a worker"""
        try:
            # Cancel worker task
            if worker_id in self.workers:
                task = self.workers[worker_id]
                if not task.done():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
                del self.workers[worker_id]
            
            # Remove callback
            if worker_id in self.worker_callbacks:
                del self.worker_callbacks[worker_id]
            
            logger.info("Worker unregistered", worker_id=worker_id)
            return True
            
        except Exception as e:
            logger.error("Failed to unregister worker", worker_id=worker_id, error=str(e))
            return False
    
    async def _worker_loop(self, worker_id: str):
        """Main worker loop for processing jobs"""
        if not self.queue:
            self.queue = await get_job_queue()
        
        callback = self.worker_callbacks.get(worker_id)
        if not callback:
            logger.error("No callback found for worker", worker_id=worker_id)
            return
        
        logger.info("Worker loop started", worker_id=worker_id)
        
        while self.running:
            try:
                # Dequeue job with timeout
                job = await self.queue.dequeue(worker_id, timeout=10)
                
                if job:
                    logger.info("Worker processing job", worker_id=worker_id, job_id=job.id)
                    
                    try:
                        # Call worker callback
                        await callback(job)
                        
                    except Exception as e:
                        logger.error("Worker callback failed", 
                                   worker_id=worker_id, job_id=job.id, error=str(e))
                        
                        # Update job status
                        await self.queue.update_job_status(
                            job.id, JobStatus.FAILED, error=str(e)
                        )
                
                # Short sleep to prevent busy loop
                await asyncio.sleep(0.1)
                
            except asyncio.CancelledError:
                logger.info("Worker loop cancelled", worker_id=worker_id)
                break
            except Exception as e:
                logger.error("Worker loop error", worker_id=worker_id, error=str(e))
                await asyncio.sleep(1)  # Back off on error
        
        logger.info("Worker loop stopped", worker_id=worker_id)
    
    async def update_job_progress(self, 
                                 job_id: str, 
                                 progress: float,
                                 pages_processed: int = 0,
                                 items_found: int = 0) -> bool:
        """Update job progress"""
        try:
            if not self.queue:
                self.queue = await get_job_queue()
            
            job = await self.queue.get_job(job_id)
            if not job:
                return False
            
            job.update_progress(progress, pages_processed, items_found)
            await self.queue._update_job(job)
            
            logger.debug("Job progress updated", job_id=job_id, progress=progress)
            return True
            
        except Exception as e:
            logger.error("Failed to update job progress", job_id=job_id, error=str(e))
            return False
    
    async def complete_job(self, 
                          job_id: str, 
                          result: JobResult) -> bool:
        """Mark job as completed and save result"""
        try:
            if not self.queue:
                self.queue = await get_job_queue()
            
            # Update job status
            await self.queue.update_job_status(job_id, JobStatus.COMPLETED)
            
            # Save result
            await self.queue.save_job_result(result)
            
            logger.info("Job completed", job_id=job_id)
            return True
            
        except Exception as e:
            logger.error("Failed to complete job", job_id=job_id, error=str(e))
            return False


# Global job manager instance
_job_manager: Optional[JobManager] = None


async def get_job_manager() -> JobManager:
    """Get global job manager instance"""
    global _job_manager
    if _job_manager is None:
        _job_manager = JobManager()
        await _job_manager.start()
    return _job_manager
