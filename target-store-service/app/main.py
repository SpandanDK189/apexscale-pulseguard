import time
import uuid
import asyncio
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any
from datetime import datetime
from fastapi import FastAPI, HTTPException, status, Response, Request
from fastapi.middleware.cors import CORSMiddleware

from app.models import (
    Product,
    CheckoutRequest,
    CheckoutResponse,
    InventoryLockRequest,
    InventoryLockResponse,
    InventoryUnlockRequest,
    InventoryStatus,
    ConfigUpdateRequest
)
from app.store import store

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure clean state
    store.reset()
    yield
    # Shutdown

app = FastAPI(
    title="PulseGuard Target Store Service",
    description="Flash-Sale Checkout & Inventory Simulation API with Strict Concurrency Bounds, Idempotent Stock Locking, and Telemetry Headers",
    version="1.1.0",
    lifespan=lifespan
)

# Enable CORS for local demo dashboard and cross-origin tools
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

import os
import httpx

TELEMETRY_URL = os.environ.get("TELEMETRY_INGEST_URL", "http://127.0.0.1:8080/telemetry/record")
telemetry_client = httpx.AsyncClient(timeout=0.5)

async def dispatch_telemetry(payload: dict):
    try:
        await telemetry_client.post(TELEMETRY_URL, json=payload)
    except Exception:
        pass  # Never block checkout flow if telemetry collector is unavailable

# Pure ASGI Middleware for zero-overhead telemetry injection & async forwarding
class TelemetryMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start_time = time.perf_counter()
        status_holder = [200]

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status_holder[0] = message.get("status", 200)
                duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
                headers = list(message.get("headers", []))
                headers.append((b"x-pulseguard-instance", store.instance_id.encode()))
                headers.append((b"x-pulseguard-concurrency", str(store.current_active_requests).encode()))
                headers.append((b"x-pulseguard-queue-depth", str(max(0, store.current_active_requests - store.max_concurrency)).encode()))
                headers.append((b"x-pulseguard-latency-ms", str(duration_ms).encode()))
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            path = scope.get("path", "")
            if not path.startswith("/health"):
                duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
                channel = "d2c"
                for h_k, h_v in scope.get("headers", []):
                    if h_k.lower() == b"x-client-channel":
                        channel = h_v.decode("utf-8", errors="ignore")
                        break

                payload = {
                    "endpoint": path,
                    "http_method": scope.get("method", "GET"),
                    "status_code": status_holder[0],
                    "latency_ms": duration_ms,
                    "queue_depth": max(0, store.current_active_requests - store.max_concurrency),
                    "active_instances": getattr(store, "allocated_instances", 1),
                    "channel": channel
                }
                asyncio.create_task(dispatch_telemetry(payload))

app.add_middleware(TelemetryMiddleware)

@app.get("/health", tags=["Health"])
async def health():
    return {
        "status": "healthy",
        "instance_id": store.instance_id,
        "active_concurrency": store.current_active_requests,
        "max_concurrency_limit": store.max_concurrency,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }

@app.get("/api/products", tags=["Catalog"])
async def get_products():
    """List available products in the flash-sale catalog."""
    status_data = store.get_status()
    product = Product(
        id=store.product_id,
        sku=store.sku,
        name=store.product_name,
        price=store.product_price,
        description=store.product_desc,
        total_stock=status_data["total_stock"],
        available_stock=status_data["available_stock"],
        locked_stock=status_data["locked_stock"],
        sold_stock=status_data["sold_stock"]
    )
    return {"products": [product.model_dump()]}

@app.post("/api/checkout", response_model=CheckoutResponse, tags=["Checkout"])
async def process_checkout(req: CheckoutRequest, response: Response):
    """
    Simulated Flash-Sale Checkout endpoint.
    Enforces concurrency threshold (default 10) to realistically fail with 503 during traffic surges.
    Applies simulated database/gateway processing delay (150-300ms).
    """
    start_time = time.perf_counter()
    store.total_checkouts_attempted += 1

    # Check immediate saturation
    if store.current_active_requests >= store.max_concurrency:
        store.failed_checkouts_503 += 1
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "Service Unavailable: Container concurrency limit reached.",
                "reason": "Instance capacity saturated (Reactive scaling lag window)",
                "active_concurrency": store.current_active_requests,
                "max_concurrency": store.max_concurrency,
                "instance_id": store.instance_id
            }
        )

    # Attempt to acquire concurrency slot with short timeout
    try:
        await asyncio.wait_for(store.concurrency_semaphore.acquire(), timeout=0.08)
    except asyncio.TimeoutError:
        store.failed_checkouts_503 += 1
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "Service Unavailable: Request queued too long.",
                "reason": "Queue depth saturated while waiting for compute thread",
                "instance_id": store.instance_id
            }
        )

    store.current_active_requests += 1

    try:
        # Simulate processing delay (DB transaction, payment gateway authorization)
        if store.processing_delay_ms > 0:
            await asyncio.sleep(store.processing_delay_ms / 1000.0)

        # Inventory check under async lock
        async with store.lock:
            # Check SKU match (supporting both PROD-FLASH-001 and legacy apex-phone-1)
            target_sku = req.sku or req.product_id
            if target_sku not in (store.sku, "apex-phone-1"):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"SKU {target_sku} not found")

            # Check if channel is locked by PulseGuard safety guardrails
            if (req.channel in store.locked_channels or "all" in store.locked_channels):
                store.oversell_attempts += 1
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "error": "Inventory locked on this marketplace channel",
                        "channel": req.channel,
                        "sku": store.sku,
                        "reason": "PulseGuard safety stock lock engaged to prevent overselling penalty"
                    }
                )

            # Check stock availability
            if store.available_stock < req.quantity:
                store.oversell_attempts += 1
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error": "Out of Stock",
                        "sku": store.sku,
                        "requested": req.quantity,
                        "available": store.available_stock,
                        "oversell_prevented": True
                    }
                )

            # Deduct stock
            store.available_stock -= req.quantity
            store.sold_stock += req.quantity
            store.successful_checkouts += 1
            remaining = store.available_stock

        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        order_id = f"ord-{uuid.uuid4().hex[:8]}"

        return CheckoutResponse(
            success=True,
            order_id=order_id,
            sku=store.sku,
            product_id=store.sku,
            quantity=req.quantity,
            channel=req.channel,
            remaining_available_stock=remaining,
            latency_ms=duration_ms,
            instance_id=store.instance_id,
            message=f"Order {order_id} confirmed via {req.channel.upper()}."
        )

    finally:
        store.current_active_requests -= 1
        store.concurrency_semaphore.release()

@app.post("/mock-marketplace/lock-stock", response_model=InventoryLockResponse, tags=["Guardrails"])
@app.post("/api/inventory/lock", response_model=InventoryLockResponse, tags=["Guardrails"])
async def lock_marketplace_inventory(req: InventoryLockRequest):
    """
    Called autonomously by PulseGuard agent or MCP skill to lock buffer stock.
    Fully enforces idempotency via 'idempotency_key' and returns the exact schema defined in
    '.agents/skills/telemetry-inventory-guard/SKILL.md'.
    """
    idemp_key = req.idempotency_key or str(uuid.uuid4())
    units = req.safety_stock_lock_units or req.lock_quantity or 20
    channels = req.channels or ([req.channel] if req.channel else ["amazon", "flipkart"])

    res = await store.lock_stock(
        quantity=units,
        channels=channels,
        idempotency_key=idemp_key,
        reason=req.reason or "Flash-sale surge guardrail"
    )
    return InventoryLockResponse(**res)

@app.post("/mock-marketplace/unlock-stock", tags=["Guardrails"])
@app.post("/api/inventory/unlock", tags=["Guardrails"])
async def unlock_marketplace_inventory(req: Optional[InventoryUnlockRequest] = None):
    """Release locked inventory back to available stock."""
    units = req.unlock_units if req else None
    channels = req.channels if req else None
    return await store.unlock_stock(quantity=units, channels=channels)

@app.get("/api/inventory/status", response_model=InventoryStatus, tags=["Inventory & Telemetry"])
async def get_inventory_status():
    """Returns current live inventory numbers, concurrency state, error counters, and locked channels."""
    return store.get_status()

@app.post("/api/reset", tags=["Admin"])
async def reset_store():
    """Resets inventory and counters for a fresh demo run."""
    store.reset()
    return {"message": "Store state successfully reset to initial defaults", "status": store.get_status()}

@app.post("/api/config", tags=["Admin"])
async def update_config(req: ConfigUpdateRequest):
    """Dynamically tweak artificial processing latency and concurrency limit."""
    store.update_config(delay_ms=req.delay_ms, max_concurrency=req.max_concurrency)
    return {
        "message": "Configuration updated",
        "processing_delay_ms": store.processing_delay_ms,
        "max_concurrency": store.max_concurrency
    }

@app.post("/api/scale", tags=["Scaling"])
async def scale_instances(req: Dict[str, Any]):
    """Called by PulseGuard agent to adjust allocated instances & concurrency in real time."""
    target_instances = int(req.get("min_instances", req.get("recommended_min_instances", 1)))
    store.allocated_instances = target_instances
    store.max_concurrency = target_instances * 10
    store._semaphore = asyncio.Semaphore(store.max_concurrency)
    return {
        "status": "SCALED",
        "allocated_instances": store.allocated_instances,
        "max_concurrency": store.max_concurrency,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
