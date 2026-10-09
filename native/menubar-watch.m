// menubar-watch: prints one JSON line whenever the right edge of the frontmost app's menu titles
// changes (screen points, origin top-left): {"right":532.5}  or {"right":null}  or {"trusted":false}.
// Needs Accessibility permission. Run with --prompt to show the system permission dialog.
#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>

static BOOL isTrusted(BOOL prompt) {
  NSDictionary *opts = @{ (__bridge NSString *)kAXTrustedCheckOptionPrompt: @(prompt) };
  return AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)opts);
}

// returns -1 when the app has no readable menu bar
static double menuRight(pid_t pid) {
  AXUIElementRef app = AXUIElementCreateApplication(pid);
  AXUIElementSetMessagingTimeout(app, 0.4f);
  CFTypeRef bar = NULL;
  double right = -1;
  if (AXUIElementCopyAttributeValue(app, kAXMenuBarAttribute, &bar) == kAXErrorSuccess && bar) {
    CFTypeRef kids = NULL;
    if (AXUIElementCopyAttributeValue((AXUIElementRef)bar, kAXChildrenAttribute, &kids) == kAXErrorSuccess && kids) {
      for (id item in (__bridge NSArray *)kids) {
        CFTypeRef p = NULL, s = NULL;
        if (AXUIElementCopyAttributeValue((__bridge AXUIElementRef)item, kAXPositionAttribute, &p) == kAXErrorSuccess &&
            AXUIElementCopyAttributeValue((__bridge AXUIElementRef)item, kAXSizeAttribute, &s) == kAXErrorSuccess) {
          CGPoint pt; CGSize sz;
          if (AXValueGetValue((AXValueRef)p, kAXValueTypeCGPoint, &pt) && AXValueGetValue((AXValueRef)s, kAXValueTypeCGSize, &sz))
            right = MAX(right, pt.x + sz.width);
        }
        if (p) CFRelease(p);
        if (s) CFRelease(s);
      }
      CFRelease(kids);
    }
    CFRelease(bar);
  }
  CFRelease(app);
  return right;
}

// x of the leftmost menu-bar status icon to the right of the notch (needs no permission); -1 if none
static double statusLeft(void) {
  NSScreen *scr = NSScreen.screens.firstObject;
  double cx = scr.frame.size.width / 2, best = -1;
  NSArray *list = (__bridge_transfer NSArray *)CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID);
  for (NSDictionary *w in list) {
    if ([w[(id)kCGWindowLayer] intValue] != 25) continue;            // status-item windows
    CGRect b;
    if (!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)w[(id)kCGWindowBounds], &b)) continue;
    if (b.origin.y > 4 || b.size.height > 60 || b.origin.x < cx || b.origin.x > scr.frame.size.width) continue;
    if (best < 0 || b.origin.x < best) best = b.origin.x;
  }
  return best;
}

// --notch: print the primary display's exact notch size (points) and exit
static int printNotch(void) {
  NSScreen *scr = NSScreen.screens.firstObject;
  double w = 0, h = 0;
  if (@available(macOS 12.0, *)) {
    NSRect l = scr.auxiliaryTopLeftArea, r = scr.auxiliaryTopRightArea;
    if (l.size.width > 0 && r.size.width > 0) { w = scr.frame.size.width - l.size.width - r.size.width; h = scr.safeAreaInsets.top; }
  }
  printf("{\"notchWidth\":%.1f,\"notchHeight\":%.1f}\n", w, h);
  return 0;
}

int main(int argc, char **argv) {
  @autoreleasepool {
    for (int i = 1; i < argc; i++) if (!strcmp(argv[i], "--notch")) return printNotch();
    setvbuf(stdout, NULL, _IOLBF, 0);
    BOOL prompt = NO;
    for (int i = 1; i < argc; i++) if (!strcmp(argv[i], "--prompt")) prompt = YES;
    __block BOOL lastTrusted = isTrusted(prompt);
    if (!lastTrusted) puts("{\"trusted\":false}");

    __block pid_t lastPid = -1;
    __block NSDate *lastCheck = [NSDate distantPast];
    __block double lastSent = -999, lastStatus = -999;

    [NSTimer scheduledTimerWithTimeInterval:0.5 repeats:YES block:^(NSTimer *t) {
      double st = statusLeft();                       // status icons need no permission
      if (fabs(st - lastStatus) > 1) {
        lastStatus = st;
        if (st < 0) puts("{\"statusLeft\":null}"); else printf("{\"statusLeft\":%.1f}\n", st);
      }
      BOOL ok = isTrusted(NO);
      if (ok != lastTrusted) { lastTrusted = ok; lastPid = -1; if (!ok) puts("{\"trusted\":false}"); }
      NSRunningApplication *front = NSWorkspace.sharedWorkspace.frontmostApplication;
      if (!ok || !front) return;
      BOOL changed = front.processIdentifier != lastPid;
      // re-read on app switch and every few seconds (menus can change while an app is active)
      if (!changed && -[lastCheck timeIntervalSinceNow] < 3) return;
      lastPid = front.processIdentifier;
      lastCheck = [NSDate date];
      double r = menuRight(front.processIdentifier);
      if (fabs(r - lastSent) > 1) {
        lastSent = r;
        if (r < 0) puts("{\"right\":null}"); else printf("{\"right\":%.1f}\n", r);
      }
    }];
    [[NSRunLoop mainRunLoop] run];
  }
  return 0;
}
