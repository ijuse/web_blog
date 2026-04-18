// 增强 Markdown 显示：为 pre>code 添加复制按钮，为行内 code 添加点击复制（并在页面显示反馈）
// 新增：[TOC] 标签解析，生成文章目录（PC：左侧固定跟随滚动并高亮当前节；移动端：顶部折叠列表）
// 使用：在页面渲染完 markdown（marked.parse 完成并插入 DOM）之后加载本脚本或在 DOMContentLoaded 时运行。
// 如果你把 marked 的渲染放在 DOMContentLoaded 回调里，确保本脚本在渲染后调用或重新运行 initMarkdownEnhance()。

(function () {
  'use strict';

  var TOAST_TIMEOUT = 1500;
  var TOC_ACTIVE_OFFSET = 120; // 用于高亮判断的视窗顶部偏移（可按页面 header 高度调整）

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
    if (!text) return Promise.reject(new 错误('empty'));
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

  // 为 headings 生成 id（如果没有）
  function slugify(text) {
    return text.toString().trim()
      .toLowerCase()
      .replace(/[^\n\w\-\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/\-+/g, '-');
  }

  // 生成嵌套的 ul/li 列表，基于 headings 的层级
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

      // 找到合适的父容器
      if (level > stack[stack.length - 1].level) {
        // deeper -> create new ul under last li
        var lastLi = stack[stack.length - 1].container.lastElementChild;
        if (!lastLi) {
          // no previous, append to current
          stack[stack.length - 1].container.appendChild(li);
        } else {
          var newUl = document.createElement('ul');
          lastLi.appendChild(newUl);
          newUl.appendChild(li);
          stack.push({level: level, container: newUl});
        }
      } else {
        // ascend to correct level
        while (level <= stack[stack.length - 1].level && stack.length > 1) stack.pop();
        stack[stack.length - 1].container.appendChild(li);
        stack.push({level: level, container: stack[stack.length - 1].container});
      }
    });

    return rootUl;
  }

  // 生成并插入 TOC（仅当文中存在 [TOC] 标记）
  function generateTOC(rootSelector) {
    var root = (rootSelector && document.querySelector(rootSelector)) || document;
    var container = root.querySelector('#markdown-content');
    if (!container) return;

    // 找到 [TOC] 标记（markdown 渲染后通常是 <p>[TOC]</p> 或者包含周围空白）
    var tocPlaceholders = Array.prototype.slice.call(container.querySelectorAll('p')).filter(function (p) {
      return /\[\s*toc\s*\]/i.test(p.textContent.trim());
    });
    if (!tocPlaceholders.length) return;

    // 收集 headings（只在当前 markdown 容器内）
    var headings = Array.prototype.slice.call(container.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    if (!headings.length) {
      // 如果没有 headings，移除占位符并返回
      tocPlaceholders.forEach(function (p) { p.remove(); });
      return;
    }

    // 给 headings 生成 id（去重）
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

    // 构建嵌套列表
    var nested = buildNestedList(headings);

    // 构建桌面侧边栏 nav
    var nav = document.createElement('nav');
    nav.className = 'toc-nav';
    nav.setAttribute('aria-label', '文章目录');
    var navInner = document.createElement('div');
    navInner.className = 'toc-inner';
    navInner.appendChild(nested.cloneNode(true));
    nav.appendChild(navInner);

    // 构建移动端折叠版
    var mobile = document.createElement('div');
    mobile.className = 'toc-mobile';
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'toc-toggle';
    toggle.textContent = '文章目录';
    var mobileListWrap = document.createElement('div');
    mobileListWrap.className = 'toc-mobile-list';
    mobileListWrap.appendChild(nested.cloneNode(true));
    mobile.appendChild(toggle);
    mobile.appendChild(mobileListWrap);

    // 将 nav 与 mobile 插入到每个占位符位置：占位符被移除，替换为一个 wrapper（便于多个占位符）
    tocPlaceholders.forEach(function (p) {
      var wrapper = document.createElement('div');
      wrapper.className = 'toc-wrapper';
      // 插入移动端（放在文章顶部更合适，保留在占位处以便用户控制位置）
      wrapper.appendChild(mobile);
      // 插入桌面 nav 放到 body 中固定位置，这里先保留副本在占位
      wrapper.appendChild(nav.cloneNode(true));
      p.parentNode.replaceChild(wrapper, p);
    });

    // 为 desktop nav 插入到 body（只要一个）并且 body 添加 has-toc 类用于布局调整
    var existingGlobalNav = document.querySelector('body > .toc-nav-global');
    if (!existingGlobalNav) {
      var globalNav = nav.cloneNode(true);
      globalNav.classList.add('toc-nav-global');
      document.body.appendChild(globalNav);
      document.body.classList.add('has-toc');
    }

    // 绑定交互（平滑滚动 / 折叠）
    bindTOCInteractions(root);
  }

  function bindTOCInteractions(rootSelector) {
    var root = (rootSelector && document.querySelector(rootSelector)) || document;
    var container = root.querySelector('#markdown-content');
    if (!container) return;

    // 统一收集所有 toc-link（桌面与移动）
    var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc-link'));

    // 点击平滑滚动
    tocLinks.forEach(function (a) {
      a.addEventListener('click', function (ev) {
        // allow normal behavior for middle clicks
        if (ev.defaultPrevented || ev.button !== 0) return;
        ev.preventDefault();
        var id = a.getAttribute('href').slice(1);
        var target = document.getElementById(id);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // 更新 hash（不触发跳转）
        history.replaceState && history.replaceState(null, '', '#' + id);
        // 在移动端折叠目录
        var mobileList = document.querySelector('.toc-mobile-list');
        if (mobileList && getComputedStyle(mobileList).display !== 'none') {
          mobileList.style.display = 'none';
        }
      });
    });

    // 移动端折叠开关
    var toggles = Array.prototype.slice.call(document.querySelectorAll('.toc-toggle'));
    toggles.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var wrap = btn.parentNode;
        var list = wrap.querySelector('.toc-mobile-list');
        if (!list) return;
        if (list.style.display === 'block') list.style.display = 'none';
        else list.style.display = 'block';
      });
    });

    // 监听滚动高亮（仅在桌面有效）
    var headingSelector = '#markdown-content h1,#markdown-content h2,#markdown-content h3,#markdown-content h4,#markdown-content h5,#markdown-content h6';
    var headings = Array.prototype.slice.call(document.querySelectorAll(headingSelector));
    if (!headings.length) return;

    var tocLinksAll = Array.prototype.slice.call(document.querySelectorAll('.toc-link'));
    var linkMap = {};
    tocLinksAll.forEach(function (a) {
      var href = a.getAttribute('href');
      if (href && href.indexOf('#') === 0) {
        linkMap[href.slice(1)] = a;
      }
    });

    var ticking = false;
    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          updateActiveHeading(headings, linkMap);
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    // 也在 resize 时重新计算一次
    window.addEventListener('resize', function () { updateActiveHeading(headings, linkMap); });

    // 初始运行一次
    updateActiveHeading(headings, linkMap);
  }

  function updateActiveHeading(headings, linkMap) {
    var activeId = null;
    for (var i = 0; i < headings.length; i++) {
      var rect = headings[i].getBoundingClientRect();
      if (rect.top - TOC_ACTIVE_OFFSET <= 0) {
        activeId = headings[i].id;
      }
    }
    // 如果没有任何 heading 到达偏移，则选择第一个
    if (!activeId && headings.length) activeId = headings[0].id;

    // 清理所有已激活状态
    var allLinks = document.querySelectorAll('.toc-link');
    allLinks.forEach(function (ln) { ln.classList.remove('active'); });

    if (activeId && linkMap[activeId]) {
      linkMap[activeId].classList.add('active');
      // 如果全局侧边栏存在，确保可见（滚动侧边栏使得 active 可见）
      var globalNav = document.querySelector('.toc-nav-global');
      if (globalNav) {
        var activeEl = linkMap[activeId];
        // 找到最近的可滚动容器
        var scrollContainer = globalNav.querySelector('.toc-inner') || globalNav;
        if (activeEl && scrollContainer) {
          var aRect = activeEl.getBoundingClientRect();
          var cRect = scrollContainer.getBoundingClientRect();
          if (aRect.top < cRect.top) scrollContainer.scrollTop -= (cRect.top - aRect.top + 8);
          else if (aRect.bottom > cRect.bottom) scrollContainer.scrollTop += (aRect.bottom - cRect.bottom + 8);
        }
      }
    }
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
              // 先处理 TOC，再处理其它增强
              generateTOC('#' + (node.querySelector('#markdown-content') ? 'markdown-content' : 'markdown-content'));
              enhanceCodeBlocks(node);
              enhanceInlineCode(node);
            } else {
              // 否则查找包含 pre 或 code 的子树
              if (node.querySelectorAll && node.querySelectorAll('pre, code').length) {
                enhanceCodeBlocks(node);
                enhanceInlineCode(node);
              }
              // 也尝试生成 TOC（如果有占位符）
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

  // 初始化方法，页面渲染后调用
  function initMarkdownEnhance(rootSelector) {
    var root = (rootSelector && document.querySelector(rootSelector)) || document;
    // 先处理 TOC（因为 TOC 依赖于 headings），再增强代码块
    generateTOC(rootSelector || '#markdown-content');
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
