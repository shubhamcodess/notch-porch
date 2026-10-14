// One place that decides which OS we are behaving as. NOTCH_PLATFORM=win32 lets a Mac exercise the Windows paths.
const os = process.env.NOTCH_PLATFORM || process.platform;
module.exports = { os, isMac: os === 'darwin', isWin: os === 'win32' };
