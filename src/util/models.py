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

@dataclass
class Product:
    name: str
    base_sell_price: Decimal
    buy_price: Decimal
    level: int
    effects: List[str] = None

@dataclass
class Substance:
    name: str
    price: Decimal 
    level: int
    resulting_effect: str
    side_effect_replacements: Dict[str, str]
