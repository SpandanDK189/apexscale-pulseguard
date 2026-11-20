import asyncio
import os
import uuid
import time
from datetime import datetime
from typing import Dict, Any, Optional, List

class InventoryStore:
    def __init__(self):
        self._lock: Optional[asyncio.Lock] = None
        self._semaphore: Optional[asyncio.Semaphore] = None
        self.instance_id = os.environ.get("HOSTNAME", f"inst-{uuid.uuid4().hex[:6]}")
        
        # Simulated bottlenecks configurable via ENV
        self.processing_delay_ms = int(os.environ.get("CHECKOUT_DELAY_MS", "200"))
        self.max_concurrency = int(os.environ.get("MAX_CONCURRENCY", "10"))
        
        self.current_active_requests = 0
        
        # Initial Stock Setup (Matches Spandan's PROD-FLASH-001 spec)
        self.default_total_stock = int(os.environ.get("INITIAL_STOCK", "500"))
        self.sku = "PROD-FLASH-001"
        self.product_id = "PROD-FLASH-001"
        self.product_name = "ApexPhone 15 Pro (Titanium Black)"
        self.product_price = 79999.0
        self.product_desc = "Flagship device featured in Great Indian Festival Flash Sale."
        
        # Store for processed idempotency keys to prevent double-locking
        self.idempotent_locks: Dict[str, Dict[str, Any]] = {}
        self.locked_channels: set = set()
        
        self.reset()

    @property
    def lock(self) -> asyncio.Lock:
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    @property
    def concurrency_semaphore(self) -> asyncio.Semaphore:
        if self._semaphore is None:
            self._semaphore = asyncio.Semaphore(self.max_concurrency)
        return self._semaphore

    def reset(self):
        self.total_stock = self.default_total_stock
        self.available_stock = self.default_total_stock
        self.locked_stock = 0
        self.sold_stock = 0
        self.oversell_attempts = 0
        self.total_checkouts_attempted = 0
        self.successful_checkouts = 0
        self.failed_checkouts_503 = 0
        self.channel_locks: Dict[str, int] = {}
        self.locked_channels.clear()
        self.idempotent_locks.clear()

    def get_status(self) -> Dict[str, Any]:
        return {
            "sku": self.sku,
            "product_id": self.product_id,
            "name": self.product_name,
            "total_stock": self.total_stock,
            "available_stock": self.available_stock,
            "locked_stock": self.locked_stock,
            "sold_stock": self.sold_stock,
            "oversell_attempts": self.oversell_attempts,
            "total_checkouts_attempted": self.total_checkouts_attempted,
            "successful_checkouts": self.successful_checkouts,
            "failed_checkouts_503": self.failed_checkouts_503,
            "active_concurrency": self.current_active_requests,
            "max_concurrency_limit": self.max_concurrency,
            "channels_locked": sorted(list(self.locked_channels)),
            "processing_delay_ms": self.processing_delay_ms,
            "instance_id": self.instance_id,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

    async def lock_stock(
        self,
        quantity: int,
        channels: List[str],
        idempotency_key: str,
        reason: str = ""
    ) -> Dict[str, Any]:
        async with self.lock:
            # Check Idempotency: Return cached response if key already processed
            if idempotency_key in self.idempotent_locks:
                cached = self.idempotent_locks[idempotency_key]
                cached["status"] = "ALREADY_LOCKED"
                cached["message"] = f"Idempotent replay: lock for key '{idempotency_key}' previously recorded."
                return cached

            # We can only lock up to what is currently available
            actual_lock = min(quantity, self.available_stock)
            self.available_stock -= actual_lock
            self.locked_stock += actual_lock
            
            for ch in channels:
                self.channel_locks[ch] = self.channel_locks.get(ch, 0) + actual_lock
                self.locked_channels.add(ch)

            record = {
                "status": "LOCKED",
                "sku": self.sku,
                "locked_units": actual_lock,
                "available_units": self.available_stock,
                "channels_locked": sorted(list(self.locked_channels)),
                "lock_timestamp": datetime.utcnow().isoformat() + "Z",
                "idempotency_key": idempotency_key,
                "total_locked_stock": self.locked_stock,
                "message": f"Successfully locked {actual_lock} units. Reason: {reason or 'Surge buffer'}"
            }
            
            self.idempotent_locks[idempotency_key] = record
            return record

    async def unlock_stock(self, quantity: Optional[int] = None, channels: Optional[List[str]] = None) -> Dict[str, Any]:
        async with self.lock:
            release_qty = self.locked_stock if quantity is None else min(quantity, self.locked_stock)
            self.locked_stock -= release_qty
            self.available_stock += release_qty
            
            if channels:
                for ch in channels:
                    self.locked_channels.discard(ch)
                    self.channel_locks.pop(ch, None)
            else:
                self.channel_locks.clear()
                self.locked_channels.clear()
            
            return {
                "status": "UNLOCKED",
                "sku": self.sku,
                "released_units": release_qty,
                "total_locked_stock": self.locked_stock,
                "available_units": self.available_stock,
                "channels_locked": sorted(list(self.locked_channels)),
                "message": f"Released {release_qty} locked units back to available pool."
            }

    def update_config(self, delay_ms: Optional[int], max_concurrency: Optional[int]):
        if delay_ms is not None:
            self.processing_delay_ms = delay_ms
        if max_concurrency is not None:
            self.max_concurrency = max_concurrency
            self._semaphore = asyncio.Semaphore(max_concurrency)

# Global singleton store
store = InventoryStore()
