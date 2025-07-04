"""
Error notification system for scrapers.
"""

import asyncio
import smtplib
from typing import Dict, Any, List, Optional, Callable
from email.mime.text import MIMEText as MimeText
from email.mime.multipart import MIMEMultipart as MimeMultipart
from datetime import datetime, timedelta
from dataclasses import dataclass
from abc import ABC, abstractmethod
import httpx
import json

from .logging import get_scraper_logger


@dataclass
class ErrorAlert:
    """Error alert data structure."""
    
    scraper_name: str
    error_type: str
    message: str
    timestamp: datetime
    severity: str  # 'low', 'medium', 'high', 'critical'
    operation_id: Optional[str] = None
    url: Optional[str] = None
    stack_trace: Optional[str] = None
    context: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert alert to dictionary."""
        return {
            'scraper_name': self.scraper_name,
            'error_type': self.error_type,
            'message': self.message,
            'timestamp': self.timestamp.isoformat(),
            'severity': self.severity,
            'operation_id': self.operation_id,
            'url': self.url,
            'stack_trace': self.stack_trace,
            'context': self.context or {}
        }


class NotificationChannel(ABC):
    """Abstract base class for notification channels."""
    
    @abstractmethod
    async def send_alert(self, alert: ErrorAlert) -> bool:
        """Send an alert through this channel."""
        pass


class EmailNotificationChannel(NotificationChannel):
    """Email notification channel."""
    
    def __init__(self, 
                 smtp_host: str,
                 smtp_port: int,
                 username: str,
                 password: str,
                 from_email: str,
                 to_emails: List[str],
                 use_tls: bool = True):
        self.smtp_host = smtp_host
        self.smtp_port = smtp_port
        self.username = username
        self.password = password
        self.from_email = from_email
        self.to_emails = to_emails
        self.use_tls = use_tls
        self.logger = get_scraper_logger('EmailNotification')
    
    async def send_alert(self, alert: ErrorAlert) -> bool:
        """Send alert via email."""
        try:
            # Create message
            msg = MimeMultipart()
            msg['From'] = self.from_email
            msg['To'] = ', '.join(self.to_emails)
            msg['Subject'] = f"🚨 Scraper Alert: {alert.severity.upper()} - {alert.scraper_name}"
            
            # Create email body
            body = self._create_email_body(alert)
            msg.attach(MimeText(body, 'html'))
            
            # Send email
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                if self.use_tls:
                    server.starttls()
                server.login(self.username, self.password)
                text = msg.as_string()
                server.sendmail(self.from_email, self.to_emails, text)
            
            self.logger.info("Email alert sent successfully", alert_id=alert.operation_id)
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to send email alert: {str(e)}", exc_info=True)
            return False
    
    def _create_email_body(self, alert: ErrorAlert) -> str:
        """Create HTML email body."""
        severity_colors = {
            'low': '#28a745',
            'medium': '#ffc107',
            'high': '#fd7e14',
            'critical': '#dc3545'
        }
        
        color = severity_colors.get(alert.severity, '#6c757d')
        
        html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; margin: 20px;">
            <div style="border-left: 4px solid {color}; padding-left: 20px;">
                <h2 style="color: {color};">Scraper Error Alert</h2>
                
                <table style="border-collapse: collapse; width: 100%; margin-top: 20px;">
                    <tr><td style="font-weight: bold; padding: 8px; border: 1px solid #ddd;">Scraper:</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">{alert.scraper_name}</td></tr>
                    <tr><td style="font-weight: bold; padding: 8px; border: 1px solid #ddd;">Severity:</td>
                        <td style="padding: 8px; border: 1px solid #ddd; color: {color};">{alert.severity.upper()}</td></tr>
                    <tr><td style="font-weight: bold; padding: 8px; border: 1px solid #ddd;">Error Type:</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">{alert.error_type}</td></tr>
                    <tr><td style="font-weight: bold; padding: 8px; border: 1px solid #ddd;">Time:</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">{alert.timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')}</td></tr>
                    <tr><td style="font-weight: bold; padding: 8px; border: 1px solid #ddd;">Operation ID:</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">{alert.operation_id or 'N/A'}</td></tr>
                    <tr><td style="font-weight: bold; padding: 8px; border: 1px solid #ddd;">URL:</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">{alert.url or 'N/A'}</td></tr>
                </table>
                
                <h3>Error Message:</h3>
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0;">
                    <code>{alert.message}</code>
                </div>
                
                {self._format_context(alert.context) if alert.context else ''}
                {self._format_stack_trace(alert.stack_trace) if alert.stack_trace else ''}
            </div>
        </body>
        </html>
        """
        return html
    
    def _format_context(self, context: Dict[str, Any]) -> str:
        """Format context information."""
        if not context:
            return ""
        
        context_html = "<h3>Context:</h3><div style='background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0;'>"
        for key, value in context.items():
            context_html += f"<strong>{key}:</strong> {value}<br>"
        context_html += "</div>"
        return context_html
    
    def _format_stack_trace(self, stack_trace: str) -> str:
        """Format stack trace."""
        if not stack_trace:
            return ""
        
        return f"""
        <h3>Stack Trace:</h3>
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0; font-family: monospace; font-size: 12px; overflow-x: auto;">
            <pre>{stack_trace}</pre>
        </div>
        """


class SlackNotificationChannel(NotificationChannel):
    """Slack notification channel."""
    
    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url
        self.logger = get_scraper_logger('SlackNotification')
    
    async def send_alert(self, alert: ErrorAlert) -> bool:
        """Send alert to Slack."""
        try:
            # Create Slack message
            color_map = {
                'low': '#28a745',
                'medium': '#ffc107',
                'high': '#fd7e14',
                'critical': '#dc3545'
            }
            
            color = color_map.get(alert.severity, '#6c757d')
            
            message = {
                "attachments": [
                    {
                        "color": color,
                        "title": f"🚨 Scraper Alert: {alert.severity.upper()}",
                        "fields": [
                            {"title": "Scraper", "value": alert.scraper_name, "short": True},
                            {"title": "Error Type", "value": alert.error_type, "short": True},
                            {"title": "Time", "value": alert.timestamp.strftime('%Y-%m-%d %H:%M:%S UTC'), "short": True},
                            {"title": "Operation ID", "value": alert.operation_id or 'N/A', "short": True},
                            {"title": "Message", "value": alert.message, "short": False}
                        ],
                        "footer": "Real Estate Scraper",
                        "ts": int(alert.timestamp.timestamp())
                    }
                ]
            }
            
            if alert.url:
                message["attachments"][0]["fields"].append({
                    "title": "URL", "value": alert.url, "short": False
                })
            
            # Send to Slack
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.webhook_url,
                    json=message,
                    timeout=10.0
                )
                response.raise_for_status()
            
            self.logger.info("Slack alert sent successfully", alert_id=alert.operation_id)
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to send Slack alert: {str(e)}", exc_info=True)
            return False


class WebhookNotificationChannel(NotificationChannel):
    """Generic webhook notification channel."""
    
    def __init__(self, webhook_url: str, headers: Dict[str, str] = None):
        self.webhook_url = webhook_url
        self.headers = headers or {}
        self.logger = get_scraper_logger('WebhookNotification')
    
    async def send_alert(self, alert: ErrorAlert) -> bool:
        """Send alert via webhook."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.webhook_url,
                    json=alert.to_dict(),
                    headers=self.headers,
                    timeout=10.0
                )
                response.raise_for_status()
            
            self.logger.info("Webhook alert sent successfully", alert_id=alert.operation_id)
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to send webhook alert: {str(e)}", exc_info=True)
            return False


class ErrorNotificationSystem:
    """Main error notification system."""
    
    def __init__(self):
        self.channels: List[NotificationChannel] = []
        self.filters: List[Callable[[ErrorAlert], bool]] = []
        self.alert_history: List[ErrorAlert] = []
        self.rate_limits: Dict[str, datetime] = {}
        self.logger = get_scraper_logger('ErrorNotificationSystem')
    
    def add_channel(self, channel: NotificationChannel):
        """Add a notification channel."""
        self.channels.append(channel)
        self.logger.info(f"Added notification channel: {type(channel).__name__}")
    
    def add_filter(self, filter_func: Callable[[ErrorAlert], bool]):
        """Add a filter function for alerts."""
        self.filters.append(filter_func)
    
    async def send_alert(self, alert: ErrorAlert, rate_limit_minutes: int = 5):
        """Send an alert through all configured channels."""
        
        # Apply filters
        for filter_func in self.filters:
            if not filter_func(alert):
                self.logger.debug(f"Alert filtered out: {alert.scraper_name} - {alert.error_type}")
                return
        
        # Rate limiting to prevent spam
        rate_limit_key = f"{alert.scraper_name}:{alert.error_type}"
        if rate_limit_key in self.rate_limits:
            time_diff = datetime.utcnow() - self.rate_limits[rate_limit_key]
            if time_diff < timedelta(minutes=rate_limit_minutes):
                self.logger.debug(f"Alert rate limited: {rate_limit_key}")
                return
        
        self.rate_limits[rate_limit_key] = datetime.utcnow()
        
        # Store alert
        self.alert_history.append(alert)
        
        # Send through all channels
        results = []
        for channel in self.channels:
            try:
                result = await channel.send_alert(alert)
                results.append(result)
            except Exception as e:
                self.logger.error(f"Channel {type(channel).__name__} failed: {str(e)}")
                results.append(False)
        
        success_count = sum(results)
        self.logger.info(
            f"Alert sent through {success_count}/{len(self.channels)} channels",
            alert_type=alert.error_type,
            scraper=alert.scraper_name
        )
    
    def create_alert(self,
                    scraper_name: str,
                    error_type: str,
                    message: str,
                    severity: str = "medium",
                    operation_id: str = None,
                    url: str = None,
                    stack_trace: str = None,
                    context: Dict[str, Any] = None) -> ErrorAlert:
        """Create an error alert."""
        return ErrorAlert(
            scraper_name=scraper_name,
            error_type=error_type,
            message=message,
            timestamp=datetime.utcnow(),
            severity=severity,
            operation_id=operation_id,
            url=url,
            stack_trace=stack_trace,
            context=context
        )
    
    async def notify_critical_error(self,
                                  scraper_name: str,
                                  message: str,
                                  operation_id: str = None,
                                  url: str = None,
                                  context: Dict[str, Any] = None):
        """Send critical error notification."""
        alert = self.create_alert(
            scraper_name=scraper_name,
            error_type="critical_error",
            message=message,
            severity="critical",
            operation_id=operation_id,
            url=url,
            context=context
        )
        await self.send_alert(alert, rate_limit_minutes=1)  # Lower rate limit for critical errors
    
    async def notify_scraper_failure(self,
                                   scraper_name: str,
                                   message: str,
                                   operation_id: str = None,
                                   context: Dict[str, Any] = None):
        """Send scraper failure notification."""
        alert = self.create_alert(
            scraper_name=scraper_name,
            error_type="scraper_failure",
            message=message,
            severity="high",
            operation_id=operation_id,
            context=context
        )
        await self.send_alert(alert)
    
    async def notify_rate_limit(self,
                              scraper_name: str,
                              url: str,
                              retry_after: int = None):
        """Send rate limit notification."""
        context = {"retry_after": retry_after} if retry_after else None
        alert = self.create_alert(
            scraper_name=scraper_name,
            error_type="rate_limit",
            message=f"Rate limited by {url}",
            severity="medium",
            url=url,
            context=context
        )
        await self.send_alert(alert, rate_limit_minutes=30)  # Higher rate limit for rate limit errors
    
    def get_recent_alerts(self, hours: int = 24) -> List[ErrorAlert]:
        """Get recent alerts."""
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)
        return [alert for alert in self.alert_history if alert.timestamp >= cutoff_time]


# Global notification system instance
notification_system = ErrorNotificationSystem()


def get_notification_system() -> ErrorNotificationSystem:
    """Get the global notification system."""
    return notification_system


# Common filter functions
def severity_filter(min_severity: str) -> Callable[[ErrorAlert], bool]:
    """Filter alerts by minimum severity."""
    severity_levels = {'low': 0, 'medium': 1, 'high': 2, 'critical': 3}
    min_level = severity_levels.get(min_severity, 0)
    
    def filter_func(alert: ErrorAlert) -> bool:
        alert_level = severity_levels.get(alert.severity, 0)
        return alert_level >= min_level
    
    return filter_func


def scraper_filter(excluded_scrapers: List[str]) -> Callable[[ErrorAlert], bool]:
    """Filter out alerts from specific scrapers."""
    def filter_func(alert: ErrorAlert) -> bool:
        return alert.scraper_name not in excluded_scrapers
    
    return filter_func
