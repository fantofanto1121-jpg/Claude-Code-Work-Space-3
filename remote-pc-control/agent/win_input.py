"""Windows input / screen capture backend (standard library only).

Uses user32.SendInput for real mouse + keyboard events and GDI StretchBlt
for screen capture. A no-op backend is provided for non-Windows machines so
the server can be developed and smoke tested anywhere.
"""
from __future__ import annotations

import ctypes
import math
import struct
import time
import sys
import zlib

IS_WINDOWS = sys.platform.startswith("win")

# ---------------------------------------------------------------- key tables

VK = {
    "escape": 0x1B, "tab": 0x09, "enter": 0x0D, "backspace": 0x08,
    "delete": 0x2E, "insert": 0x2D, "space": 0x20,
    "up": 0x26, "down": 0x28, "left": 0x25, "right": 0x27,
    "home": 0x24, "end": 0x23, "pageup": 0x21, "pagedown": 0x22,
    "ctrl": 0x11, "shift": 0x10, "alt": 0x12, "win": 0x5B,
    "capslock": 0x14, "printscreen": 0x2C,
    "volumeup": 0xAF, "volumedown": 0xAE, "volumemute": 0xAD,
    "medianext": 0xB0, "mediaprev": 0xB1, "mediaplay": 0xB3,
}
for _i in range(1, 13):
    VK["f%d" % _i] = 0x6F + _i
for _c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789":
    VK[_c.lower()] = ord(_c)


def png_encode(width: int, height: int, rgb: bytes, level: int = 6) -> bytes:
    """Minimal PNG writer (8-bit truecolour, filter 0)."""
    stride = width * 3
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        rows += rgb[y * stride:(y + 1) * stride]
    comp = zlib.compress(bytes(rows), level)

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", comp)
            + chunk(b"IEND", b""))


# ---------------------------------------------------------------- fallback

class StubBackend:
    """Logs what would happen. Used on non-Windows hosts."""

    name = "stub"

    def __init__(self) -> None:
        self.virtual = (0, 0, 3200, 1080)
        self.bits_per_pixel = 32

    def refresh_metrics(self):
        return self.virtual

    def monitors(self):
        return [
            {"x": 0, "y": 0, "w": 1920, "h": 1080, "primary": True, "name": "DISPLAY1"},
            {"x": 1920, "y": 0, "w": 1280, "h": 1024, "primary": False, "name": "DISPLAY2"},
        ]

    def move_relative(self, dx, dy): pass
    def move_absolute(self, nx, ny, region=None): pass
    def button(self, which, state): pass
    def scroll(self, dx, dy): pass
    def key(self, name, mods=()): pass
    def type_text(self, text): pass

    def grab(self, max_width=1024, region=None):
        rx, ry, rw, rh = region or self.virtual
        w = max(2, min(max_width, 1600))
        h = max(2, round(w * rh / rw))
        row = bytearray()
        for x in range(w):
            f = x / w
            row += bytes((int(40 + 180 * f), int(90 + 110 * (1 - f)), int(190 - 120 * f)))
        frame = bytearray(bytes(row) * h)
        # a block that travels, so only a few tiles change between frames
        bw, bh = max(8, w // 6), max(8, h // 6)
        phase = time.time() * 0.6
        bx = int((w - bw) * (0.5 + 0.5 * math.sin(phase)))
        by = int((h - bh) * (0.5 + 0.5 * math.cos(phase * 0.8)))
        stripe = bytes((245, 238, 220)) * bw
        for i in range(bh):
            off = ((by + i) * w + bx) * 3
            frame[off:off + bw * 3] = stripe
        # a pointer, so the client side can be checked without Windows
        cx, cy = int(w * 0.5), int(h * 0.5)
        for i in range(min(18, h - cy)):
            run = max(1, (18 - i) // 2)
            off = ((cy + i) * w + cx) * 3
            frame[off:off + run * 3] = bytes((255, 255, 255)) * run
        return w, h, bytes(frame)

    def capture(self, max_width=1024, region=None):
        w, h, rgb = self.grab(max_width, region)
        return png_encode(w, h, rgb), w, h


if not IS_WINDOWS:
    def make_backend():
        return StubBackend()
else:
    import ctypes.wintypes as wt

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    gdi32 = ctypes.WinDLL("gdi32", use_last_error=True)

    ULONG_PTR = ctypes.c_ulonglong if ctypes.sizeof(ctypes.c_void_p) == 8 else ctypes.c_ulong

    class MOUSEINPUT(ctypes.Structure):
        _fields_ = [("dx", wt.LONG), ("dy", wt.LONG), ("mouseData", wt.DWORD),
                    ("dwFlags", wt.DWORD), ("time", wt.DWORD), ("dwExtraInfo", ULONG_PTR)]

    class KEYBDINPUT(ctypes.Structure):
        _fields_ = [("wVk", wt.WORD), ("wScan", wt.WORD), ("dwFlags", wt.DWORD),
                    ("time", wt.DWORD), ("dwExtraInfo", ULONG_PTR)]

    class HARDWAREINPUT(ctypes.Structure):
        _fields_ = [("uMsg", wt.DWORD), ("wParamL", wt.WORD), ("wParamH", wt.WORD)]

    class _IU(ctypes.Union):
        _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT), ("hi", HARDWAREINPUT)]

    class INPUT(ctypes.Structure):
        _anonymous_ = ("u",)
        _fields_ = [("type", wt.DWORD), ("u", _IU)]

    INPUT_MOUSE, INPUT_KEYBOARD = 0, 1
    MOVE, ABSOLUTE, VIRTUALDESK = 0x0001, 0x8000, 0x4000
    BTN = {
        "left": (0x0002, 0x0004),
        "right": (0x0008, 0x0010),
        "middle": (0x0020, 0x0040),
    }
    WHEEL, HWHEEL = 0x0800, 0x1000
    KEYUP, UNICODE = 0x0002, 0x0004
    WHEEL_DELTA = 120

    SM = dict(x=76, y=77, cx=78, cy=79)
    SRCCOPY, HALFTONE, DIB_RGB_COLORS = 0x00CC0020, 4, 0

    class BITMAPINFOHEADER(ctypes.Structure):
        _fields_ = [("biSize", wt.DWORD), ("biWidth", wt.LONG), ("biHeight", wt.LONG),
                    ("biPlanes", wt.WORD), ("biBitCount", wt.WORD), ("biCompression", wt.DWORD),
                    ("biSizeImage", wt.DWORD), ("biXPelsPerMeter", wt.LONG),
                    ("biYPelsPerMeter", wt.LONG), ("biClrUsed", wt.DWORD),
                    ("biClrImportant", wt.DWORD)]

    class CURSORINFO(ctypes.Structure):
        _fields_ = [("cbSize", wt.DWORD), ("flags", wt.DWORD),
                    ("hCursor", ctypes.c_void_p), ("ptScreenPos", wt.POINT)]

    class ICONINFO(ctypes.Structure):
        _fields_ = [("fIcon", wt.BOOL), ("xHotspot", wt.DWORD), ("yHotspot", wt.DWORD),
                    ("hbmMask", ctypes.c_void_p), ("hbmColor", ctypes.c_void_p)]

    class MONITORINFOEXW(ctypes.Structure):
        _fields_ = [("cbSize", wt.DWORD), ("rcMonitor", wt.RECT), ("rcWork", wt.RECT),
                    ("dwFlags", wt.DWORD), ("szDevice", wt.WCHAR * 32)]

    MONITORENUMPROC = ctypes.WINFUNCTYPE(wt.BOOL, ctypes.c_void_p, ctypes.c_void_p,
                                         ctypes.POINTER(wt.RECT), wt.LPARAM)
    CURSOR_SHOWING, DI_NORMAL, MONITORINFOF_PRIMARY = 0x0001, 0x0003, 0x0001
    SM_CXCURSOR, SM_CYCURSOR = 13, 14

    class BITMAP(ctypes.Structure):
        _fields_ = [("bmType", wt.LONG), ("bmWidth", wt.LONG), ("bmHeight", wt.LONG),
                    ("bmWidthBytes", wt.LONG), ("bmPlanes", wt.WORD),
                    ("bmBitsPixel", wt.WORD), ("bmBits", ctypes.c_void_p)]

    class BITMAPINFO(ctypes.Structure):
        _fields_ = [("bmiHeader", BITMAPINFOHEADER), ("bmiColors", wt.DWORD * 3)]

    user32.SendInput.argtypes = (wt.UINT, ctypes.POINTER(INPUT), ctypes.c_int)
    user32.SendInput.restype = wt.UINT
    user32.GetDC.argtypes = (ctypes.c_void_p,)
    user32.GetDC.restype = ctypes.c_void_p
    user32.ReleaseDC.argtypes = (ctypes.c_void_p, ctypes.c_void_p)
    gdi32.CreateCompatibleDC.argtypes = (ctypes.c_void_p,)
    gdi32.CreateCompatibleDC.restype = ctypes.c_void_p
    gdi32.CreateCompatibleBitmap.argtypes = (ctypes.c_void_p, ctypes.c_int, ctypes.c_int)
    gdi32.CreateCompatibleBitmap.restype = ctypes.c_void_p
    gdi32.SelectObject.argtypes = (ctypes.c_void_p, ctypes.c_void_p)
    gdi32.SelectObject.restype = ctypes.c_void_p
    gdi32.SetStretchBltMode.argtypes = (ctypes.c_void_p, ctypes.c_int)
    gdi32.StretchBlt.argtypes = (ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                 ctypes.c_int, ctypes.c_void_p, ctypes.c_int, ctypes.c_int,
                                 ctypes.c_int, ctypes.c_int, wt.DWORD)
    gdi32.GetDIBits.argtypes = (ctypes.c_void_p, ctypes.c_void_p, wt.UINT, wt.UINT,
                                ctypes.c_void_p, ctypes.POINTER(BITMAPINFO), wt.UINT)
    gdi32.GetObjectW.argtypes = (ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p)
    user32.GetCursorInfo.argtypes = (ctypes.POINTER(CURSORINFO),)
    user32.GetIconInfo.argtypes = (ctypes.c_void_p, ctypes.POINTER(ICONINFO))
    user32.DrawIconEx.argtypes = (ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_void_p,
                                  ctypes.c_int, ctypes.c_int, wt.UINT, ctypes.c_void_p, wt.UINT)
    user32.EnumDisplayMonitors.argtypes = (ctypes.c_void_p, ctypes.c_void_p,
                                           MONITORENUMPROC, wt.LPARAM)
    user32.GetMonitorInfoW.argtypes = (ctypes.c_void_p, ctypes.POINTER(MONITORINFOEXW))
    gdi32.DeleteObject.argtypes = (ctypes.c_void_p,)
    gdi32.DeleteDC.argtypes = (ctypes.c_void_p,)

    gdiplus = ctypes.WinDLL("gdiplus")
    ole32 = ctypes.WinDLL("ole32")
    kernel32 = ctypes.WinDLL("kernel32")

    class GUID(ctypes.Structure):
        _fields_ = [("Data1", ctypes.c_uint32), ("Data2", ctypes.c_uint16),
                    ("Data3", ctypes.c_uint16), ("Data4", ctypes.c_ubyte * 8)]

    class GdiplusStartupInput(ctypes.Structure):
        _fields_ = [("GdiplusVersion", ctypes.c_uint32), ("DebugEventCallback", ctypes.c_void_p),
                    ("SuppressBackgroundThread", ctypes.c_int), ("SuppressExternalCodecs", ctypes.c_int)]

    class EncoderParameter(ctypes.Structure):
        _fields_ = [("Guid", GUID), ("NumberOfValues", ctypes.c_uint32),
                    ("Type", ctypes.c_uint32), ("Value", ctypes.c_void_p)]

    class EncoderParameters(ctypes.Structure):
        _fields_ = [("Count", ctypes.c_uint32), ("Parameter", EncoderParameter * 1)]

    PIXEL_FORMAT_32BPP_RGB = 0x22009
    ENCODER_VALUE_LONG = 4
    STREAM_SEEK_END = 2

    ole32.CLSIDFromString.argtypes = (wt.LPCWSTR, ctypes.POINTER(GUID))
    kernel32.GlobalLock.argtypes = (ctypes.c_void_p,)
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalUnlock.argtypes = (ctypes.c_void_p,)
    gdiplus.GdipCreateBitmapFromScan0.argtypes = (ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                                  ctypes.c_int, ctypes.c_void_p,
                                                  ctypes.POINTER(ctypes.c_void_p))
    gdiplus.GdipSaveImageToStream.argtypes = (ctypes.c_void_p, ctypes.c_void_p,
                                              ctypes.POINTER(GUID),
                                              ctypes.POINTER(EncoderParameters))
    gdiplus.GdipDisposeImage.argtypes = (ctypes.c_void_p,)
    ole32.CreateStreamOnHGlobal.argtypes = (ctypes.c_void_p, wt.BOOL,
                                            ctypes.POINTER(ctypes.c_void_p))
    ole32.GetHGlobalFromStream.argtypes = (ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p))

    def _guid(text: str) -> GUID:
        g = GUID()
        ole32.CLSIDFromString(text, ctypes.byref(g))
        return g

    JPEG_CLSID = _guid("{557CF401-1A04-11D3-9A73-0000F81EF32E}")
    ENCODER_QUALITY = _guid("{1D5BE4B5-FA4A-452D-9CDD-5DB35105E7EB}")
    _GDIPLUS_TOKEN = ctypes.c_void_p()

    def _com_call(obj, index, restype, *argtypes):
        vtbl = ctypes.cast(obj, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p)))[0]
        return ctypes.WINFUNCTYPE(restype, ctypes.c_void_p, *argtypes)(vtbl[index])

    def _gdiplus_ready() -> bool:
        if _GDIPLUS_TOKEN.value:
            return True
        start = GdiplusStartupInput(1, None, 0, 0)
        if gdiplus.GdiplusStartup(ctypes.byref(_GDIPLUS_TOKEN), ctypes.byref(start), None) != 0:
            return False
        return bool(_GDIPLUS_TOKEN.value)

    def jpeg_encode(bgra: bytes, width: int, height: int, quality: int = 80) -> bytes:
        """Encode BGRX pixels as JPEG with the codec Windows already ships."""
        if not _gdiplus_ready():
            raise OSError("GDI+ is not available")
        scan0 = (ctypes.c_char * len(bgra)).from_buffer_copy(bgra)
        bitmap = ctypes.c_void_p()
        if gdiplus.GdipCreateBitmapFromScan0(width, height, width * 4,
                                             PIXEL_FORMAT_32BPP_RGB, scan0,
                                             ctypes.byref(bitmap)) != 0:
            raise OSError("GdipCreateBitmapFromScan0 failed")
        stream = ctypes.c_void_p()
        if ole32.CreateStreamOnHGlobal(None, True, ctypes.byref(stream)) != 0:
            gdiplus.GdipDisposeImage(bitmap)
            raise OSError("CreateStreamOnHGlobal failed")
        try:
            value = ctypes.c_long(max(1, min(100, int(quality))))
            params = EncoderParameters()
            params.Count = 1
            params.Parameter[0].Guid = ENCODER_QUALITY
            params.Parameter[0].NumberOfValues = 1
            params.Parameter[0].Type = ENCODER_VALUE_LONG
            params.Parameter[0].Value = ctypes.cast(ctypes.byref(value), ctypes.c_void_p)
            if gdiplus.GdipSaveImageToStream(bitmap, stream, ctypes.byref(JPEG_CLSID),
                                             ctypes.byref(params)) != 0:
                raise OSError("GdipSaveImageToStream failed")

            seek = _com_call(stream, 5, ctypes.c_long, ctypes.c_longlong, ctypes.c_ulong,
                             ctypes.POINTER(ctypes.c_ulonglong))
            size = ctypes.c_ulonglong()
            seek(stream, 0, STREAM_SEEK_END, ctypes.byref(size))

            handle = ctypes.c_void_p()
            ole32.GetHGlobalFromStream(stream, ctypes.byref(handle))
            ptr = kernel32.GlobalLock(handle)
            try:
                return ctypes.string_at(ptr, int(size.value))
            finally:
                kernel32.GlobalUnlock(handle)
        finally:
            _com_call(stream, 2, ctypes.c_ulong)(stream)      # IUnknown::Release
            gdiplus.GdipDisposeImage(bitmap)

    def _dpi_aware() -> None:
        try:
            ctypes.WinDLL("shcore").SetProcessDpiAwareness(2)
        except Exception:
            try:
                user32.SetProcessDPIAware()
            except Exception:
                pass

    class Win32Backend:
        name = "win32"

        def __init__(self) -> None:
            _dpi_aware()
            self.refresh_metrics()
            self.bits_per_pixel = self._probe_depth()
            self.jpeg = self._probe_jpeg()

        @staticmethod
        def _probe_jpeg() -> bool:
            try:
                return len(jpeg_encode(b"\x40\x50\x60\x00" * 64, 8, 8, 70)) > 100
            except Exception:
                return False

        @staticmethod
        def _probe_depth() -> int:
            """Bits per pixel of a bitmap made the way capture makes it."""
            screen = user32.GetDC(None)
            bmp = gdi32.CreateCompatibleBitmap(screen, 2, 2)
            try:
                info = BITMAP()
                gdi32.GetObjectW(bmp, ctypes.sizeof(BITMAP), ctypes.byref(info))
                return int(info.bmBitsPixel)
            finally:
                gdi32.DeleteObject(bmp)
                user32.ReleaseDC(None, screen)

        # -- geometry ---------------------------------------------------
        def monitors(self):
            found = []

            def collect(hmon, hdc, lprc, lparam):
                mi = MONITORINFOEXW()
                mi.cbSize = ctypes.sizeof(MONITORINFOEXW)
                if user32.GetMonitorInfoW(hmon, ctypes.byref(mi)):
                    r = mi.rcMonitor
                    found.append({"x": r.left, "y": r.top,
                                  "w": r.right - r.left, "h": r.bottom - r.top,
                                  "primary": bool(mi.dwFlags & MONITORINFOF_PRIMARY),
                                  "name": mi.szDevice.replace("\\\\.\\", "")})
                return True

            user32.EnumDisplayMonitors(None, None, MONITORENUMPROC(collect), 0)
            found.sort(key=lambda m: (m["x"], m["y"]))
            if not found:
                vx, vy, vw, vh = self.virtual
                found = [{"x": vx, "y": vy, "w": vw, "h": vh, "primary": True, "name": "screen"}]
            return found

        def refresh_metrics(self):
            g = user32.GetSystemMetrics
            self.virtual = (g(SM["x"]), g(SM["y"]), max(1, g(SM["cx"])), max(1, g(SM["cy"])))
            return self.virtual

        # -- sending ----------------------------------------------------
        @staticmethod
        def _send(*items: INPUT) -> None:
            n = len(items)
            arr = (INPUT * n)(*items)
            user32.SendInput(n, arr, ctypes.sizeof(INPUT))

        @staticmethod
        def _mouse(flags, dx=0, dy=0, data=0) -> INPUT:
            e = INPUT(type=INPUT_MOUSE)
            e.mi = MOUSEINPUT(int(dx), int(dy), ctypes.c_uint32(int(data)).value, flags, 0, 0)
            return e

        @staticmethod
        def _keyb(vk, flags=0, scan=0) -> INPUT:
            e = INPUT(type=INPUT_KEYBOARD)
            e.ki = KEYBDINPUT(vk, scan, flags, 0, 0)
            return e

        # -- public api -------------------------------------------------
        def move_relative(self, dx, dy):
            if dx or dy:
                self._send(self._mouse(MOVE, dx, dy))

        def move_absolute(self, nx, ny, region=None):
            vx, vy, vw, vh = self.virtual
            rx, ry, rw, rh = region or self.virtual
            nx = min(max(nx, 0.0), 1.0)
            ny = min(max(ny, 0.0), 1.0)
            # SendInput's virtual-desktop space is normalised over the whole
            # virtual screen, so convert through absolute pixels first.
            px, py = rx + nx * (rw - 1), ry + ny * (rh - 1)
            ax = (px - vx) * 65535.0 / max(1, vw - 1)
            ay = (py - vy) * 65535.0 / max(1, vh - 1)
            self._send(self._mouse(MOVE | ABSOLUTE | VIRTUALDESK, round(ax), round(ay)))

        def button(self, which, state):
            down, up = BTN.get(which, BTN["left"])
            if state == "down":
                self._send(self._mouse(down))
            elif state == "up":
                self._send(self._mouse(up))
            else:
                self._send(self._mouse(down), self._mouse(up))

        def scroll(self, dx=0, dy=0):
            evts = []
            if dy:
                evts.append(self._mouse(WHEEL, data=int(dy * WHEEL_DELTA)))
            if dx:
                evts.append(self._mouse(HWHEEL, data=int(dx * WHEEL_DELTA)))
            if evts:
                self._send(*evts)

        def key(self, name, mods=()):
            vk = VK.get(str(name).lower())
            if vk is None:
                return
            mvks = [VK[m] for m in (str(x).lower() for x in mods) if m in VK]
            seq = [self._keyb(m) for m in mvks]
            seq += [self._keyb(vk), self._keyb(vk, KEYUP)]
            seq += [self._keyb(m, KEYUP) for m in reversed(mvks)]
            self._send(*seq)

        def type_text(self, text):
            seq = []
            for ch in str(text)[:2000]:
                units = ch.encode("utf-16-le")
                for i in range(0, len(units), 2):
                    code = units[i] | (units[i + 1] << 8)
                    seq.append(self._keyb(0, UNICODE, code))
                    seq.append(self._keyb(0, UNICODE | KEYUP, code))
                if len(seq) >= 64:
                    self._send(*seq)
                    seq = []
            if seq:
                self._send(*seq)

        # -- capture ----------------------------------------------------
        def grab(self, max_width=1024, region=None):
            w, h, bgra = self.grab_bgra(max_width, region)
            rgb = bytearray(w * h * 3)
            rgb[0::3] = bgra[2::4]
            rgb[1::3] = bgra[1::4]
            rgb[2::3] = bgra[0::4]
            return w, h, bytes(rgb)

        def encode(self, bgra, width, height, quality=80):
            return jpeg_encode(bgra, width, height, quality), "jpeg"

        def grab_bgra(self, max_width=1024, region=None):
            vx, vy, vw, vh = self.refresh_metrics()
            rx, ry, rw, rh = region or (vx, vy, vw, vh)
            rw, rh = max(2, rw), max(2, rh)
            out_w = min(max_width, rw)
            out_w -= out_w % 2
            out_w = max(2, out_w)
            out_h = max(2, round(out_w * rh / rw))

            screen = user32.GetDC(None)
            mem = gdi32.CreateCompatibleDC(screen)
            # Must be compatible with the screen DC. A freshly made memory DC
            # still holds its default 1x1 monochrome bitmap, so asking it for a
            # compatible bitmap yields a 1 bit one and the capture comes back
            # dithered black and white.
            bmp = gdi32.CreateCompatibleBitmap(screen, out_w, out_h)
            old = gdi32.SelectObject(mem, bmp)
            try:
                gdi32.SetStretchBltMode(mem, HALFTONE)
                gdi32.StretchBlt(mem, 0, 0, out_w, out_h, screen, rx, ry, rw, rh, SRCCOPY)
                self._draw_cursor(mem, rx, ry, rw, rh, out_w, out_h)

                bmi = BITMAPINFO()
                bmi.bmiHeader.biSize = ctypes.sizeof(BITMAPINFOHEADER)
                bmi.bmiHeader.biWidth = out_w
                bmi.bmiHeader.biHeight = -out_h          # top-down rows
                bmi.bmiHeader.biPlanes = 1
                bmi.bmiHeader.biBitCount = 32
                bmi.bmiHeader.biCompression = 0
                buf = ctypes.create_string_buffer(out_w * out_h * 4)
                gdi32.GetDIBits(mem, bmp, 0, out_h, buf, ctypes.byref(bmi), DIB_RGB_COLORS)
                bgra = buf.raw[:out_w * out_h * 4]
            finally:
                gdi32.SelectObject(mem, old)
                gdi32.DeleteObject(bmp)
                gdi32.DeleteDC(mem)
                user32.ReleaseDC(None, screen)

            return out_w, out_h, bgra

        def capture(self, max_width=1024, region=None):
            w, h, rgb = self.grab(max_width, region)
            return png_encode(w, h, rgb), w, h

        @staticmethod
        def _draw_cursor(mem, rx, ry, rw, rh, out_w, out_h):
            """BitBlt leaves the pointer out, so paint it on afterwards."""
            ci = CURSORINFO()
            ci.cbSize = ctypes.sizeof(CURSORINFO)
            if not user32.GetCursorInfo(ctypes.byref(ci)):
                return
            if not (ci.flags & CURSOR_SHOWING) or not ci.hCursor:
                return
            info = ICONINFO()
            if not user32.GetIconInfo(ci.hCursor, ctypes.byref(info)):
                return
            try:
                sx, sy = out_w / float(rw), out_h / float(rh)
                cw = max(6, int(round(user32.GetSystemMetrics(SM_CXCURSOR) * sx)))
                ch = max(6, int(round(user32.GetSystemMetrics(SM_CYCURSOR) * sy)))
                px = int(round((ci.ptScreenPos.x - rx - info.xHotspot) * sx))
                py = int(round((ci.ptScreenPos.y - ry - info.yHotspot) * sy))
                if -cw < px < out_w and -ch < py < out_h:
                    user32.DrawIconEx(mem, px, py, ci.hCursor, cw, ch, 0, None, DI_NORMAL)
            finally:
                # GetIconInfo hands over two bitmaps that are ours to free
                if info.hbmMask:
                    gdi32.DeleteObject(info.hbmMask)
                if info.hbmColor:
                    gdi32.DeleteObject(info.hbmColor)

    def make_backend():
        return Win32Backend()
