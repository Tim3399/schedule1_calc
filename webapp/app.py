import os
import re
import sys

from flask import Flask, jsonify, render_template, request
from werkzeug.exceptions import BadRequest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../src")))
from functionality.calc_modifier import CombinationSearchLimitExceeded, get_best_mix
from functionality.logging.logging_config import setup_logging
from src.lookup.lookup import level_name_to_int, products

logger = setup_logging()

app = Flask(__name__)


class RequestValidationError(ValueError):
    """Raised when calculator request fields are missing or invalid."""


_PRODUCT_NAMES = {product.name for product in products}
_LEVEL_VALUES = set(level_name_to_int.values())
_DIGITS = re.compile(r"[0-9]+")
_INTERNAL_ERROR = "An internal error occurred while calculating the best mix."


def _normalize_name(value):
    return value.strip().lower().replace(" ", "_")


def _validate_request_data(data):
    if not isinstance(data, dict):
        raise RequestValidationError("Request data must be an object.")

    missing = [
        field for field in ("combination_size", "product_name", "level") if field not in data
    ]
    if missing:
        raise RequestValidationError(f"Missing required field: {missing[0]}.")

    raw_size = data["combination_size"]
    if isinstance(raw_size, bool):
        raise RequestValidationError("Combination size must be a positive integer.")
    if isinstance(raw_size, int):
        combination_size = raw_size
    elif isinstance(raw_size, str) and _DIGITS.fullmatch(raw_size):
        try:
            combination_size = int(raw_size)
        except ValueError as error:
            raise RequestValidationError("Combination size must be a positive integer.") from error
    else:
        raise RequestValidationError("Combination size must be a positive integer.")
    if combination_size <= 0:
        raise RequestValidationError("Combination size must be a positive integer.")

    raw_product = data["product_name"]
    if not isinstance(raw_product, str) or not raw_product.strip():
        raise RequestValidationError("Product name must be a non-empty string.")
    product_name = _normalize_name(raw_product)
    if product_name not in _PRODUCT_NAMES:
        raise RequestValidationError(f"Unknown product: {raw_product.strip()}.")

    raw_level = data["level"]
    if isinstance(raw_level, bool):
        raise RequestValidationError("Level must be a known level name or integer value.")
    if isinstance(raw_level, int):
        if raw_level not in _LEVEL_VALUES:
            raise RequestValidationError(f"Unknown level: {raw_level}.")
        max_level = raw_level
    elif isinstance(raw_level, str) and raw_level.strip():
        max_level = _normalize_name(raw_level)
        if max_level not in level_name_to_int:
            raise RequestValidationError(f"Unknown level: {raw_level.strip()}.")
    else:
        raise RequestValidationError("Level must be a known level name or integer value.")

    return combination_size, product_name, max_level


def _serialize_combination(result):
    if result is None:
        raise RuntimeError("Calculation returned no winning result.")
    return {
        "sell_price": float(result.sell_price),
        "substance_cost": float(result.substance_cost),
        "modifier": float(result.modifier),
        "substances": list(result.substances),
        "effects": list(result.effects),
    }


def _template_context(**values):
    return {"level_name_to_int": level_name_to_int, "products": products, **values}


@app.route("/", methods=["GET", "POST"])
def index():
    if request.method == "GET":
        return render_template("index.html", **_template_context())

    try:
        combination_size, product_name, max_level = _validate_request_data(request.form.to_dict())
        combinations_data, best_modifier, best_profit = get_best_mix(
            combination_size, product_name, max_level
        )
        _serialize_combination(best_modifier)
        _serialize_combination(best_profit)

        logger.info("Best modifier result: %s", best_modifier)
        logger.info("Best profit result: %s", best_profit)
        return render_template(
            "index.html",
            **_template_context(
                best_modifier=best_modifier,
                best_profit=best_profit,
                combinations_data=combinations_data,
            ),
        )
    except (RequestValidationError, CombinationSearchLimitExceeded) as error:
        return (
            render_template("index.html", **_template_context(error=str(error))),
            400,
        )
    except Exception:
        logger.exception("Error while calculating best mix")
        return (
            render_template("index.html", **_template_context(error=_INTERNAL_ERROR)),
            500,
        )


@app.route("/get_best_mix", methods=["POST"])
def get_best_mix_json():
    """Calculate the best mix from a validated JSON request."""
    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json."}), 415

    try:
        try:
            data = request.get_json()
        except BadRequest as error:
            raise RequestValidationError("Malformed JSON body.") from error

        combination_size, product_name, max_level = _validate_request_data(data)
        _combinations_data, best_modifier, best_profit = get_best_mix(
            combination_size, product_name, max_level
        )
        return jsonify(
            {
                "best_modifier": _serialize_combination(best_modifier),
                "best_profit": _serialize_combination(best_profit),
            }
        )
    except (RequestValidationError, CombinationSearchLimitExceeded) as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        logger.exception("Error in /get_best_mix")
        return jsonify({"error": _INTERNAL_ERROR}), 500


if __name__ == "__main__":
    app.run(debug=True)
