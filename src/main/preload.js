// Bridge between the notch UI and the main process.
// Only "shell:*" and widget-namespaced "w:<id>:*" channels are allowed.
const { contextBridge, ipcRenderer } = require('electron');

const ok = (ch) => typeof ch === 'string' && /^(shell|w:[a-z0-9_-]+):[\w-]+$/i.test(ch);

contextBridge.exposeInMainWorld('notch', {
  invoke: (ch, ...args) => {
    if (!ok(ch)) return Promise.reject(new Error(`Blocked channel: ${ch}`));
    return ipcRenderer.invoke(ch, ...args);
  },
  on: (ch, cb) => {
    if (!ok(ch)) throw new Error(`Blocked channel: ${ch}`);
    const listener = (_e, data) => cb(data);
    ipcRenderer.on(ch, listener);
    return () => ipcRenderer.removeListener(ch, listener);
  },
  setInteractive: (on) => ipcRenderer.send('shell:interactive', !!on)
});
