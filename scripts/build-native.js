// Builds the macOS menu-bar helper. A no-op everywhere else (Windows has no notch to avoid).
if (process.platform !== 'darwin') process.exit(0);
const { execFileSync } = require('child_process');
const fs = require('fs');
fs.mkdirSync('build', { recursive: true });
execFileSync('clang', ['-O2', '-fobjc-arc', '-framework', 'Cocoa', '-framework', 'ApplicationServices', 'native/menubar-watch.m', '-o', 'build/menubar-watch'], { stdio: 'inherit' });
