from pydantic import BaseModel, Field, model_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid

class Product(BaseModel):
    id: str
    sku: str
    name: str
    price: float
    description: str
    total_stock: int
    available_stock: int
    locked_stock: int
    sold_stock: int

class CheckoutRequest(BaseModel):
    sku: Optional[str] = Field(default="PROD-FLASH-001", description="SKU of the product")
    product_id: Optional[str] = Field(default="PROD-FLASH-001", description="Legacy ID alias for SKU")
    quantity: int = Field(default=1, ge=1, le=5, description="Number of items to purchase")
    channel: str = Field(default="d2c", description="Sales channel: d2c, amazon, flipkart, myntra, ondc")
    customer_id: Optional[str] = Field(default="cust-anon", description="Identifier for client or session")

    @model_validator(mode="before")
    def unify_sku(cls, values: Any) -> Any:
        if isinstance(values, dict):
            # Unify sku and product_id
            sku = values.get("sku") or values.get("product_id") or "PROD-FLASH-001"
            values["sku"] = sku
            values["product_id"] = sku
        return values

class CheckoutResponse(BaseModel):
    success: bool
    order_id: Optional[str] = None
    sku: str
    product_id: str
    quantity: int
    channel: str
    remaining_available_stock: int
    latency_ms: float
    instance_id: str
    message: str

class InventoryLockRequest(BaseModel):
    idempotency_key: Optional[str] = Field(default=None, description="UUIDv4 for strict idempotent retry handling")
    sku: Optional[str] = Field(default="PROD-FLASH-001", description="SKU identifier")
    product_id: Optional[str] = Field(default="PROD-FLASH-001", description="Alias for SKU")
    safety_stock_lock_units: Optional[int] = Field(default=None, ge=1, description="Quantity to lock as safety buffer")
    lock_quantity: Optional[int] = Field(default=None, ge=1, description="Alias for safety_stock_lock_units")
    channels: Optional[List[str]] = Field(default=None, description="Channels to lock: amazon, flipkart, myntra, ondc, all")
    channel: Optional[str] = Field(default=None, description="Single channel alias")
    reason: Optional[str] = Field(default="PulseGuard proactive surge guardrail engaged")
    timestamp: Optional[str] = Field(default=None)

    @model_validator(mode="before")
    def standardize_fields(cls, values: Any) -> Any:
        if isinstance(values, dict):
            # Unify SKU
            sku = values.get("sku") or values.get("product_id") or "PROD-FLASH-001"
            values["sku"] = sku
            values["product_id"] = sku
            
            # Unify lock units
            units = values.get("safety_stock_lock_units") or values.get("lock_quantity") or 20
            values["safety_stock_lock_units"] = units
            values["lock_quantity"] = units

            # Unify channels list
            if "channels" in values and isinstance(values["channels"], list):
                pass
            elif "channel" in values and values["channel"]:
                values["channels"] = [values["channel"]]
            else:
                values["channels"] = ["amazon", "flipkart"]

            if not values.get("idempotency_key"):
                values["idempotency_key"] = str(uuid.uuid4())
                
        return values

class InventoryLockResponse(BaseModel):
    status: str = Field(default="LOCKED", description="LOCKED or ALREADY_LOCKED")
    sku: str
    locked_units: int
    available_units: int
    channels_locked: List[str]
    lock_timestamp: str
    idempotency_key: str
    total_locked_stock: int
    message: Optional[str] = None

class InventoryUnlockRequest(BaseModel):
    idempotency_key: Optional[str] = None
    sku: Optional[str] = "PROD-FLASH-001"
    unlock_units: Optional[int] = None
    channels: Optional[List[str]] = None

class InventoryStatus(BaseModel):
    sku: str
    product_id: str
    name: str
    total_stock: int
    available_stock: int
    locked_stock: int
    sold_stock: int
    oversell_attempts: int
    total_checkouts_attempted: int
    successful_checkouts: int
    failed_checkouts_503: int
    active_concurrency: int
    max_concurrency_limit: int
    channels_locked: List[str]
    instance_id: str
    timestamp: str

class ConfigUpdateRequest(BaseModel):
    delay_ms: Optional[int] = Field(None, ge=0, le=5000)
    max_concurrency: Optional[int] = Field(None, ge=1, le=100)
