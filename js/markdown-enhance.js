// 增强 Markdown 显示：为 pre>code 添加复制按钮，为行内 code 添加点击复制（并在页面显示反馈）
// 新增：[TOC] 标签解析（单一面板，响应式切换）
// 新增：页面右下固定返回头部按钮 + 二维码生成功能
// 使用：在页面渲染完 markdown（marked.parse 完成并插入 DOM）之后加载本脚本或在 DOMContentLoaded 时运行。

(function () {
  'use strict';

  var TOAST_TIMEOUT = 1500;
  var TOC_ACTIVE_OFFSET = 120; // 用于高亮判断的视窗顶部偏移

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
      var code = pre.querySelector('code');
      if (!code) return;
      if (pre.dataset.copyEnhanced === '1') return;
      pre.dataset.copyEnhanced = '1';
      var style = window.getComputedStyle(pre);
      if (style.position === 'static') pre.style.position = 'relative';
      var btn = createCopyButton();
      pre.appendChild(btn);
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        var text = code.innerText || code.textContent || '';
        copyTextToClipboard(text).then(function () {
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
      if (code.closest('pre')) return;
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

  function slugify(text) {
    return text.toString().trim()
      .toLowerCase()
      .replace(/[^\w\-\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/\-+/g, '-');
  }

  function buildNestedList(headings) {
    var rootUl = document.createElement('ul');
    var stack = [{level: 0, container: rootUl}];

    headings.forEach(function (h) {
      var level = parseInt(h.tagName.substring(1), 10);
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      a.className = 'toc-link';
      li.appendChild(a);

      if (level > stack[stack.length - 1].level) {
        var lastLi = stack[stack.length - 1].container.lastElementChild;
        if (!lastLi) {
          stack[stack.length - 1].container.appendChild(li);
        } else {
          var newUl = document.createElement('ul');
          lastLi.appendChild(newUl);
          newUl.appendChild(li);
          stack.push({level: level, container: newUl});
        }
      } else {
        while (level <= stack[stack.length - 1].level && stack.length > 1) stack.pop();
        stack[stack.length - 1].container.appendChild(li);
        stack.push({level: level, container: stack[stack.length - 1].container});
      }
    });

    return rootUl;
  }

  // 生成统一目录面板
  function generateTOC(rootSelector) {
    var root = null;
    if (rootSelector) {
      if (typeof rootSelector === 'string') root = document.querySelector(rootSelector);
      else if (rootSelector.nodeType === 1) root = rootSelector;
    }
    root = root || document;

    var container = (root.id === 'markdown-content') ? root : root.querySelector('#markdown-content');
    if (!container) return;

    var tocPlaceholders = Array.prototype.slice.call(container.querySelectorAll('p')).filter(function (p) {
      var txt = (p.textContent || '').trim();
      txt = txt.replace(/\u00A0/g, ' ').replace(/[\u2000-\u200F]/g, '').trim();
      return /\[\s*toc\s*\]/i.test(txt);
    });
    if (!tocPlaceholders.length) return;

    var headings = Array.prototype.slice.call(container.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    if (!headings.length) {
      tocPlaceholders.forEach(function (p) { p.remove(); });
      return;
    }

    var used = {};
    headings.forEach(function (h) {
      if (!h.id) {
        var s = slugify(h.textContent || h.innerText || 'heading');
        var base = s || 'heading';
        var uniq = base;
        var i = 1;
        while (used[uniq]) { uniq = base + '-' + i++; }
        used[uniq] = true;
        h.id = uniq;
      }
    });

    var nestedList = buildNestedList(headings);

    // 创建统一面板
    var panel = document.createElement('div');
    panel.className = 'toc-panel';

    var header = document.createElement('div');
    header.className = 'toc-header';
    var titleSpan = document.createElement('span');
    titleSpan.className = 'toc-title';
    titleSpan.textContent = '文章目录';
    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'toc-toggle-btn';
    toggleBtn.setAttribute('aria-label', '展开/折叠目录');
    toggleBtn.textContent = '☰';
    header.appendChild(titleSpan);
    header.appendChild(toggleBtn);

    var listWrapper = document.createElement('div');
    listWrapper.className = 'toc-list-wrapper';
    listWrapper.appendChild(nestedList);

    panel.appendChild(header);
    panel.appendChild(listWrapper);

    var firstPlaceholder = tocPlaceholders[0];
    firstPlaceholder.parentNode.replaceChild(panel, firstPlaceholder);
    for (var i = 1; i < tocPlaceholders.length; i++) {
      tocPlaceholders[i].remove();
    }

    document.body.classList.add('has-toc');

    bindTOCInteractions(panel);
  }

  function bindTOCInteractions(panel) {
    if (!panel) return;

    var toggleBtn = panel.querySelector('.toc-toggle-btn');
    var listWrapper = panel.querySelector('.toc-list-wrapper');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        panel.classList.toggle('expanded');
        var expanded = panel.classList.contains('expanded');
        toggleBtn.setAttribute('aria-expanded', expanded);
      });
      panel.querySelector('.toc-header').addEventListener('click', function (e) {
        if (e.target === toggleBtn) return;
        if (window.innerWidth <= 900) {
          panel.classList.toggle('expanded');
        }
      });
    }

    var links = panel.querySelectorAll('.toc-link');
    links.forEach(function (a) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        var id = a.getAttribute('href').slice(1);
        var target = document.getElementById(id);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          history.replaceState && history.replaceState(null, '', '#' + id);
          if (window.innerWidth <= 900) {
            panel.classList.remove('expanded');
          }
        }
      });
    });

    var headings = Array.prototype.slice.call(document.querySelectorAll('#markdown-content h1,#markdown-content h2,#markdown-content h3,#markdown-content h4,#markdown-content h5,#markdown-content h6'));
    var linkMap = {};
    links.forEach(function (a) {
      var href = a.getAttribute('href');
      if (href && href.indexOf('#') === 0) linkMap[href.slice(1)] = a;
    });

    var ticking = false;
    function updateActive() {
      var activeId = null;
      for (var i = 0; i < headings.length; i++) {
        var rect = headings[i].getBoundingClientRect();
        if (rect.top - TOC_ACTIVE_OFFSET <= 0) activeId = headings[i].id;
      }
      if (!activeId && headings.length) activeId = headings[0].id;

      links.forEach(function (ln) { ln.classList.remove('active'); });
      if (activeId && linkMap[activeId]) {
        linkMap[activeId].classList.add('active');
        if (window.innerWidth > 900) {
          var activeEl = linkMap[activeId];
          var scrollContainer = panel;
          var aRect = activeEl.getBoundingClientRect();
          var cRect = scrollContainer.getBoundingClientRect();
          if (aRect.top < cRect.top) scrollContainer.scrollTop -= (cRect.top - aRect.top + 8);
          else if (aRect.bottom > cRect.bottom) scrollContainer.scrollTop += (aRect.bottom - cRect.bottom + 8);
        }
      }
    }

    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          updateActive();
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', updateActive);
    updateActive();
  }

  // QR / Back-to-top UI
  function createBackToTopAndQR() {
    if (document.querySelector('.back-to-top-wrapper')) return;
    var wrap = document.createElement('div');
    wrap.className = 'back-to-top-wrapper';
    wrap.innerHTML = '\n      <button class="back-to-top" aria-label="返回顶部">▲</button>\n      <button class="qr-trigger" title="生成二维码">◷</button>\n    ';
    document.body.appendChild(wrap);

    var backBtn = wrap.querySelector('.back-to-top');
    var qrBtn = wrap.querySelector('.qr-trigger');

    function updateVisibility() {
      if (window.scrollY > 200) wrap.classList.add('visible');
      else wrap.classList.remove('visible');
    }
    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });

    backBtn.addEventListener('click', function (e) {
      if (e.shiftKey) {
        showPageQR();
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    qrBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      showPageQR();
    });
  }

  var _qrOverlay = null;
  function showPageQR() {
    if (_qrOverlay) return;
    var overlay = document.createElement('div');
    overlay.className = 'qr-overlay';
    overlay.tabIndex = -1;
    var box = document.createElement('div');
    box.className = 'qr-box';
    var title = document.createElement('div');
    title.className = 'qr-title';
    title.textContent = '扫描访问此页';
    var img = document.createElement('img');
    var src = 'https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=' + encodeURIComponent(location.href);
    img.src = src;
    img.alt = 'QR code';
    img.className = 'qr-image';
    box.appendChild(title);
    box.appendChild(img);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    _qrOverlay = overlay;
    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay) hidePageQR();
    });
    setTimeout(function () {
      document.addEventListener('click', onDocClickForQR);
    }, 0);
    window.addEventListener('keydown', onKeyDownForQR);
  }

  function onDocClickForQR(e) {
    if (!_qrOverlay) return;
    var box = _qrOverlay.querySelector('.qr-box');
    if (!box) return hidePageQR();
    if (!box.contains(e.target)) hidePageQR();
  }

  function onKeyDownForQR(e) {
    if (e.key === 'Escape' || e.key === 'Esc') hidePageQR();
  }

  function hidePageQR() {
    if (!_qrOverlay) return;
    try { document.removeEventListener('click', onDocClickForQR); } catch (e) {}
    try { window.removeEventListener('keydown', onKeyDownForQR); } catch (e) {}
    _qrOverlay.remove();
    _qrOverlay = null;
  }

  function observeForNewMarkdown(rootSelector) {
    var root = null;
    if (rootSelector) {
      if (typeof rootSelector === 'string') root = document.querySelector(rootSelector);
      else if (rootSelector.nodeType === 1) root = rootSelector;
    }
    root = root || document.body;

    var mo = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.type === 'childList' && m.addedNodes.length) {
          m.addedNodes.forEach(function (node) {
            if (!node || node.nodeType !== 1) return;
            if (node.matches && node.matches('.markdown-content')) {
              generateTOC(node);
              enhanceCodeBlocks(node);
              enhanceInlineCode(node);
            } else {
              if (node.querySelectorAll && node.querySelectorAll('pre, code').length) {
                enhanceCodeBlocks(node);
                enhanceInlineCode(node);
              }
              if (node.querySelectorAll && node.querySelectorAll('p').length) {
                generateTOC('#markdown-content');
              }
            }
          });
        }
      });
    });
    mo.observe(root, { childList: true, subtree: true });
    return mo;
  }

  function initMarkdownEnhance(rootSelector) {
    var root = null;
    if (rootSelector) {
      if (typeof rootSelector === 'string') root = document.querySelector(rootSelector);
      else if (rootSelector.nodeType === 1) root = rootSelector;
    }
    root = root || document;
    generateTOC(root || '#markdown-content');
    enhanceCodeBlocks(root);
    enhanceInlineCode(root);
    observeForNewMarkdown(root);
    createBackToTopAndQR();
  }

  document.addEventListener('DOMContentLoaded', function () {
    initMarkdownEnhance('#markdown-content');
  });

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(function () { initMarkdownEnhance('#markdown-content'); }, 0);
  }

  window.initMarkdownEnhance = initMarkdownEnhance;

})();