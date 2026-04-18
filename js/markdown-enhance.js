// 增强 Markdown 显示：为 pre>code 添加复制按钮，为行内 code 添加点击复制（并在页面显示反馈）
// 使用：在页面渲染完 markdown（marked.parse 完成并插入 DOM）之后加载本脚本或在 DOMContentLoaded 时运行。
// 如果你把 marked 的渲染放在 DOMContentLoaded 回调里，确保本脚本在渲染后调用或重新运行 initMarkdownEnhance()。

(function () {
  'use strict';

  var TOAST_TIMEOUT = 1500;

  function createCopyButton() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy-btn';
    btn.setAttribute('aria-label', '复制代码');
    btn.innerHTML = '<span class="copy-label">复制</span>';
    return btn;
  }

  function showToast(text) {
    var existing = document.querySelector('.copy-toast');
    if (existing) {
      existing.textContent = text;
      existing.classList.add('show');
      clearTimeout(existing._hideTimer);
      existing._hideTimer = setTimeout(function () { existing.classList.remove('show'); }, TOAST_TIMEOUT);
      return;
    }
    var t = document.createElement('div');
    t.className = 'copy-toast';
    t.textContent = text;
    document.body.appendChild(t);
    // 强制重绘以启用过渡
    requestAnimationFrame(function () { t.classList.add('show'); });
    t._hideTimer = setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 200);
    }, TOAST_TIMEOUT);
  }

  function copyTextToClipboard(text) {
    if (!text) return Promise.reject(new Error('empty'));
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) resolve();
        else reject(new Error('execCommand failed'));
      } catch (err) {
        document.body.removeChild(ta);
        reject(err);
      }
    });
  }

  function enhanceCodeBlocks(root) {
    root = root || document;
    var pres = root.querySelectorAll('pre');
    pres.forEach(function (pre) {
      // 只处理包含 code 的 pre
      var code = pre.querySelector('code');
      if (!code) return;

      // 防止重复处理
      if (pre.dataset.copyEnhanced === '1') return;
      pre.dataset.copyEnhanced = '1';

      // 确保 pre 是 position: relative (CSS 已设置), 如果没有就设置
      var style = window.getComputedStyle(pre);
      if (style.position === 'static') pre.style.position = 'relative';

      var btn = createCopyButton();
      pre.appendChild(btn);

      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        var text = code.innerText || code.textContent || '';
        copyTextToClipboard(text).then(function () {
          // 成功视觉反馈
          btn.classList.add('success');
          btn.querySelector('.copy-label').textContent = '已复制';
          setTimeout(function () {
            btn.classList.remove('success');
            btn.querySelector('.copy-label').textContent = '复制';
          }, 1400);
        }).catch(function () {
          showToast('复制失败，请手动复制。');
        });
      });
    });
  }

  function enhanceInlineCode(root) {
    root = root || document;
    var codes = root.querySelectorAll('code');
    codes.forEach(function (code) {
      // 跳过 code 在 pre 内的情况（行内 code 要单独处理）
      if (code.closest('pre')) return;

      // 防止重复绑定
      if (code.dataset.inlineCopy === '1') return;
      code.dataset.inlineCopy = '1';

      code.style.cursor = 'pointer';
      code.setAttribute('title', '点击复制');

      code.addEventListener('click', function (ev) {
        ev.preventDefault();
        var text = code.innerText || code.textContent || '';
        copyTextToClipboard(text).then(function () {
          showToast('已复制代码片段');
        }).catch(function () {
          showToast('复制失败，请手动复制。');
        });
      });
    });
  }

  // 对动态注入的代码块也进行增强（MutationObserver）
  function observeForNewMarkdown(rootSelector) {
    var root = (rootSelector && document.querySelector(rootSelector)) || document.body;
    var mo = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.type === 'childList' && m.addedNodes.length) {
          m.addedNodes.forEach(function (node) {
            if (!node || node.nodeType !== 1) return;
            // 如果整块 markdown 被插入，运行增强
            if (node.matches && node.matches('.markdown-content')) {
              enhanceCodeBlocks(node);
              enhanceInlineCode(node);
            } else {
              // 否则查找包含 pre 或 code 的子树
              if (node.querySelectorAll && node.querySelectorAll('pre, code').length) {
                enhanceCodeBlocks(node);
                enhanceInlineCode(node);
              }
            }
          });
        }
      });
    });
    mo.observe(root, { childList: true, subtree: true });
    return mo;
  }

  // 初始化方法，页面渲染后调用
  function initMarkdownEnhance(rootSelector) {
    var root = (rootSelector && document.querySelector(rootSelector)) || document;
    enhanceCodeBlocks(root);
    enhanceInlineCode(root);
    observeForNewMarkdown(rootSelector);
  }

  // 自动初始化：如果你的 markdown 是在 DOMContentLoaded 中生成（例如 marked.parse 在 DOMContentLoaded 回调），
  // 建议在渲染后再调用 initMarkdownEnhance('#markdown-content')。这里尝试在 DOMContentLoaded 后初始化，
  // 并且支持在脚本晚载入的情况再次立即运行。
  document.addEventListener('DOMContentLoaded', function () {
    // 默认作用域为 id=markdown-content 的容器（如果你的容器不同，传入正确的选择器）
    initMarkdownEnhance('#markdown-content');
  });

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // 已就绪则立即运行一次（防止脚本插入在 DOMContentLoaded 之后）
    setTimeout(function () { initMarkdownEnhance('#markdown-content'); }, 0);
  }

  // 导出到全局以便在渲染完成后由其它脚本手动调用（安全）
  window.initMarkdownEnhance = initMarkdownEnhance;

})();
