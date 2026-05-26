chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'vocabi-translate',
        title: 'Add to VocAbi',
        contexts: ['selection']
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== 'vocabi-translate') return;

    chrome.tabs.sendMessage(tab.id, {
        action: 'translate',
        text: info.selectionText
    });
});

chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: '/dashboard/dashboard.html' });
});