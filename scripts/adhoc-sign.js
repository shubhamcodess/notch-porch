// electron-builder afterPack hook: ad-hoc sign the whole bundle ("-" = no certificate).
// Apple Silicon refuses to run bundles whose signature seal is broken, and repackaging breaks Electron's.
// This deliberately never uses a keychain identity.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const helper = path.join(app, 'Contents', 'Resources', 'menubar-watch');
  if (require('fs').existsSync(helper)) execFileSync('codesign', ['--force', '--sign', '-', helper], { stdio: 'inherit' });
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  console.log('  • ad-hoc signed', app);
};
