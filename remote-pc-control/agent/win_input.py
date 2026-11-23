"""Windows input / screen capture backend (standard library only).

Uses user32.SendInput for real mouse + keyboard events and GDI StretchBlt
for screen capture. A no-op backend is provided for non-Windows machines so
the server can be developed and smoke tested anywhere.
"""
from __future__ import annotations

import ctypes
import struct
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


def png_encode(width: int, height: int, rgb: bytes) -> bytes:
    """Minimal PNG writer (8-bit truecolour, filter 0)."""
    stride = width * 3
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        rows += rgb[y * stride:(y + 1) * stride]
    comp = zlib.compress(bytes(rows), 6)

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
        self.virtual = (0, 0, 1920, 1080)

    def refresh_metrics(self):
        return self.virtual

    def move_relative(self, dx, dy): pass
    def move_absolute(self, nx, ny): pass
    def button(self, which, state): pass
    def scroll(self, dx, dy): pass
    def key(self, name, mods=()): pass
    def type_text(self, text): pass

    def capture(self, max_width=1024):
        w = max_width
        h = max(1, int(w * self.virtual[3] / self.virtual[2]))
        row = bytearray()
        for x in range(w):
            t = int(24 + 40 * x / w)
            row += bytes((t, t + 3, t + 8))
        return png_encode(w, h, bytes(row) * h), w, h


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
    gdi32.DeleteObject.argtypes = (ctypes.c_void_p,)
    gdi32.DeleteDC.argtypes = (ctypes.c_void_p,)

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

        # -- geometry ---------------------------------------------------
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

        def move_absolute(self, nx, ny):
            vx, vy, vw, vh = self.virtual
            nx = min(max(nx, 0.0), 1.0)
            ny = min(max(ny, 0.0), 1.0)
            # SendInput's virtual-desktop space is normalised over the whole
            # virtual screen, so convert through absolute pixels first.
            px, py = vx + nx * (vw - 1), vy + ny * (vh - 1)
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
        def capture(self, max_width=1024):
            vx, vy, vw, vh = self.refresh_metrics()
            out_w = min(max_width, vw)
            out_w -= out_w % 2
            out_w = max(2, out_w)
            out_h = max(2, round(out_w * vh / vw))

            screen = user32.GetDC(None)
            mem = gdi32.CreateCompatibleDC(screen)
            bmp = gdi32.CreateCompatibleBitmap(mem, out_w, out_h)
            old = gdi32.SelectObject(mem, bmp)
            try:
                gdi32.SetStretchBltMode(mem, HALFTONE)
                gdi32.StretchBlt(mem, 0, 0, out_w, out_h, screen, vx, vy, vw, vh, SRCCOPY)

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

            rgb = bytearray(out_w * out_h * 3)
            rgb[0::3] = bgra[2::4]
            rgb[1::3] = bgra[1::4]
            rgb[2::3] = bgra[0::4]
            return png_encode(out_w, out_h, bytes(rgb)), out_w, out_h

    def make_backend():
        return Win32Backend()
