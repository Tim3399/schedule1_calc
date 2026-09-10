document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("best-mix-form");
  const resultDiv = document.getElementById("result");

  function appendTextElement(parent, tagName, text) {
    const element = document.createElement(tagName);
    element.textContent = text;
    parent.appendChild(element);
  }

  function renderCombination(title, combination) {
    appendTextElement(resultDiv, "h2", title);
    appendTextElement(resultDiv, "p", `Effects: ${combination.effects.join(", ")}`);
    appendTextElement(resultDiv, "p", `Ingredients: ${combination.substances.join(", ")}`);
    appendTextElement(resultDiv, "p", `Modifier: ${combination.modifier.toFixed(2)}`);
    appendTextElement(resultDiv, "p", `Sell Price: ${combination.sell_price.toFixed(2)}$`);
    appendTextElement(resultDiv, "p", `Ingredient Cost: ${combination.substance_cost.toFixed(2)}$`);
    appendTextElement(
      resultDiv,
      "p",
      `Profit: ${(combination.sell_price - combination.substance_cost).toFixed(2)}$`,
    );
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    const level = document.getElementById("level").value;
    const combinationSize = document.getElementById("combination-size").value;
    const productName = document.getElementById("product-name").value;

    fetch("/get_best_mix", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        level: level,
        combination_size: combinationSize,
        product_name: productName,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        resultDiv.replaceChildren();
        if (data.error) {
          appendTextElement(resultDiv, "p", `Error: ${data.error}`);
        } else {
          renderCombination("Best Modifier Combination", data.best_modifier);
          renderCombination("Best Profit Combination", data.best_profit);
        }
      })
      .catch((error) => {
        resultDiv.replaceChildren();
        appendTextElement(resultDiv, "p", `Error: ${error.message}`);
      });
  });
});
