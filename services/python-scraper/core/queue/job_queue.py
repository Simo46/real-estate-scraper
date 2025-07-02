"""
Redis-based job queue implementation.

Provides a robust queue system for managing scraping jobs with Redis backend.
"""

import json
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Callable
import structlog
import redis.asyncio as redis
from redis.asyncio import Redis

from config.settings import get_settings
from .models import ScrapingJob, JobStatus, JobPriority, JobResult, QueueStats

logger = structlog.get_logger(__name__)


class JobQueue:
    """Redis-based job queue with priority support"""
    
    def __init__(self, redis_client: Optional[Redis] = None):
        """Initialize job queue"""
        self.settings = get_settings()
        self.redis = redis_client or self._create_redis_client()
        
        # Queue naming
        self.queues = {
            JobPriority.URGENT: "scraping:queue:urgent",
            JobPriority.HIGH: "scraping:queue:high", 
            JobPriority.NORMAL: "scraping:queue:normal",
            JobPriority.LOW: "scraping:queue:low"
        }
        
        # Storage keys
        self.jobs_key = "scraping:jobs"  # Hash for job data
        self.status_key = "scraping:status"  # Hash for job status
        self.results_key = "scraping:results"  # Hash for job results
        self.stats_key = "scraping:stats"  # Hash for queue stats
        self.locks_key = "scraping:locks"  # Set for job locks
        
        # Worker tracking
        self.workers_key = "scraping:workers"  # Set for active workers
        self.heartbeat_key = "scraping:heartbeat"  # Hash for worker heartbeats
        
        logger.info("JobQueue initialized", redis_url=str(self.settings.database.redis_url))
    
    def _create_redis_client(self) -> Redis:
        """Create Redis client with connection pooling"""
        return redis.from_url(
            self.settings.database.redis_url,
            max_connections=self.settings.database.redis_max_connections,
            retry_on_timeout=self.settings.database.redis_retry_on_timeout,
            decode_responses=True
        )
    
    async def enqueue(self, job: ScrapingJob) -> bool:
        """
        Add job to the appropriate priority queue.
        
        Args:
            job: The scraping job to enqueue
            
        Returns:
            bool: True if job was enqueued successfully
        """
        try:
            # Store job data
            job_data = job.to_dict()
            
            async with self.redis.pipeline() as pipe:
                # Store job data in hash
                await pipe.hset(self.jobs_key, job.id, json.dumps(job_data))
                
                # Add to priority queue (FIFO within priority)
                queue_key = self.queues[job.priority]
                await pipe.rpush(queue_key, job.id)
                
                # Update status
                await pipe.hset(self.status_key, job.id, job.status.value)
                
                # Execute pipeline
                await pipe.execute()
            
            logger.info("Job enqueued", job_id=job.id, priority=job.priority.value)
            return True
            
        except Exception as e:
            logger.error("Failed to enqueue job", job_id=job.id, error=str(e))
            return False
    
    async def dequeue(self, worker_id: str, timeout: int = 30) -> Optional[ScrapingJob]:
        """
        Get next job from queue (priority order).
        
        Args:
            worker_id: Unique worker identifier
            timeout: Timeout in seconds for blocking pop
            
        Returns:
            ScrapingJob or None if no job available
        """
        try:
            # Try queues in priority order
            queue_keys = [
                self.queues[JobPriority.URGENT],
                self.queues[JobPriority.HIGH],
                self.queues[JobPriority.NORMAL],
                self.queues[JobPriority.LOW]
            ]
            
            # Blocking pop from multiple queues
            result = await self.redis.blpop(queue_keys, timeout=timeout)
            
            if not result:
                return None
            
            queue_name, job_id = result
            
            # Get job data
            job_data_str = await self.redis.hget(self.jobs_key, job_id)
            if not job_data_str:
                logger.warning("Job data not found", job_id=job_id)
                return None
            
            job_data = json.loads(job_data_str)
            job = ScrapingJob.from_dict(job_data)
            
            # Mark job as running and assign to worker
            job.update_status(JobStatus.RUNNING)
            await self._update_job(job)
            
            # Add worker lock
            await self.redis.hset(self.locks_key, job_id, worker_id)
            
            # Register worker
            await self.redis.sadd(self.workers_key, worker_id)
            await self.redis.hset(self.heartbeat_key, worker_id, datetime.now(timezone.utc).isoformat())
            
            logger.info("Job dequeued", job_id=job_id, worker_id=worker_id)
            return job
            
        except Exception as e:
            logger.error("Failed to dequeue job", worker_id=worker_id, error=str(e))
            return None
    
    async def update_job_status(self, job_id: str, status: JobStatus, 
                               error: Optional[str] = None, 
                               progress: Optional[float] = None) -> bool:
        """
        Update job status and progress.
        
        Args:
            job_id: Job identifier
            status: New status
            error: Error message if applicable
            progress: Progress percentage
            
        Returns:
            bool: True if update successful
        """
        try:
            # Get current job
            job = await self.get_job(job_id)
            if not job:
                logger.warning("Job not found for status update", job_id=job_id)
                return False
            
            # Update job
            job.update_status(status, error)
            if progress is not None:
                job.update_progress(progress)
            
            # Save updated job
            await self._update_job(job)
            
            # Clean up if job is finished
            if status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]:
                await self._cleanup_job(job_id)
            
            logger.info("Job status updated", job_id=job_id, status=status.value)
            return True
            
        except Exception as e:
            logger.error("Failed to update job status", job_id=job_id, error=str(e))
            return False
    
    async def save_job_result(self, result: JobResult) -> bool:
        """
        Save job result.
        
        Args:
            result: Job result to save
            
        Returns:
            bool: True if saved successfully
        """
        try:
            result_data = result.to_dict()
            await self.redis.hset(self.results_key, result.job_id, json.dumps(result_data))
            
            logger.info("Job result saved", job_id=result.job_id)
            return True
            
        except Exception as e:
            logger.error("Failed to save job result", job_id=result.job_id, error=str(e))
            return False
    
    async def get_job(self, job_id: str) -> Optional[ScrapingJob]:
        """Get job by ID"""
        try:
            job_data_str = await self.redis.hget(self.jobs_key, job_id)
            if job_data_str:
                job_data = json.loads(job_data_str)
                return ScrapingJob.from_dict(job_data)
            return None
        except Exception as e:
            logger.error("Failed to get job", job_id=job_id, error=str(e))
            return None
    
    async def get_job_result(self, job_id: str) -> Optional[JobResult]:
        """Get job result by ID"""
        try:
            result_data_str = await self.redis.hget(self.results_key, job_id)
            if result_data_str:
                result_data = json.loads(result_data_str)
                return JobResult.from_dict(result_data)
            return None
        except Exception as e:
            logger.error("Failed to get job result", job_id=job_id, error=str(e))
            return None
    
    async def list_jobs(self, 
                       status: Optional[JobStatus] = None,
                       user_id: Optional[str] = None,
                       tenant_id: Optional[str] = None,
                       limit: int = 100,
                       offset: int = 0) -> List[ScrapingJob]:
        """
        List jobs with optional filtering.
        
        Args:
            status: Filter by status
            user_id: Filter by user
            tenant_id: Filter by tenant
            limit: Maximum number of jobs
            offset: Offset for pagination
            
        Returns:
            List of matching jobs
        """
        try:
            # Get all job IDs
            all_jobs_data = await self.redis.hgetall(self.jobs_key)
            jobs = []
            
            for job_id, job_data_str in all_jobs_data.items():
                try:
                    job_data = json.loads(job_data_str)
                    job = ScrapingJob.from_dict(job_data)
                    
                    # Apply filters
                    if status and job.status != status:
                        continue
                    if user_id and job.user_id != user_id:
                        continue  
                    if tenant_id and job.tenant_id != tenant_id:
                        continue
                    
                    jobs.append(job)
                    
                except Exception as e:
                    logger.warning("Failed to parse job data", job_id=job_id, error=str(e))
                    continue
            
            # Sort by creation time (newest first)
            jobs.sort(key=lambda x: x.created_at, reverse=True)
            
            # Apply pagination
            return jobs[offset:offset + limit]
            
        except Exception as e:
            logger.error("Failed to list jobs", error=str(e))
            return []
    
    async def get_queue_stats(self) -> QueueStats:
        """Get queue statistics"""
        try:
            # Count jobs by status
            all_jobs_data = await self.redis.hgetall(self.jobs_key)
            
            stats = QueueStats()
            stats.total_jobs = len(all_jobs_data)
            
            status_counts = {}
            for job_data_str in all_jobs_data.values():
                try:
                    job_data = json.loads(job_data_str)
                    status = job_data.get('status', 'unknown')
                    status_counts[status] = status_counts.get(status, 0) + 1
                except:
                    continue
            
            stats.pending_jobs = status_counts.get(JobStatus.PENDING.value, 0)
            stats.running_jobs = status_counts.get(JobStatus.RUNNING.value, 0)
            stats.completed_jobs = status_counts.get(JobStatus.COMPLETED.value, 0)
            stats.failed_jobs = status_counts.get(JobStatus.FAILED.value, 0)
            stats.retrying_jobs = status_counts.get(JobStatus.RETRYING.value, 0)
            
            # Calculate success rate
            if stats.total_jobs > 0:
                stats.success_rate = (stats.completed_jobs / stats.total_jobs) * 100
            
            # Queue sizes
            queue_size = 0
            for queue_key in self.queues.values():
                queue_size += await self.redis.llen(queue_key)
            stats.queue_size = queue_size
            
            # Active workers
            stats.active_workers = await self.redis.scard(self.workers_key)
            
            return stats
            
        except Exception as e:
            logger.error("Failed to get queue stats", error=str(e))
            return QueueStats()
    
    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a job"""
        try:
            # Remove from all queues
            for queue_key in self.queues.values():
                await self.redis.lrem(queue_key, 0, job_id)
            
            # Update status
            await self.update_job_status(job_id, JobStatus.CANCELLED)
            
            logger.info("Job cancelled", job_id=job_id)
            return True
            
        except Exception as e:
            logger.error("Failed to cancel job", job_id=job_id, error=str(e))
            return False
    
    async def retry_job(self, job_id: str) -> bool:
        """Retry a failed job"""
        try:
            job = await self.get_job(job_id)
            if not job or not job.can_retry():
                return False
            
            job.increment_retry()
            await self._update_job(job)
            
            # Re-enqueue
            queue_key = self.queues[job.priority]
            await self.redis.rpush(queue_key, job_id)
            
            logger.info("Job retried", job_id=job_id, retry_count=job.current_retry)
            return True
            
        except Exception as e:
            logger.error("Failed to retry job", job_id=job_id, error=str(e))
            return False
    
    async def _update_job(self, job: ScrapingJob) -> None:
        """Update job data in Redis"""
        job_data = job.to_dict()
        await self.redis.hset(self.jobs_key, job.id, json.dumps(job_data))
        await self.redis.hset(self.status_key, job.id, job.status.value)
    
    async def _cleanup_job(self, job_id: str) -> None:
        """Clean up job resources when finished"""
        await self.redis.hdel(self.locks_key, job_id)
    
    async def cleanup_expired_locks(self, timeout_minutes: int = 30) -> int:
        """Clean up expired job locks"""
        try:
            cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=timeout_minutes)
            
            # Get all heartbeats
            heartbeats = await self.redis.hgetall(self.heartbeat_key)
            expired_workers = []
            
            for worker_id, heartbeat_str in heartbeats.items():
                try:
                    heartbeat = datetime.fromisoformat(heartbeat_str)
                    if heartbeat < cutoff_time:
                        expired_workers.append(worker_id)
                except:
                    expired_workers.append(worker_id)
            
            # Clean up expired workers
            cleaned = 0
            for worker_id in expired_workers:
                await self.redis.srem(self.workers_key, worker_id)
                await self.redis.hdel(self.heartbeat_key, worker_id)
                cleaned += 1
            
            logger.info("Cleaned up expired locks", cleaned_count=cleaned)
            return cleaned
            
        except Exception as e:
            logger.error("Failed to cleanup expired locks", error=str(e))
            return 0
    
    async def close(self):
        """Close Redis connection"""
        await self.redis.aclose()


# Global queue instance
_job_queue: Optional[JobQueue] = None


async def get_job_queue() -> JobQueue:
    """Get global job queue instance"""
    global _job_queue
    if _job_queue is None:
        _job_queue = JobQueue()
    return _job_queue
