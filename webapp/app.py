from flask import Flask, render_template, request, jsonify
import sys, os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../src")))
from functionality.calc_modifier import get_best_mix
from src.lookup.lookup import level_name_to_int, products

app = Flask(__name__)

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        combination_size = int(request.form['combination_size'])
        product_name = request.form['product_name']
        max_level = request.form['level']

        try:
            best_modifier, best_profit, combinations_data = get_best_mix(combination_size, product_name, max_level)
            return render_template(
                'index.html',
                best_modifier=best_modifier,
                best_profit=best_profit,
                combinations_data=combinations_data,
                level_name_to_int=level_name_to_int,
                products=products
            )
        except Exception as e:
            return render_template(
                'index.html',
                error=str(e),
                level_name_to_int=level_name_to_int,
                products=products
            )

    return render_template('index.html', level_name_to_int=level_name_to_int, products=products)

if __name__ == '__main__':
    app.run(debug=True)