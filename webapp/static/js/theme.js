/*
 * Colour theme switch. The initial value is applied by a small inline script in the document
 * head so the first paint already uses the stored choice; this file only owns the control.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "schedule1-theme";
  const group = document.getElementById("theme-switch");
  if (!group) {
    return;
  }
  const options = Array.prototype.slice.call(group.querySelectorAll("[data-theme-value]"));
  if (options.length === 0) {
    return;
  }

  function storedChoice() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === "light" || value === "dark" ? value : "system";
    } catch (error) {
      return "system";
    }
  }

  function remember(choice) {
    try {
      if (choice === "system") {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, choice);
      }
    } catch (error) {
      /* A blocked storage must not break the switch for the current page. */
    }
  }

  function apply(choice, { persist = true, focus = false } = {}) {
    document.documentElement.dataset.theme = choice;
    if (persist) {
      remember(choice);
    }
    for (const option of options) {
      const selected = option.dataset.themeValue === choice;
      option.setAttribute("aria-checked", String(selected));
      option.tabIndex = selected ? 0 : -1;
      if (selected && focus) {
        option.focus();
      }
    }
  }

  for (const [index, option] of options.entries()) {
    option.addEventListener("click", function () {
      apply(option.dataset.themeValue);
    });
    option.addEventListener("keydown", function (event) {
      let next;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        next = (index + 1) % options.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        next = (index - 1 + options.length) % options.length;
      } else if (event.key === "Home") {
        next = 0;
      } else if (event.key === "End") {
        next = options.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      apply(options[next].dataset.themeValue, { focus: true });
    });
  }

  apply(storedChoice(), { persist: false });
})();
