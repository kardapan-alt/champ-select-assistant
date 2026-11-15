$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
public static class AugmentClicks {
  [StructLayout(LayoutKind.Sequential)] struct Point { public int X,Y; }
  [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left,Top,Right,Bottom; }
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Point p);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window,out Rect r);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window,int attribute,out Rect r,int size);
  static long Now() { return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); }
  public static void Run(long handle) {
    try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch {}
    IntPtr window=new IntPtr(handle);
    bool focused=false,down=false,escape=false; long heartbeat=0;
    // No hooks, injected code, synthetic input or text/keyboard logging.
    while(IsWindow(window)) {
      bool active=GetForegroundWindow()==window && !IsIconic(window);
      long at=Now();
      if(active!=focused || at-heartbeat>250) {
        Console.WriteLine("{\"type\":\"focus\",\"focused\":"+(active?"true":"false")+",\"at\":"+at+"}");
        heartbeat=at;
      }
      bool pressed=active && (GetAsyncKeyState(GetSystemMetrics(23)!=0?2:1)&0x8000)!=0;
      bool esc=active && (GetAsyncKeyState(27)&0x8000)!=0;
      if(esc && !escape)Console.WriteLine("{\"type\":\"cancel\",\"at\":"+at+"}");
      if(active && focused && pressed!=down) {
        Point p; Rect r;
        if(GetCursorPos(out p) && (DwmGetWindowAttribute(window,9,out r,16)==0 || GetWindowRect(window,out r))) {
          int width=r.Right-r.Left,height=r.Bottom-r.Top;
          if(width>0 && height>0)Console.WriteLine("{\"type\":\""+(pressed?"down":"up")+"\",\"at\":"+at+",\"x\":"+(p.X-r.Left)+",\"y\":"+(p.Y-r.Top)+",\"width\":"+width+",\"height\":"+height+"}");
        }
      }
      focused=active;down=pressed;escape=esc;Thread.Sleep(10);
    }
  }
}
'@
$augmentWindow=[Console]::In.ReadLine()
if($augmentWindow -match '^\d+$'){[AugmentClicks]::Run([long]$augmentWindow)}
