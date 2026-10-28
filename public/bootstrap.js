(() => {
  let ready = false;
  const build = '__BUILD__';
  function failure(message, retry = false) {
    const show = () => {
      const alert = document.querySelector('#load-error');
      if (alert) { alert.hidden = false; alert.querySelector('p').textContent = message; }
      const connection = document.querySelector('#connection');
      if (connection) { connection.className = 'connection offline'; connection.textContent = '页面未就绪'; }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show, { once:true }); else show();
    if (retry) {
      try {
        const key = `task-console:asset-retry:${build}`;
        if (!sessionStorage.getItem(key)) { sessionStorage.setItem(key, '1'); setTimeout(() => location.reload(), 700); }
      } catch { /* Manual reload remains available when browser storage is disabled. */ }
    }
  }
  const timer = setTimeout(() => { if (!ready) failure('连接尚未就绪。请重新载入页面；如果服务已自动退出，在对话中继续任务即可按需启动。'); }, 12000);
  window.addEventListener('task-console-ready', () => { ready = true; clearTimeout(timer); const alert=document.querySelector('#load-error'); if(alert)alert.hidden=true; });
  window.addEventListener('task-console-failed', () => failure('任务页面初始化失败。重新载入可恢复，已提交的任务状态不会被清除。'));
  window.addEventListener('error', event => {
    const resource = event.target instanceof HTMLScriptElement || event.target instanceof HTMLLinkElement;
    if (resource || !ready) failure('页面资源未完整加载，正在尝试重新载入。任务数据仍保存在本机。', resource);
  }, true);
  document.addEventListener('click', event => { if (event.target.closest('#reload-page')) location.reload(); });
  window.addEventListener('pagehide', () => clearTimeout(timer));
})();
