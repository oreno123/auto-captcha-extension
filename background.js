// Background Service Worker
// 负责：侧边栏打开、自动模式编排、脚本注入

const AUTO_MODE_KEY = 'autoModeEnabled';

// 安装时初始化默认状态
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([AUTO_MODE_KEY], (result) => {
    if (result[AUTO_MODE_KEY] === undefined) {
      chrome.storage.local.set({ [AUTO_MODE_KEY]: true });
    }
  });
  console.log('验证码自动识别插件已安装');
});

// 点击扩展图标时打开侧边栏
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// 页面加载完成后，检查是否需要自动启动
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) return;

  chrome.storage.local.get([AUTO_MODE_KEY], async (result) => {
    if (!result[AUTO_MODE_KEY]) return;

    try {
      // 注入 ONNX Runtime 和 WebOCR
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['lib/ort.min.js']
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['lib/webocr.js']
      });

      // 通知 content script 初始化自动模式
      chrome.tabs.sendMessage(tabId, {
        action: 'initAutoMode',
        data: { interval: 2000 }
      }).catch(() => {});
    } catch (e) {
      // 静默失败（受保护的页面会注入失败）
    }
  });
});

// 转发消息以确保 sidepanel 能收到 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'autoPairDetected' || request.action === 'autoOcrResult') {
    // 不需要转发，extension page message 会广播
  }
  return true;
});
