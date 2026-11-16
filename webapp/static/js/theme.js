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

  const darkQuery =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;

  function storedChoice() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === "light" || value === "dark" ? value : null;
    } catch (error) {
      return null;
    }
  }

  function systemChoice() {
    return darkQuery && darkQuery.matches ? "dark" : "light";
  }

  function remember(choice) {
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch (error) {
      /* A blocked storage must not break the switch for the current page. */
    }
  }

  // Without a stored choice the attribute stays "system" so the CSS follows the operating
  // system; the control then only marks the option that matches the current appearance.
  function apply(choice, { persist = true, focus = false, follow = false } = {}) {
    document.documentElement.dataset.theme = follow ? "system" : choice;
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

  function applyInitial() {
    const stored = storedChoice();
    if (stored) {
      apply(stored, { persist: false });
    } else {
      apply(systemChoice(), { persist: false, follow: true });
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

  applyInitial();
  if (darkQuery && typeof darkQuery.addEventListener === "function") {
    darkQuery.addEventListener("change", function () {
      if (!storedChoice()) {
        applyInitial();
      }
    });
  }
})();
