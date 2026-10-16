/* カワラ版 — 画面を少しだけ便利にするスクリプト。
   JavaScript が無効でも、すべての機能はそのまま使えるようにしています
   （フォーム送信もリンク移動もサーバー側で完結するため）。 */
(function () {
  "use strict";

  /* ---- 1. ユーザーメニューの開閉 ---- */
  function setupUserMenu() {
    var toggle = document.querySelector("[data-usermenu-toggle]");
    var panel = document.querySelector("[data-usermenu-panel]");
    if (!toggle || !panel) return;

    function close() {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    }

    toggle.addEventListener("click", function (event) {
      event.stopPropagation();
      var willOpen = panel.hidden;
      panel.hidden = !willOpen;
      toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    document.addEventListener("click", function (event) {
      if (!panel.hidden && !panel.contains(event.target)) close();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") close();
    });
  }

  /* ---- 2. 文字数カウンター ---- */
  function setupCounters() {
    var fields = document.querySelectorAll("[data-counter-for]");
    Array.prototype.forEach.call(fields, function (output) {
      var input = document.getElementById(output.getAttribute("data-counter-for"));
      if (!input) return;
      var max = parseInt(output.getAttribute("data-max"), 10) || 0;

      function update() {
        var length = input.value.length;
        output.textContent = length + " / " + max + " 文字";
        output.classList.toggle("is-over", max > 0 && length > max);
      }

      input.addEventListener("input", update);
      update();
    });
  }

  /* ---- 3. 二重送信の防止 ---- */
  function setupSubmitGuard() {
    var forms = document.querySelectorAll("form[data-guard]");
    Array.prototype.forEach.call(forms, function (form) {
      form.addEventListener("submit", function () {
        var button = form.querySelector("[type=submit]");
        if (!button) return;
        // 送信中であることを見た目でも伝える
        window.setTimeout(function () {
          button.classList.add("is-submitting");
          button.setAttribute("aria-disabled", "true");
          if (button.dataset.submittingLabel) {
            button.textContent = button.dataset.submittingLabel;
          }
        }, 0);
      });
    });
  }

  /* ---- 4. 「>>3」ボタンで返信フォームに引用を入れる ---- */
  function setupReplyButtons() {
    var textarea = document.getElementById("reply-body");
    var hidden = document.getElementById("reply-to-number");
    var label = document.querySelector("[data-reply-label]");
    var buttons = document.querySelectorAll("[data-reply-to]");
    if (!textarea || buttons.length === 0) return;

    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        var number = button.getAttribute("data-reply-to");
        if (hidden) hidden.value = number;
        if (label) {
          label.textContent = ">>" + number + " への返信";
          label.hidden = false;
        }
        var anchor = ">>" + number + "\n";
        if (textarea.value.indexOf(anchor) !== 0) {
          textarea.value = anchor + textarea.value;
        }
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        var form = document.getElementById("reply-form");
        if (form) form.scrollIntoView({ block: "center" });
      });
    });
  }

  /* ---- 5. 削除など取り返しのつかない操作には確認を挟む ---- */
  function setupConfirm() {
    var forms = document.querySelectorAll("form[data-confirm]");
    Array.prototype.forEach.call(forms, function (form) {
      form.addEventListener("submit", function (event) {
        if (!window.confirm(form.getAttribute("data-confirm"))) {
          event.preventDefault();
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    setupUserMenu();
    setupCounters();
    setupSubmitGuard();
    setupReplyButtons();
    setupConfirm();
  });
})();
