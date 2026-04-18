// 全站图片增强：自动插入 caption、超大图点击放大、对动态插入的图片生效
(function () {
  'use strict';

  // 配置：选择图片所在的根节点（如果你的博客内容在特定容器，改成更具体的选择器）
  var ROOT_SELECTOR = 'body';

  // 判断一张图片是否需要“放大”功能：当图片自然宽度 > 容器宽度 或 自然高度 > 视口高度时
  function isOversized(img, container) {
    try {
      var natW = img.naturalWidth || 0;
      var natH = img.naturalHeight || 0;
      var containerW = (container && container.clientWidth) || window.innerWidth;
      var viewportH = window.innerHeight;
      return (natW > containerW) || (natH > viewportH);
    } catch (e) {
      return false;
    }
  }

  // 创建放大覆盖层并显示指定 src
  function showOverlay(src, alt) {
    // 如果已有 overlay，移除旧的
    var existing = document.querySelector('.img-zoom-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.className = 'img-zoom-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', alt || 'Image zoom');
    overlay.tabIndex = -1;

    var img = document.createElement('img');
    img.src = src;
    if (alt) img.alt = alt;

    overlay.appendChild(img);
    document.body.appendChild(overlay);

    // 强制触发重绘后显示（加 show 用过渡）
    requestAnimationFrame(function () {
      overlay.classList.add('show');
      document.body.classList.add('img-zoomed');
    });

    function cleanup() {
      overlay.classList.remove('show');
      document.body.classList.remove('img-zoomed');
      // 等过渡后移除节点
      setTimeout(function () {
        overlay.remove();
      }, 220);
      document.removeEventListener('keydown', onKey);
    }

    overlay.addEventListener('click', cleanup, { once: true });

    function onKey(e) {
      if (e.key === 'Escape') cleanup();
    }
    document.addEventListener('keydown', onKey);
  }

  // 处理单��图片：包装、插入 caption、注册点击事件等
  function enhanceImage(img) {
    if (!img || img.dataset.enhanced === '1') return;
    img.dataset.enhanced = '1';

    // 如果父节点已经是 .image-wrap（可能模板已包装），直接使用；否则包装
    var parent = img.parentElement;
    var wrapper;
    if (parent && parent.classList && parent.classList.contains('image-wrap')) {
      wrapper = parent;
    } else {
      wrapper = document.createElement('span');
      wrapper.className = 'image-wrap';
      // 保留原来的 display context by replacing node
      parent.replaceChild(wrapper, img);
      wrapper.appendChild(img);
    }

    // 插入 caption（基于 alt）
    var alt = img.getAttribute('alt') || '';
    if (alt.trim()) {
      // 如果已有 .img-caption，跳过
      var next = wrapper.nextElementSibling;
      if (!(next && next.classList && next.classList.contains('img-caption'))) {
        var cap = document.createElement('i');
        cap.className = 'img-caption';
        cap.textContent = alt;
        wrapper.parentNode.insertBefore(cap, wrapper.nextSibling);
      }
    }

    // 检查图片是否已加载，若没加载则在 load 后检查是否超出
    function checkAndBind() {
      var container = wrapper.parentElement;
      var oversized = isOversized(img, container);
      if (oversized) {
        wrapper.classList.add('zoomable');
        // 点击图片打开 overlay（居中放大显示）
        img.addEventListener('click', function (ev) {
          ev.preventDefault();
          // 使用图片的 src（支持 srcset 的话使用 currentSrc）
          var src = img.currentSrc || img.src;
          showOverlay(src, alt);
        });
      } else {
        // 非超出图片仍然可以有轻微点击动效（可选），此处不绑定放大全屏
      }
    }

    if (img.complete && img.naturalWidth !== 0) {
      checkAndBind();
    } else {
      img.addEventListener('load', checkAndBind, { once: true });
      // 也在错误加载时标记已增强，避免永久等待
      img.addEventListener('error', function () { /* noop */ }, { once: true });
    }
  }

  // 批量处理根元素下的图片
  function enhanceImages(root) {
    var imgs = (root || document).querySelectorAll('img');
    imgs.forEach(enhanceImage);
  }

  // 对动态加入的图片使用 MutationObserver（比如 SPA 或部分脚本晚加载时）
  function observeNewImages(root) {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.type === 'childList') {
          m.addedNodes.forEach(function (node) {
            if (!node) return;
            if (node.nodeType === 1) {
              if (node.tagName === 'IMG') {
                enhanceImage(node);
              } else {
                // 如果包含图片的容器被插入，处理其中的图片
                var imgs = node.querySelectorAll && node.querySelectorAll('img');
                if (imgs && imgs.length) {
                  imgs.forEach(enhanceImage);
                }
              }
            }
          });
        }
      });
    });

    observer.observe((document.querySelector(ROOT_SELECTOR) || document.body), {
      childList: true,
      subtree: true
    });
    return observer;
  }

  // 初始化：DOM 完成后运行
  document.addEventListener('DOMContentLoaded', function () {
    var root = document.querySelector(ROOT_SELECTOR) || document.body;
    enhanceImages(root);
    observeNewImages(root);
  });

  // 如果 script 在 DOM 已就绪后加载，立即运行一次
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    var rootNow = document.querySelector(ROOT_SELECTOR) || document.body;
    enhanceImages(rootNow);
    observeNewImages(rootNow);
  }
})();
