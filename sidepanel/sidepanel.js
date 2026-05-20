// SidePanel 主逻辑

class SidePanelController {
  constructor() {
    this.currentData = null;
    this.currentPair = null;
    this.webocr = null; // 🆕 添加 WebOCR 实例
    this.autoMode = false;
    this.processedImageHashes = new Set();
    this.autoPairCount = 0;
    this.init();
  }

  init() {
    // 绑定事件
    document.getElementById('pickPairBtn').addEventListener('click', () => this.startPairPicking());
    document.getElementById('pickImageBtn').addEventListener('click', () => this.startPicking());
    document.getElementById('clearBtn').addEventListener('click', () => this.clearResults());
    document.getElementById('highlightBtn').addEventListener('click', () => this.highlightElements());
    document.getElementById('copySelectorBtn').addEventListener('click', () => this.copySelector());
    document.getElementById('downloadBtn').addEventListener('click', () => this.downloadImage());
    document.getElementById('copyImageSelectorBtn').addEventListener('click', () => this.copyImageSelector());
    document.getElementById('copyInputSelectorBtn').addEventListener('click', () => this.copyInputSelector());

    // 🆕 添加识别相关的事件绑定
    document.getElementById('recognizeBtn').addEventListener('click', () => this.recognizeCaptcha());
    document.getElementById('copyOcrResultBtn').addEventListener('click', () => this.copyOcrResult());
    document.getElementById('autoFillBtn').addEventListener('click', () => this.autoFillCaptcha());

    // 🤖 自动模式事件绑定
    document.getElementById('autoModeCheckbox').addEventListener('change', () => this.toggleAutoMode());
    document.getElementById('autoScanOnceBtn').addEventListener('click', () => this.autoScanOnce());
    document.getElementById('clearAutoLogBtn').addEventListener('click', () => this.clearAutoLog());

    // 监听来自 content script 的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('SidePanel 收到消息:', request.action, request);
      
      if (request.action === 'imageExtracted') {
        console.log('处理图片提取数据:', request.data);
        this.displayResults(request.data);
        sendResponse({ success: true });
      } else if (request.action === 'pairSelected') {
        console.log('处理配对数据:', request.data);
        this.displayPairResults(request.data);
        sendResponse({ success: true });
      } else if (request.action === 'autoPairDetected') {
        console.log('🤖 自动检测到配对:', request.data);
        this.handleAutoPair(request.data);
        sendResponse({ success: true });
      } else if (request.action === 'autoOcrResult') {
        console.log('✅ 自动OCR结果:', request.data);
        this.handleAutoOcrResult(request.data);
        sendResponse({ success: true });
      }
      return true;
    });

    // 监听 storage 变化（这是关键！）
    chrome.storage.onChanged.addListener((changes, namespace) => {
      console.log('Storage 发生变化:', changes, 'namespace:', namespace);
      
      if (namespace === 'local' && changes.needUpdate) {
        const updateType = changes.needUpdate.newValue;
        console.log('检测到需要更新:', updateType);
        
        if (updateType === 'pair') {
          // 读取配对数据
          chrome.storage.local.get(['lastPair'], (result) => {
            if (result.lastPair) {
              console.log('从 storage 读取配对数据:', result.lastPair);
              this.displayPairResults(result.lastPair);
              // 清除更新标记
              chrome.storage.local.remove('needUpdate');
            }
          });
        } else if (updateType === 'image') {
          // 读取单图片数据
          chrome.storage.local.get(['lastResult'], (result) => {
            if (result.lastResult) {
              console.log('从 storage 读取图片数据:', result.lastResult);
              this.displayResults(result.lastResult);
              // 清除更新标记
              chrome.storage.local.remove('needUpdate');
            }
          });
        }
      }
    });

    // 🆕 初始化 WebOCR
    this.initWebOCR();

    // 加载保存的结果（如果有）
    this.loadSavedResults();

    // 从 storage 同步自动模式开关状态
    this.loadAutoModeState();
  }

  /**
   * 开始配对选择（图片+输入框）
   */
  async startPairPicking() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab) {
        this.showStatus('无法获取当前标签页', 'error');
        return;
      }

      if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
        this.showStatus('无法在浏览器内部页面使用此功能', 'error');
        return;
      }

      await this.injectContentScript(tab.id);

      chrome.tabs.sendMessage(tab.id, { action: 'startPairPickMode' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('发送消息失败:', chrome.runtime.lastError);
          this.showStatus('启动失败，请刷新页面后重试', 'error');
        } else {
          this.showStatus('✓ 步骤1: 请点击验证码图片', 'success');
        }
      });

    } catch (error) {
      console.error('启动配对选择失败:', error);
      this.showStatus('启动失败: ' + error.message, 'error');
    }
  }

  /**
   * 开始选择元素（仅图片）
   */
  async startPicking() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab) {
        this.showStatus('无法获取当前标签页', 'error');
        return;
      }

      if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
        this.showStatus('无法在浏览器内部页面使用此功能', 'error');
        return;
      }

      await this.injectContentScript(tab.id);

      chrome.tabs.sendMessage(tab.id, { action: 'startPickMode' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('发送消息失败:', chrome.runtime.lastError);
          this.showStatus('启动失败，请刷新页面后重试', 'error');
        } else {
          this.showStatus('✓ 请在页面上选择图片元素', 'success');
        }
      });

    } catch (error) {
      console.error('启动选择模式失败:', error);
      this.showStatus('启动失败: ' + error.message, 'error');
    }
  }

  /**
   * 注入 content script
   */
  async injectContentScript(tabId, injectOCR = false) {
    try {
      // selector.js 和 content.js 已通过 manifest content_scripts 自动注入
      // 这里只需要按需注入 OCR 引擎
      if (injectOCR) {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['lib/ort.min.js']
        });
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['lib/webocr.js']
        });
      }

      console.log('Content script 注入成功');
    } catch (error) {
      console.error('注入失败:', error);
      throw new Error('脚本注入失败，请刷新页面后重试');
    }
  }

  /**
   * 显示配对结果
   */
  displayPairResults(data) {
    console.log('开始显示配对结果, 数据:', data);
    
    try {
      // 数据验证
      if (!data) {
        throw new Error('配对数据为空');
      }

      if (!data.image || !data.image.selector) {
        console.error('图片数据无效:', data.image);
        this.showStatus('❌ 图片数据无效，请重新选择', 'error', 5000);
        return;
      }

      if (!data.input || !data.input.selector) {
        console.error('输入框数据无效:', data.input);
        this.showStatus('❌ 输入框数据无效，请重新选择', 'error', 5000);
        return;
      }

      this.currentPair = data;

      // 保存到 storage
      chrome.storage.local.set({ lastPair: data }, () => {
        console.log('配对数据已保存到 storage');
      });

      // 隐藏单图片结果区域
      document.getElementById('resultSection').classList.add('hidden');

      // 显示配对结果区域
      const pairSection = document.getElementById('pairSection');
      console.log('pairSection 元素:', pairSection);
      pairSection.classList.remove('hidden');
      console.log('已移除 hidden 类, classList:', pairSection.classList);

      // 填充图片选择器
      const imageSelector = data.image.selector;
      console.log('图片选择器:', imageSelector);
      document.getElementById('pairImageSelector').textContent = imageSelector;

      // 填充输入框选择器
      const inputSelector = data.input.selector;
      console.log('输入框选择器:', inputSelector);
      document.getElementById('pairInputSelector').textContent = inputSelector;

      // 填充配对信息
      document.getElementById('pairUrlText').textContent = this.truncateUrl(data.url);
      document.getElementById('pairHostText').textContent = data.host;
      document.getElementById('pairInputName').textContent = data.input.name || data.input.placeholder || '(无)';

      // 显示图片预览
      const previewImg = document.getElementById('pairPreviewImage');
      previewImg.src = data.image.imageData;
      previewImg.alt = '验证码图片';
      console.log('图片预览已设置');

      // 启用高亮按钮
      document.getElementById('highlightBtn').disabled = false;

      // 显示成功状态
      this.showStatus('✓ 验证码配对成功！', 'success', 3000);

      // 滚动到结果区域
      pairSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      
      console.log('配对结果显示完成！');
    } catch (error) {
      console.error('显示配对结果时出错:', error);
      this.showStatus('显示结果失败: ' + error.message, 'error', 5000);
    }
  }

  /**
   * 显示单图片提取结果
   */
  displayResults(data) {
    this.currentData = data;

    // 保存到 storage
    chrome.storage.local.set({ lastResult: data });

    // 隐藏配对结果区域
    document.getElementById('pairSection').classList.add('hidden');

    // 显示结果区域
    const resultSection = document.getElementById('resultSection');
    resultSection.classList.remove('hidden');

    // 填充选择器
    document.getElementById('selectorText').textContent = data.selector;

    // 填充元素信息
    document.getElementById('urlText').textContent = this.truncateUrl(data.url);
    document.getElementById('tagText').textContent = `<${data.tagName}>`;
    document.getElementById('sizeText').textContent = `${data.width} × ${data.height} px`;

    // 显示图片
    const previewImg = document.getElementById('previewImage');
    previewImg.src = data.imageData;
    previewImg.alt = '提取的图片';

    // 禁用高亮按钮
    document.getElementById('highlightBtn').disabled = true;

    // 显示成功状态
    this.showStatus('✓ 图片提取成功！', 'success', 3000);

    // 滚动到结果区域
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * 加载保存的结果
   */
  async loadSavedResults() {
    chrome.storage.local.get(['lastResult', 'lastPair'], (result) => {
      // 优先加载配对结果
      if (result.lastPair) {
        const data = result.lastPair;
        this.displayPairResults(data);
        this.showStatus('已加载上次的配对结果', 'success', 2000);
      } else if (result.lastResult) {
        // 显示单图片结果
        const data = result.lastResult;
        this.displayResults(data);
        this.showStatus('已加载上次的结果', 'success', 2000);
      }
    });
  }

  /**
   * 清除结果
   */
  clearResults() {
    this.currentData = null;
    this.currentPair = null;

    // 隐藏所有结果区域
    document.getElementById('resultSection').classList.add('hidden');
    document.getElementById('pairSection').classList.add('hidden');

    // 清空存储
    chrome.storage.local.remove(['lastResult', 'lastPair']);

    // 清空单图片显示
    document.getElementById('selectorText').textContent = '';
    document.getElementById('urlText').textContent = '';
    document.getElementById('tagText').textContent = '';
    document.getElementById('sizeText').textContent = '';
    document.getElementById('previewImage').src = '';

    // 清空配对显示
    document.getElementById('pairImageSelector').textContent = '';
    document.getElementById('pairInputSelector').textContent = '';
    document.getElementById('pairUrlText').textContent = '';
    document.getElementById('pairHostText').textContent = '';
    document.getElementById('pairInputName').textContent = '';
    document.getElementById('pairPreviewImage').src = '';

    // 禁用高亮按钮
    document.getElementById('highlightBtn').disabled = true;

    this.showStatus('已清除结果', 'success', 2000);
  }

  /**
   * 复制选择器
   */
  async copySelector() {
    if (!this.currentData) return;

    const selector = this.currentData.selector;

    try {
      await navigator.clipboard.writeText(selector);
      this.showStatus('✓ 选择器已复制到剪贴板', 'success', 2000);

      // 视觉反馈
      const btn = document.getElementById('copySelectorBtn');
      const originalText = btn.textContent;
      btn.textContent = '✓';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 1000);
    } catch (error) {
      console.error('复制失败:', error);
      this.showStatus('复制失败', 'error', 2000);
    }
  }

  /**
   * 高亮元素
   */
  async highlightElements() {
    if (!this.currentPair) {
      this.showStatus('❌ 没有可高亮的配对数据', 'error', 2000);
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab) {
        this.showStatus('无法获取当前标签页', 'error');
        return;
      }

      // 注入脚本（如果需要）
      await this.injectContentScript(tab.id);

      // 发送高亮消息
      chrome.tabs.sendMessage(tab.id, {
        action: 'highlightElements',
        data: {
          imageSelector: this.currentPair.image.selector,
          inputSelector: this.currentPair.input.selector
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('高亮失败:', chrome.runtime.lastError);
          this.showStatus('高亮失败，请刷新页面后重试', 'error', 2000);
        } else if (response && response.success) {
          this.showStatus('✓ 元素已高亮显示', 'success', 2000);
        } else {
          this.showStatus('❌ 未找到对应的元素', 'error', 2000);
        }
      });

    } catch (error) {
      console.error('高亮失败:', error);
      this.showStatus('高亮失败: ' + error.message, 'error', 2000);
    }
  }

  /**
   * 复制图片选择器
   */
  async copyImageSelector() {
    if (!this.currentPair) return;

    const selector = this.currentPair.image.selector;

    try {
      await navigator.clipboard.writeText(selector);
      this.showStatus('✓ 图片选择器已复制', 'success', 2000);

      // 视觉反馈
      const btn = document.getElementById('copyImageSelectorBtn');
      const originalText = btn.textContent;
      btn.textContent = '✓';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 1000);
    } catch (error) {
      console.error('复制失败:', error);
      this.showStatus('复制失败', 'error', 2000);
    }
  }

  /**
   * 复制输入框选择器
   */
  async copyInputSelector() {
    if (!this.currentPair) return;

    const selector = this.currentPair.input.selector;

    try {
      await navigator.clipboard.writeText(selector);
      this.showStatus('✓ 输入框选择器已复制', 'success', 2000);

      // 视觉反馈
      const btn = document.getElementById('copyInputSelectorBtn');
      const originalText = btn.textContent;
      btn.textContent = '✓';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 1000);
    } catch (error) {
      console.error('复制失败:', error);
      this.showStatus('复制失败', 'error', 2000);
    }
  }

  /**
   * 下载图片
   */
  downloadImage() {
    if (!this.currentData) return;

    const imageData = this.currentData.imageData;
    const filename = `captcha_${Date.now()}.png`;

    // 创建下载链接
    const link = document.createElement('a');
    link.href = imageData;
    link.download = filename;
    link.click();

    this.showStatus('✓ 图片已下载', 'success', 2000);
  }

  /**
   * 显示状态消息
   */
  showStatus(message, type = 'info', duration = 0) {
    const statusEl = document.getElementById('status');
    const statusText = document.getElementById('statusText');

    statusEl.classList.remove('hidden', 'success', 'error');
    if (type !== 'info') {
      statusEl.classList.add(type);
    }

    statusText.textContent = message;

    if (duration > 0) {
      setTimeout(() => {
        statusEl.classList.add('hidden');
      }, duration);
    }
  }

  /**
   * 截断 URL
   */
  truncateUrl(url, maxLength = 50) {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
  }

  // 🆕 ==================== OCR 识别相关方法 ====================

  /**
   * 初始化 WebOCR 实例
   */
  async initWebOCR() {
    try {
      this.showOcrStatus('正在加载识别模型...', 'info');
      console.log('开始初始化 WebOCR...');
      
      this.webocr = new WebOCR();
      await this.webocr.loadModel();
      
      this.showOcrStatus('✓ 模型加载完成', 'success', 3000);
      console.log('WebOCR 初始化成功');
    } catch (error) {
      console.error('WebOCR 初始化失败:', error);
      this.showOcrStatus('❌ 模型加载失败: ' + error.message, 'error');
    }
  }

  /**
   * 识别验证码
   */
  async recognizeCaptcha() {
    if (!this.currentPair || !this.currentPair.image) {
      this.showOcrStatus('❌ 没有可识别的图片', 'error', 3000);
      return;
    }

    if (!this.webocr) {
      this.showOcrStatus('❌ 识别引擎未初始化，请刷新页面重试', 'error', 3000);
      return;
    }

    try {
      const startTime = Date.now();
      this.showOcrStatus('🔍 正在识别中...', 'info');
      console.log('开始识别验证码...');
      
      const recognizeBtn = document.getElementById('recognizeBtn');
      recognizeBtn.disabled = true;
      recognizeBtn.textContent = '🔍 识别中...';

      // 将 base64 转换为 img 元素
      const imgElement = await this.base64ToImage(this.currentPair.image.imageData);
      console.log('图片元素创建成功:', imgElement.width, 'x', imgElement.height);
      
      // 调用识别
      const result = await this.webocr.classify(imgElement);
      console.log('识别结果:', result);
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      
      if (result && result.length > 0) {
        // 显示识别结果
        document.getElementById('ocrResultText').textContent = result;
        document.getElementById('ocrResult').classList.remove('hidden');
        this.showOcrStatus(`✓ 识别完成 (耗时: ${elapsed}秒)`, 'success', 5000);
        
        // 保存结果
        this.currentPair.ocrResult = result;
        chrome.storage.local.set({ lastPair: this.currentPair });
      } else {
        this.showOcrStatus('❌ 识别失败，结果为空', 'error', 3000);
      }
      
    } catch (error) {
      console.error('识别失败:', error);
      this.showOcrStatus('❌ 识别失败: ' + error.message, 'error', 5000);
    } finally {
      const recognizeBtn = document.getElementById('recognizeBtn');
      recognizeBtn.disabled = false;
      recognizeBtn.textContent = '🔍 识别验证码';
    }
  }

  /**
   * Base64 转 Image 元素
   */
  base64ToImage(base64) {
    return new Promise((resolve, reject) => {
      const img = document.createElement('img');
      img.onload = () => {
        console.log('图片加载完成');
        resolve(img);
      };
      img.onerror = (err) => {
        console.error('图片加载失败:', err);
        reject(new Error('图片加载失败'));
      };
      img.src = base64;
    });
  }

  /**
   * 复制识别结果
   */
  async copyOcrResult() {
    const resultText = document.getElementById('ocrResultText').textContent;
    if (!resultText) return;
    
    try {
      await navigator.clipboard.writeText(resultText);
      this.showOcrStatus('✓ 已复制到剪贴板', 'success', 2000);
      
      const btn = document.getElementById('copyOcrResultBtn');
      const originalText = btn.textContent;
      btn.textContent = '✓ 已复制';
      setTimeout(() => btn.textContent = originalText, 1500);
    } catch (error) {
      console.error('复制失败:', error);
      this.showOcrStatus('❌ 复制失败', 'error', 2000);
    }
  }

  /**
   * 自动填充验证码
   */
  async autoFillCaptcha() {
    if (!this.currentPair || !this.currentPair.ocrResult) {
      this.showOcrStatus('❌ 没有识别结果', 'error', 2000);
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        this.showOcrStatus('❌ 无法获取当前标签页', 'error', 3000);
        return;
      }

      console.log('准备填充验证码:', this.currentPair.ocrResult);
      
      // 注入并执行填充脚本
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (selector, value) => {
          const input = document.querySelector(selector);
          if (input) {
            input.value = value;
            input.focus();
            // 触发事件以确保网站能检测到变化
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, message: '填充成功' };
          }
          return { success: false, message: '未找到输入框' };
        },
        args: [this.currentPair.input.selector, this.currentPair.ocrResult]
      });

      const result = results[0].result;
      if (result.success) {
        this.showOcrStatus('✓ 验证码已自动填充', 'success', 3000);
      } else {
        this.showOcrStatus('❌ ' + result.message, 'error', 3000);
      }
      
    } catch (error) {
      console.error('自动填充失败:', error);
      this.showOcrStatus('❌ 填充失败: ' + error.message, 'error', 3000);
    }
  }

  /**
   * 显示 OCR 状态消息
   */
  showOcrStatus(message, type = 'info', duration = 0) {
    const statusEl = document.getElementById('ocrStatus');
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.className = 'status-text ' + type;

    if (duration > 0) {
      setTimeout(() => {
        statusEl.textContent = '';
        statusEl.className = 'status-text';
      }, duration);
    }
  }

  // 🤖 ==================== 自动模式方法 ====================

  loadAutoModeState() {
    chrome.storage.local.get(['autoModeEnabled'], (result) => {
      const isEnabled = result.autoModeEnabled !== false; // 默认开启
      this.autoMode = isEnabled;
      const checkbox = document.getElementById('autoModeCheckbox');
      if (checkbox) {
        checkbox.checked = isEnabled;
        this.updateAutoStatus(isEnabled);
      }
    });
  }

  async toggleAutoMode() {
    const checkbox = document.getElementById('autoModeCheckbox');
    this.autoMode = checkbox.checked;

    // 持久化状态，background 在页面加载时会根据此状态自动注入
    chrome.storage.local.set({ autoModeEnabled: this.autoMode });

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || tab.url.startsWith('chrome://')) {
        this.showStatus('无法在浏览器内部页面使用', 'error', 3000);
        checkbox.checked = false;
        this.autoMode = false;
        return;
      }

      // 注入 OCR 依赖（如果还没有的话）
      await this.injectContentScript(tab.id, this.autoMode);

      if (this.autoMode) {
        chrome.tabs.sendMessage(tab.id, { action: 'startAutoMode', data: { interval: 2000 } }, (response) => {
          if (chrome.runtime.lastError) {
            this.showStatus('启动自动扫描失败, 请刷新页面', 'error', 3000);
            checkbox.checked = false;
            this.autoMode = false;
          } else {
            this.processedImageHashes.clear();
            this.autoPairCount = 0;
            this.updateAutoStatus(true);
            this.addAutoLogEntry('🤖', '自动扫描已开启，等待验证码出现...', 'info');
            document.getElementById('autoLogSection').classList.remove('hidden');
          }
        });
      } else {
        chrome.tabs.sendMessage(tab.id, { action: 'stopAutoMode' }, () => {});
        this.updateAutoStatus(false);
        this.addAutoLogEntry('⏸️', '自动扫描已停止', 'info');
      }
    } catch (error) {
      console.error('切换自动模式失败:', error);
      checkbox.checked = false;
      this.autoMode = false;
    }
  }

  async autoScanOnce() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || tab.url.startsWith('chrome://')) return;

      await this.injectContentScript(tab.id);

      chrome.tabs.sendMessage(tab.id, { action: 'autoScanOnce' }, (response) => {
        if (chrome.runtime.lastError) {
          this.showStatus('扫描失败，请刷新页面', 'error', 3000);
        } else if (response && response.count !== undefined) {
          if (response.count === 0) {
            this.addAutoLogEntry('🔍', '手动扫描：未发现验证码配对', 'info');
          }
          document.getElementById('autoLogSection').classList.remove('hidden');
        }
      });
    } catch (error) {
      console.error('手动扫描失败:', error);
    }
  }

  async handleAutoPair(data) {
    if (!data || !data.image || !data.input) return;

    // 去重
    const imgHash = data.image.imageData.substring(Math.max(0, data.image.imageData.length - 128));
    if (this.processedImageHashes.has(imgHash)) return;
    this.processedImageHashes.add(imgHash);

    if (this.processedImageHashes.size > 200) {
      const entries = Array.from(this.processedImageHashes);
      this.processedImageHashes.clear();
      for (const e of entries.slice(-50)) this.processedImageHashes.add(e);
    }

    this.autoPairCount++;
    document.getElementById('autoScanCount').textContent = `已发现 ${this.autoPairCount} 组`;

    const shortHost = data.host || '';
    this.addAutoLogEntry('🎯', `发现验证码 | ${shortHost} | ${data.image.width}x${data.image.height}`, 'found');

    // 自动识别
    if (!this.webocr || !this.webocr.session) {
      this.addAutoLogEntry('⚠️', '模型未就绪，跳过识别', 'warn');
      return;
    }

    try {
      const startTime = Date.now();
      const imgElement = await this.base64ToImage(data.image.imageData);
      const result = await this.webocr.classify(imgElement);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

      if (result && result.length > 0) {
        this.addAutoLogEntry('✅', `识别成功: "${result}" (${elapsed}s)`, 'success');

        // 自动填充
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'autoFillCaptcha',
            data: {
              selector: data.input.selector,
              value: result
            }
          }, (fillResponse) => {
            if (fillResponse && fillResponse.success) {
              this.addAutoLogEntry('✍️', `已填充: "${result}" → ${data.input.selector.substring(0, 40)}...`, 'filled');
            } else {
              this.addAutoLogEntry('❌', `填充失败: ${fillResponse?.message || '未知错误'}`, 'error');
            }
          });
        }
      } else {
        this.addAutoLogEntry('⚠️', '识别结果为空，请尝试手动刷新验证码', 'warn');
      }
    } catch (error) {
      console.error('自动识别失败:', error);
      this.addAutoLogEntry('❌', `识别失败: ${error.message}`, 'error');
    }
  }

  handleAutoOcrResult(data) {
    // 由 content script 直接 OCR 后上报的结果（侧边栏只是展示）
    if (!data || !data.result) return;

    const shortHost = (data.pair && data.pair.host) || '';
    if (data.fillSuccess) {
      this.addAutoLogEntry('✍️', `自动填充: "${data.result}" | ${shortHost}`, 'filled');
    } else {
      this.addAutoLogEntry('✅', `识别: "${data.result}" (填充失败) | ${shortHost}`, 'success');
    }
    document.getElementById('autoLogSection').classList.remove('hidden');
  }

  addAutoLogEntry(icon, message, className = 'info') {
    const logSection = document.getElementById('autoLogSection');
    const logList = document.getElementById('autoLogList');
    if (!logSection || !logList) return;

    logSection.classList.remove('hidden');

    const entry = document.createElement('div');
    entry.className = `auto-log-entry ${className}`;
    entry.innerHTML = `<span class="log-icon">${icon}</span><span class="log-msg">${message}</span><span class="log-time">${new Date().toLocaleTimeString()}</span>`;

    logList.insertBefore(entry, logList.firstChild);

    // 限制日志条数
    const maxEntries = 50;
    while (logList.children.length > maxEntries) {
      logList.removeChild(logList.lastChild);
    }
  }

  clearAutoLog() {
    const logList = document.getElementById('autoLogList');
    if (logList) logList.innerHTML = '';
    this.autoPairCount = 0;
    document.getElementById('autoScanCount').textContent = '';
    this.addAutoLogEntry('🗑️', '日志已清空', 'info');
  }

  updateAutoStatus(active) {
    const statusEl = document.getElementById('autoScanStatus');
    if (!statusEl) return;

    if (active) {
      statusEl.textContent = '● 扫描中...';
      statusEl.className = 'auto-scan-status active';
    } else {
      statusEl.textContent = '● 已关闭';
      statusEl.className = 'auto-scan-status off';
      document.getElementById('autoScanCount').textContent = '';
    }
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new SidePanelController();
});

