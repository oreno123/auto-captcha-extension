// Background Service Worker
// 负责：侧边栏打开、自动模式触发

const AUTO_MODE_KEY = 'autoModeEnabled';

// Service Worker 启动时确保自动模式默认开启
chrome.storage.local.get([AUTO_MODE_KEY], (result) => {
  if (result[AUTO_MODE_KEY] === undefined) {
    chrome.storage.local.set({ [AUTO_MODE_KEY]: true });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('AutoCaptcha 已安装');
});

// 点击扩展图标时打开侧边栏
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// 页面加载完成后，自动启动 OCR 扫描
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) return;

  chrome.storage.local.get([AUTO_MODE_KEY], (result) => {
    if (!result[AUTO_MODE_KEY]) return;

    // ort + webocr + content 已通过 manifest content_scripts 注入
    // 直接通知 content script 初始化
    chrome.tabs.sendMessage(tabId, {
      action: 'initAutoMode',
      data: { interval: 2000 }
    }).catch(() => {
      // 页面可能不存在 content script（受保护页面等）
    });
  });
});
