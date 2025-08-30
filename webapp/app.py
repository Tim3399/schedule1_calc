from flask import Flask, render_template, request, jsonify
import sys, os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../src")))
from functionality.calc_modifier import get_best_mix
from src.lookup.lookup import level_name_to_int, products
from functionality.logging.logging_config import setup_logging

logger = setup_logging()

app = Flask(__name__)

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        combination_size = int(request.form['combination_size'])
        product_name = request.form['product_name']
        max_level = request.form['level']

        try:
            combinations_data, best_modifier, best_profit = get_best_mix(combination_size, product_name, max_level)

            # Log best results to console (best_modifier is a CombinationResult)
            try:
                logger.info("Best modifier result: %s", best_modifier)
                logger.info("Best profit result: %s", best_profit)
            except Exception:
                # Fallback print if logging serialization fails
                print("Best modifier result:", best_modifier)
                print("Best profit result:", best_profit)

            return render_template(
                'index.html',
                best_modifier=best_modifier,
                best_profit=best_profit,
                combinations_data=combinations_data,
                level_name_to_int=level_name_to_int,
                products=products
            )
        except Exception as e:
            logger.exception("Error while calculating best mix")
            return render_template(
                'index.html',
                error=str(e),
                level_name_to_int=level_name_to_int,
                products=products
            )

    return render_template('index.html', level_name_to_int=level_name_to_int, products=products)


@app.route('/get_best_mix', methods=['POST'])
def get_best_mix_json():
    """AJAX JSON endpoint for the client script.

    Expects JSON body: { level, combination_size, product_name }
    Returns JSON with serialized best_modifier and best_profit or { error: message }.
    """
    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({'error': 'Missing JSON body'}), 400

        combination_size = int(data.get('combination_size'))
        product_name = data.get('product_name')
        max_level = data.get('level')

        combinations_data, best_modifier, best_profit = get_best_mix(combination_size, product_name, max_level)

        # helper to convert dataclass-like CombinationResult to JSON-serializable dict
        def _serialize(cr):
            try:
                return {
                    'sell_price': float(cr.sell_price),
                    'substance_cost': float(cr.substance_cost),
                    'modifier': float(cr.modifier),
                    'substances': cr.substances,
                    'effects': cr.effects
                }
            except Exception:
                # Fallback: convert attributes using getattr (defensive)
                return {
                    'sell_price': float(getattr(cr, 'sell_price', 0)),
                    'substance_cost': float(getattr(cr, 'substance_cost', 0)),
                    'modifier': float(getattr(cr, 'modifier', 0)),
                    'substances': getattr(cr, 'substances', []),
                    'effects': getattr(cr, 'effects', [])
                }

        response = {
            'best_modifier': _serialize(best_modifier),
            'best_profit': _serialize(best_profit)
        }

        return jsonify(response)
    except Exception as e:
        logger.exception('Error in /get_best_mix')
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)