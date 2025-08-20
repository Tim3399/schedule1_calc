document.addEventListener("DOMContentLoaded", function() {
    const form = document.getElementById("best-mix-form");
    const resultDiv = document.getElementById("result");

    form.addEventListener("submit", function(event) {
        event.preventDefault();

        const level = document.getElementById("level").value;
        const combinationSize = document.getElementById("combination-size").value;
        const productName = document.getElementById("product-name").value;

        fetch("/get_best_mix", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                level: level,
                combination_size: combinationSize,
                product_name: productName
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                resultDiv.innerHTML = `<p>Error: ${data.error}</p>`;
            } else {
                resultDiv.innerHTML = `
                    <h3>Best Modifier Combination:</h3>
                    <p>Effects: ${data.best_modifier.effects.join(", ")}</p>
                    <p>Substances: ${data.best_modifier.substances.join(", ")}</p>
                    <p>Modifier: ${data.best_modifier.modifier.toFixed(2)}</p>
                    <p>Sell Price: ${data.best_modifier.sell_price.toFixed(2)}$</p>
                    <p>Substance Cost: ${data.best_modifier.substance_cost.toFixed(2)}$</p>
                    <p>Profit: ${(data.best_modifier.sell_price - data.best_modifier.substance_cost).toFixed(2)}$</p>
                `;
            }
        })
        .catch(error => {
            resultDiv.innerHTML = `<p>Error: ${error.message}</p>`;
        });
    });
});