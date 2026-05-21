// Content Script - 注入到网页，负责元素选择和图片提取

(function() {
  'use strict';

  let isPickMode = false;
  let pickStep = 'image'; // 'image' 或 'input'
  let hoverElement = null;
  let hoverOverlay = null;
  let selectedImageData = null; // 存储第一步选择的图片数据

  // 自动扫描模式状态
  let autoScanInterval = null;
  let autoScanEnabled = false;
  const scannedImageHashes = new Set();
  const AUTO_SCAN_INTERVAL = 2000;

  // 本地 OCR 引擎（由 background 注入 ort.min.js + webocr.js 后可用）
  let ocrEngine = null;
  let ocrReady = false;

  // 创建悬浮提示层
  function createHoverOverlay() {
    if (hoverOverlay) return hoverOverlay;

    const overlay = document.createElement('div');
    overlay.id = 'captcha-selector-overlay';
    overlay.style.cssText = `
      position: absolute;
      border: 3px solid #ff0000;
      background-color: rgba(255, 0, 0, 0.1);
      pointer-events: none;
      z-index: 999999;
      display: none;
    `;
    document.body.appendChild(overlay);
    hoverOverlay = overlay;
    return overlay;
  }

  // 创建顶部提示条
  function createHint() {
    let hint = document.getElementById('captcha-selector-hint');
    if (hint) return hint;

    hint = document.createElement('div');
    hint.id = 'captcha-selector-hint';
    hint.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 15px;
      text-align: center;
      z-index: 9999999;
      font-size: 16px;
      font-family: Arial, sans-serif;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(hint);
    return hint;
  }

  // 显示提示
  function showHint(message, duration = 0) {
    const hint = createHint();
    hint.textContent = message;
    hint.style.display = 'block';

    if (duration > 0) {
      setTimeout(() => {
        hint.style.display = 'none';
      }, duration);
    }
  }

  // 隐藏提示
  function hideHint() {
    const hint = document.getElementById('captcha-selector-hint');
    if (hint) hint.style.display = 'none';
  }

  // 更新悬浮高亮
  function updateHoverHighlight(element) {
    if (!element) {
      hoverOverlay.style.display = 'none';
      return;
    }

    const rect = element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    hoverOverlay.style.display = 'block';
    hoverOverlay.style.top = (rect.top + scrollTop) + 'px';
    hoverOverlay.style.left = (rect.left + scrollLeft) + 'px';
    hoverOverlay.style.width = rect.width + 'px';
    hoverOverlay.style.height = rect.height + 'px';
  }

  // 鼠标移动处理
  function handleMouseMove(e) {
    if (!isPickMode) return;

    // 忽略我们创建的overlay和hint
    if (e.target.id === 'captcha-selector-overlay' || 
        e.target.id === 'captcha-selector-hint') {
      return;
    }

    hoverElement = e.target;
    updateHoverHighlight(hoverElement);
  }

  // 点击处理
  function handleClick(e) {
    if (!isPickMode) return;

    e.preventDefault();
    e.stopPropagation();

    const element = hoverElement || e.target;
    
    // 忽略我们的元素
    if (element.id === 'captcha-selector-overlay' || 
        element.id === 'captcha-selector-hint') {
      return;
    }

    // 生成选择器
    const selector = new ElementSelector();
    const generatedSelector = selector.generate(element);

    if (!generatedSelector) {
      showHint('❌ 无法生成唯一选择器', 3000);
      return;
    }

    if (pickStep === 'single') {
      // 单图片模式：直接提取并发送
      handleSingleImagePick(element, generatedSelector);
    } else if (pickStep === 'image') {
      // 第一步：选择图片（配对模式）
      handleImagePick(element, generatedSelector);
    } else if (pickStep === 'input') {
      // 第二步：选择输入框
      handleInputPick(element, generatedSelector);
    }
  }

  // 处理图片选择（异步）
  async function handleImagePick(element, selector) {
    const tagName = element.tagName.toLowerCase();
    
    // 提取图片
    let imageData = null;
    try {
      if (tagName === 'img') {
        imageData = await Promise.resolve(extractFromImg(element));
      } else if (tagName === 'canvas') {
        imageData = element.toDataURL('image/png');
      } else {
        imageData = await Promise.resolve(extractViaCanvas(element));
      }

      console.log('图片提取完成:', imageData ? '成功' : '失败');

      if (imageData) {
        // 保存图片数据
        selectedImageData = {
          selector: selector,
          imageData: imageData,
          tagName: tagName,
          width: element.offsetWidth || element.naturalWidth,
          height: element.offsetHeight || element.naturalHeight
        };

        console.log('selectedImageData 已保存:', selectedImageData);

        // 高亮选中的图片
        element.style.outline = '3px solid #00ff00';
        element.setAttribute('data-captcha-selected', 'image');

        // 切换到选择输入框模式
        pickStep = 'input';
        showHint('✓ 图片已选择，现在请点击验证码输入框');
      } else {
        showHint('❌ 无法提取图片数据', 3000);
        stopPickMode();
      }
    } catch (error) {
      console.error('提取图片失败:', error);
      showHint('❌ 提取图片失败: ' + error.message, 3000);
      stopPickMode();
    }
  }

  // 处理单图片提取（异步）
  async function handleSingleImagePick(element, selector) {
    const tagName = element.tagName.toLowerCase();
    
    // 提取图片
    let imageData = null;
    try {
      if (tagName === 'img') {
        imageData = await Promise.resolve(extractFromImg(element));
      } else if (tagName === 'canvas') {
        imageData = element.toDataURL('image/png');
      } else {
        imageData = await Promise.resolve(extractViaCanvas(element));
      }

      console.log('单图片提取完成:', imageData ? '成功' : '失败');

      if (imageData) {
        // 停止选择模式
        stopPickMode();

        const data = {
          selector: selector,
          imageData: imageData,
          tagName: tagName,
          width: element.offsetWidth || element.naturalWidth,
          height: element.offsetHeight || element.naturalHeight,
          url: window.location.href,
          timestamp: Date.now()
        };

        // 先保存到 storage，然后发送通知消息
        chrome.storage.local.set({ 
          lastResult: data,
          needUpdate: 'image' 
        }, () => {
          console.log('单图片数据已保存到 storage');
          
          // 发送通知消息到 side panel
          chrome.runtime.sendMessage({
            action: 'imageExtracted',
            data: data
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.log('发送消息错误（这是正常的）:', chrome.runtime.lastError.message);
            }
          });
        });

        showHint('✓ 图片提取成功，请查看插件窗口', 2000);
      } else {
        showHint('❌ 无法提取图片数据', 3000);
        stopPickMode();
      }
    } catch (error) {
      console.error('提取图片失败:', error);
      showHint('❌ 提取图片失败: ' + error.message, 3000);
      stopPickMode();
    }
  }

  // 处理输入框选择
  function handleInputPick(element, selector) {
    const tagName = element.tagName.toLowerCase();

    // 验证是否是输入框
    if (tagName !== 'input' && tagName !== 'textarea') {
      showHint('⚠️ 请选择输入框元素 (input/textarea)', 3000);
      return;
    }

    // ⚠️ 关键：先保存 selectedImageData，因为 stopPickMode 会清空它
    const savedImageData = selectedImageData;
    console.log('保存的图片数据:', savedImageData);

    // 高亮选中的输入框
    element.style.outline = '3px solid #0066ff';
    element.setAttribute('data-captcha-selected', 'input');

    // 停止选择模式（会清空 selectedImageData）
    stopPickMode();

    const data = {
      image: savedImageData,  // 使用之前保存的数据
      input: {
        selector: selector,
        tagName: tagName,
        placeholder: element.placeholder || '',
        name: element.name || ''
      },
      url: window.location.href,
      host: window.location.host,
      timestamp: Date.now()
    };

    console.log('准备保存的完整配对数据:', data);

    // 先保存到 storage，然后发送通知消息
    chrome.storage.local.set({ 
      lastPair: data,
      needUpdate: 'pair'
    }, () => {
      console.log('配对数据已保存到 storage:', data);
      
      // 发送通知消息到 side panel
      chrome.runtime.sendMessage({
        action: 'pairSelected',
        data: data
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('发送消息错误（这是正常的）:', chrome.runtime.lastError.message);
        } else {
          console.log('消息发送成功，响应:', response);
        }
      });
    });

    showHint('✓ 配对完成，请查看插件窗口', 2000);

    // 清理
    setTimeout(() => {
      document.querySelectorAll('[data-captcha-selected]').forEach(el => {
        el.style.outline = '';
        el.removeAttribute('data-captcha-selected');
      });
    }, 3000);
  }

  // 从 img 元素提取
  function extractFromImg(imgElement) {
    const src = imgElement.src;

    // 如果是 base64，直接返回
    if (src && src.startsWith('data:image/')) {
      return src;
    }

    // 否则通过 canvas 转换
    return extractViaCanvas(imgElement);
  }

  // 通过 Canvas 转换
  function extractViaCanvas(element) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    let width, height;

    if (element.tagName.toLowerCase() === 'img') {
      width = element.naturalWidth || element.width;
      height = element.naturalHeight || element.height;
    } else {
      width = element.offsetWidth;
      height = element.offsetHeight;
    }

    if (!width || !height) {
      throw new Error('无法获取元素尺寸');
    }

    canvas.width = width;
    canvas.height = height;

    // 绘制元素到 canvas
    if (element.tagName.toLowerCase() === 'img') {
      ctx.drawImage(element, 0, 0, width, height);
    } else {
      // 对于其他元素，尝试使用 html2canvas 的简化版本
      // 这里只是基础实现，复杂背景需要更多处理
      const bgImage = window.getComputedStyle(element).backgroundImage;
      if (bgImage && bgImage !== 'none') {
        // 提取 URL
        const match = bgImage.match(/url\(["']?(.+?)["']?\)/);
        if (match && match[1]) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = match[1];
          
          return new Promise((resolve) => {
            img.onload = () => {
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => {
              throw new Error('背景图片加载失败（可能存在跨域问题）');
            };
          });
        }
      }
    }

    return canvas.toDataURL('image/png');
  }

  // 开始选择模式
  function startPickMode(mode = 'pair') {
    if (isPickMode) return;

    isPickMode = true;
    pickStep = mode === 'pair' ? 'image' : 'single';
    selectedImageData = null;
    
    createHoverOverlay();
    
    if (mode === 'pair') {
      showHint('🖱️ 步骤1/2: 请点击验证码图片（按 ESC 取消）');
    } else {
      showHint('🖱️ 请点击要选择的图片元素（按 ESC 取消）');
    }

    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleEscape, true);

    // 改变光标
    document.body.style.cursor = 'crosshair';
  }

  // 停止选择模式
  function stopPickMode() {
    isPickMode = false;
    pickStep = 'image';
    selectedImageData = null;
    hideHint();

    if (hoverOverlay) {
      hoverOverlay.style.display = 'none';
    }

    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleEscape, true);

    document.body.style.cursor = '';
    
    // 清理选中标记
    document.querySelectorAll('[data-captcha-selected]').forEach(el => {
      el.style.outline = '';
      el.removeAttribute('data-captcha-selected');
    });
  }

  // ESC 键取消
  function handleEscape(e) {
    if (e.key === 'Escape') {
      stopPickMode();
      showHint('已取消选择', 1000);
    }
  }

  // 高亮元素
  function highlightElements(imageSelector, inputSelector) {
    try {
      // 清除之前的高亮
      document.querySelectorAll('[data-captcha-highlight]').forEach(el => {
        el.style.outline = '';
        el.removeAttribute('data-captcha-highlight');
      });

      // 高亮图片
      const imgElement = document.querySelector(imageSelector);
      if (imgElement) {
        imgElement.style.outline = '4px solid #00ff00';
        imgElement.setAttribute('data-captcha-highlight', 'image');
        imgElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // 高亮输入框
      const inputElement = document.querySelector(inputSelector);
      if (inputElement) {
        inputElement.style.outline = '4px solid #0066ff';
        inputElement.setAttribute('data-captcha-highlight', 'input');
      }

      if (imgElement && inputElement) {
        showHint('✓ 元素已高亮显示（绿色=图片，蓝色=输入框）', 3000);
        
        // 3秒后自动清除高亮
        setTimeout(() => {
          document.querySelectorAll('[data-captcha-highlight]').forEach(el => {
            el.style.outline = '';
            el.removeAttribute('data-captcha-highlight');
          });
        }, 3000);
        
        return true;
      } else {
        showHint('❌ 未找到对应的元素', 3000);
        return false;
      }
    } catch (error) {
      console.error('高亮失败:', error);
      showHint('❌ 高亮失败: ' + error.message, 3000);
      return false;
    }
  }

  // ==================== 自动扫描模式 ====================

  function hashImageBase64(base64) {
    return base64.substring(Math.max(0, base64.length - 128));
  }

  function findInputForImage(imgElement) {
    const parent = imgElement.parentElement;
    if (!parent) return null;

    // 策略1: 兄弟元素中有 input
    const siblingInput = parent.querySelector('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
    if (siblingInput) return siblingInput;

    // 策略2: 父级的兄弟元素中有 input
    const grandParent = parent.parentElement;
    if (grandParent) {
      const inputs = grandParent.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
      for (const inp of inputs) {
        if (inp.offsetParent !== null) return inp;
      }
    }

    // 策略3: 整个父级容器中找最近的 input
    const container = imgElement.closest('form, .form-group, .input-group, .captcha, .verification, [class*="captcha"], [class*="code"], [id*="captcha"], [id*="code"]');
    if (container) {
      const inp = container.querySelector('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
      if (inp) return inp;
    }

    return null;
  }

  async function autoScanCaptcha() {
    if (!autoScanEnabled) return;

    const imgs = document.querySelectorAll('img');
    const foundPairs = [];

    for (const img of imgs) {
      // 跳过不可见图片
      if (img.offsetParent === null && img.naturalWidth === 0) continue;
      // 跳过太小的图（不太可能是验证码）
      if (img.naturalWidth < 40 || img.naturalHeight < 20) continue;

      const input = findInputForImage(img);
      if (!input) continue;

      // 生成选择器
      const selector = new ElementSelector();
      const imgSelector = selector.generate(img);
      const inputSelector = selector.generate(input);

      if (!imgSelector || !inputSelector) continue;

      // 提取图片数据
      let imageData = null;
      try {
        const tagName = img.tagName.toLowerCase();
        if (tagName === 'img') {
          imageData = extractFromImg(img);
        } else if (tagName === 'canvas') {
          imageData = img.toDataURL('image/png');
        }
        if (!imageData) continue;
      } catch (e) {
        continue;
      }

      // 去重：同一张图不重复
      const hash = hashImageBase64(imageData);
      if (scannedImageHashes.has(hash)) continue;
      scannedImageHashes.add(hash);

      // 限制 Set 大小防止内存泄漏
      if (scannedImageHashes.size > 200) {
        const entries = Array.from(scannedImageHashes);
        scannedImageHashes.clear();
        for (const e of entries.slice(-50)) scannedImageHashes.add(e);
      }

      foundPairs.push({
        image: {
          selector: imgSelector,
          imageData: imageData,
          tagName: 'img',
          width: img.naturalWidth || img.offsetWidth,
          height: img.naturalHeight || img.offsetHeight
        },
        input: {
          selector: inputSelector,
          tagName: input.tagName.toLowerCase(),
          placeholder: input.placeholder || '',
          name: input.name || ''
        },
        url: window.location.href,
        host: window.location.host,
        timestamp: Date.now(),
        autoDetected: true
      });
    }

    // 发送检测到的配对给 sidepanel
    for (const pair of foundPairs) {
      chrome.runtime.sendMessage({
        action: 'autoPairDetected',
        data: pair
      }).catch(() => {});
    }

    return foundPairs;
  }

  // ==================== 本地 OCR + 全自动识别 ====================

  async function initContentOCR() {
    if (ocrReady && ocrEngine && ocrEngine.session) return true;
    if (!window.WebOCR || !window.ort) {
      console.warn('AutoOCR: WebOCR/ort 异常缺失，请刷新页面');
      return false;
    }

    try {
      ocrEngine = new WebOCR();
      await ocrEngine.loadModel();
      ocrReady = true;
      console.log('AutoOCR: 模型加载完成，开始自动识别');
      return true;
    } catch (e) {
      console.error('AutoOCR: 模型加载失败', e);
      return false;
    }
  }

  async function autoScanAndRecognize() {
    if (!autoScanEnabled) return;
    if (!ocrReady) {
      const ok = await initContentOCR();
      if (!ok) return;
    }

    const pairs = await autoScanCaptcha();
    if (!pairs || pairs.length === 0) return;

    for (const pair of pairs) {
      // 去重
      const hash = hashImageBase64(pair.image.imageData);
      if (scannedImageHashes.has(hash)) continue;
      scannedImageHashes.add(hash);

      try {
        const imgElement = await base64ToImageLocal(pair.image.imageData);
        const result = await ocrEngine.classify(imgElement);

        if (result && result.length > 0) {
          console.log('AutoOCR: 识别成功', result);
          const fillResult = fillCaptchaInput(pair.input.selector, result);

          // 通知侧边栏（如果打开的话）
          chrome.runtime.sendMessage({
            action: 'autoOcrResult',
            data: {
              pair,
              result,
              fillSuccess: fillResult.success,
              timestamp: Date.now()
            }
          }).catch(() => {});
        }
      } catch (e) {
        console.error('AutoOCR: 识别失败', e);
      }
    }
  }

  function base64ToImageLocal(base64) {
    return new Promise((resolve, reject) => {
      const img = document.createElement('img');
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(new Error('图片加载失败: ' + err));
      img.src = base64;
    });
  }

  function startAutoScan(intervalMs) {
    if (autoScanEnabled) return;
    autoScanEnabled = true;
    scannedImageHashes.clear();

    const interval = intervalMs || AUTO_SCAN_INTERVAL;

    // 先尝试初始化 OCR，然后执行一次扫描
    initContentOCR().then(() => {
      autoScanAndRecognize();

      // 定时轮询：扫描 + 识别 + 填充
      autoScanInterval = setInterval(() => {
        autoScanAndRecognize();
      }, interval);
    });
  }

  function stopAutoScan() {
    autoScanEnabled = false;
    if (autoScanInterval) {
      clearInterval(autoScanInterval);
      autoScanInterval = null;
    }
    scannedImageHashes.clear();
  }

  // Content script 加载时：依赖已通过 manifest 注入，直接初始化
  function checkAndAutoInit() {
    console.log('AutoOCR: 依赖已就绪，等待 initAutoMode 消息启动');
  }
  checkAndAutoInit();

  function fillCaptchaInput(selector, value) {
    const input = document.querySelector(selector);
    if (!input) return { success: false, message: '未找到输入框' };

    input.value = value;
    input.focus();

    // 触发多种事件确保网站能检测到
    const events = ['input', 'change', 'blur', 'focus', 'keydown', 'keyup'];
    for (const evtName of events) {
      try {
        input.dispatchEvent(new Event(evtName, { bubbles: true }));
      } catch (e) {}
    }

    // React 兼容: 触发原生 input setter
    try {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      nativeInputValueSetter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {}

    return { success: true, message: '填充成功' };
  }

  // 监听来自 sidepanel 的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startPickMode') {
      startPickMode('single');
      sendResponse({ success: true });
    } else if (request.action === 'startPairPickMode') {
      startPickMode('pair');
      sendResponse({ success: true });
    } else if (request.action === 'stopPickMode') {
      stopPickMode();
      sendResponse({ success: true });
    } else if (request.action === 'highlightElements') {
      const result = highlightElements(request.data.imageSelector, request.data.inputSelector);
      sendResponse({ success: result });
    } else if (request.action === 'initAutoMode') {
      // 由 background 在页面加载时发送（已注入 ort.min.js + webocr.js）
      initContentOCR().then((ok) => {
        if (ok) {
          startAutoScan(request.data?.interval || AUTO_SCAN_INTERVAL);
        }
      });
      sendResponse({ success: true });
    } else if (request.action === 'startAutoMode') {
      startAutoScan(request.data?.interval || AUTO_SCAN_INTERVAL);
      sendResponse({ success: true });
    } else if (request.action === 'stopAutoMode') {
      stopAutoScan();
      sendResponse({ success: true });
    } else if (request.action === 'autoScanOnce') {
      autoScanCaptcha().then(count => {
        sendResponse({ success: true, count });
      });
      return true;
    } else if (request.action === 'autoFillCaptcha') {
      const result = fillCaptchaInput(request.data.selector, request.data.value);
      sendResponse(result);
    }
    return true;
  });

  console.log('验证码选择器 Content Script 已加载');
})();

