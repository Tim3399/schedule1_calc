document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("best-mix-form");
  const resultDiv = document.getElementById("result");
  const submitButton = form.querySelector('button[type="submit"]');

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

  function renderError(message) {
    const element = document.createElement("p");
    element.className = "error";
    element.setAttribute("role", "alert");
    element.textContent = `Error: ${message}`;
    resultDiv.replaceChildren(element);
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (submitButton.disabled) {
      return;
    }

    const level = document.getElementById("level").value;
    const combinationSize = document.getElementById("combination-size").value;
    const productName = document.getElementById("product-name").value;
    const searchMode = document.getElementById("search-mode").value;

    resultDiv.replaceChildren();
    appendTextElement(resultDiv, "p", "Searching for the best mix…");
    submitButton.disabled = true;

    try {
      const response = await fetch("/get_best_mix", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          level: level,
          combination_size: combinationSize,
          product_name: productName,
          search_mode: searchMode,
        }),
      });
      const data = await response.json();
      const exactResult =
        searchMode === "exact" &&
        data.search?.mode === searchMode &&
        data.search.status === "optimal" &&
        data.search.optimality_proven === true;
      const fastResult =
        searchMode === "fast" &&
        data.search?.mode === searchMode &&
        data.search.status === "approximate" &&
        data.search.optimality_proven === false;
      const completeResult =
        response.ok &&
        !data.error &&
        (exactResult || fastResult) &&
        data.best_modifier &&
        data.best_profit;

      if (!completeResult) {
        renderError(data.error || "The search did not return a complete result.");
        return;
      }

      resultDiv.replaceChildren();
      appendTextElement(
        resultDiv,
        "p",
        exactResult ? "Optimality proven" : "Approximate result — optimality not guaranteed",
      );
      if (fastResult) {
        renderCombination("Highest modifier found", data.best_modifier);
        renderCombination("Highest profit found", data.best_profit);
      } else {
        renderCombination("Best Modifier Combination", data.best_modifier);
        renderCombination("Best Profit Combination", data.best_profit);
      }
    } catch (error) {
      renderError(error.message);
    } finally {
      submitButton.disabled = false;
    }
  });
});
