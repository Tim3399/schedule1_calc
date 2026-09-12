from decimal import Decimal
from dataclasses import dataclass
from typing import List, Dict


@dataclass
class CombinationResult:
    sell_price: Decimal
    substance_cost: Decimal
    modifier: float
    substances: List[str]
    effects: List[str]


@dataclass
class Effect:
    name: str
    modificator: float
    display_name: str | None = None
    color: str | None = None
    description: str | None = None


@dataclass
class Product:
    name: str
    base_sell_price: Decimal
    buy_price: Decimal | None
    level: int | None
    effects: List[str] = None
    quality: int = -1
    display_name: str | None = None


@dataclass
class Substance:
    name: str
    price: Decimal
    level: int
    resulting_effect: str
    side_effect_replacements: Dict[str, str]
    display_name: str | None = None
