#!/usr/bin/env python3
"""Remote Pad agent -- turns this PC into a remotely controllable device.

Serves the control UI over HTTP and accepts live input over a WebSocket on the
same port. No third-party packages: Python 3.8+ standard library only.

    python pc_agent.py                 # random 6 digit PIN, port 8787
    python pc_agent.py --pin 123456 --port 9000

Bind address defaults to every interface so a phone on the same Wi-Fi can
reach it; every command channel requires the PIN.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import random
import socket
import socketserver
import struct
import sys
import threading
import time
import urllib.parse
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from win_input import make_backend, png_encode  # noqa: E402

FROZEN = getattr(sys, "frozen", False)
if FROZEN:                                   # bundled by PyInstaller
    WEB_DIR = os.path.join(getattr(sys, "_MEIPASS", os.path.dirname(sys.executable)), "web")
else:
    WEB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web")
WS_GUID = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
MIME = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml",
        ".png": "image/png", ".webmanifest": "application/manifest+json"}

LOCK = threading.Lock()
CAPTURE_LOCK = threading.Lock()
LOG_LOCK = threading.Lock()


def log(msg: str) -> None:
    with LOG_LOCK:
        print("[%s] %s" % (time.strftime("%H:%M:%S"), msg), flush=True)


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("203.0.113.1", 9))        # no packet is sent
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


# --------------------------------------------------------------- websocket

class WSError(Exception):
    pass


class WebSocket:
    """Minimal RFC 6455 server endpoint (text frames + ping/pong/close)."""

    def __init__(self, rfile, wfile):
        self.rfile, self.wfile = rfile, wfile
        self._send_lock = threading.Lock()
        self.open = True

    @staticmethod
    def accept_key(key: str) -> str:
        return base64.b64encode(hashlib.sha1(key.encode() + WS_GUID).digest()).decode()

    def _read(self, n: int) -> bytes:
        buf = b""
        while len(buf) < n:
            chunk = self.rfile.read(n - len(buf))
            if not chunk:
                raise WSError("closed")
            buf += chunk
        return buf

    def recv(self):
        """Returns a str payload, or None when the peer closes."""
        while True:
            b1, b2 = self._read(2)
            opcode = b1 & 0x0F
            masked = b2 & 0x80
            length = b2 & 0x7F
            if length == 126:
                length = struct.unpack(">H", self._read(2))[0]
            elif length == 127:
                length = struct.unpack(">Q", self._read(8))[0]
            if length > 1 << 20:
                raise WSError("frame too large")
            mask = self._read(4) if masked else b""
            data = self._read(length) if length else b""
            if masked:
                data = bytes(c ^ mask[i & 3] for i, c in enumerate(data))

            if opcode == 0x1:
                return data.decode("utf-8", "replace")
            if opcode == 0x8:
                # RFC 6455 wants the close echoed back before the socket goes
                self._frame(0x8, data[:125])
                self.open = False
                return None
            if opcode == 0x9:
                self._frame(0xA, data)
            # 0x0 continuation / 0x2 binary / 0xA pong: ignored

    def _frame(self, opcode: int, payload: bytes) -> None:
        if not self.open:
            return
        n = len(payload)
        if n < 126:
            head = struct.pack(">BB", 0x80 | opcode, n)
        elif n < 1 << 16:
            head = struct.pack(">BBH", 0x80 | opcode, 126, n)
        else:
            head = struct.pack(">BBQ", 0x80 | opcode, 127, n)
        with self._send_lock:
            try:
                self.wfile.write(head + payload)
                self.wfile.flush()
            except OSError:
                self.open = False

    def send(self, obj) -> None:
        self._frame(0x1, json.dumps(obj, separators=(",", ":")).encode())

    def send_bytes(self, data: bytes) -> None:
        self._frame(0x2, data)

    def close(self) -> None:
        self._frame(0x8, b"")
        self.open = False


# ------------------------------------------------------------- frame tiling

TILE = 128


def tile_frame(previous, width, height, rgb, tile=TILE, level=4):
    """Cut a frame into tiles and encode only the ones that changed.

    Returns (tiles, hashes) where each tile is (x, y, w, h, png_bytes).
    Pass an empty dict as `previous` to force a full frame.
    """
    stride = width * 3
    tiles, hashes = [], {}
    for ty in range(0, height, tile):
        th = min(tile, height - ty)
        for tx in range(0, width, tile):
            tw = min(tile, width - tx)
            start = ty * stride + tx * 3
            span = tw * 3
            if tw == width:                       # whole rows, no stitching needed
                chunk = rgb[start:start + th * stride]
            else:
                chunk = b"".join(rgb[start + i * stride:start + i * stride + span]
                                 for i in range(th))
            key = (tx, ty)
            digest = zlib.crc32(chunk)
            hashes[key] = digest
            if previous.get(key) != digest:
                tiles.append((tx, ty, tw, th, png_encode(tw, th, chunk, level)))
    return tiles, hashes


# ------------------------------------------------------------------ server

class Handler(socketserver.StreamRequestHandler):
    timeout = 300
    disable_nagle_algorithm = True

    # -- plumbing ---------------------------------------------------------
    def handle(self):
        try:
            request = self.rfile.readline(65537)
            if not request or len(request) > 65536:
                return
            parts = request.decode("latin-1").split()
            if len(parts) < 2:
                return
            method, target = parts[0], parts[1]
            headers = {}
            done = False
            for _ in range(120):
                line = self.rfile.readline(8192)
                if line in (b"\r\n", b"\n", b""):
                    done = True
                    break
                k, _, v = line.decode("latin-1").partition(":")
                headers[k.strip().lower()] = v.strip()
            if not done:
                # the headers never ended, so anything after them is unusable
                return

            path, _, query = target.partition("?")
            params = urllib.parse.parse_qs(query)

            if "websocket" in headers.get("upgrade", "").lower():
                self.serve_ws(path, headers)
            else:
                self.serve_http(method, urllib.parse.unquote(path), params)
        except (WSError, OSError, socket.timeout):
            pass

    def reply(self, status: str, body: bytes, ctype: str, extra: str = "") -> None:
        head = ("HTTP/1.1 %s\r\nContent-Type: %s\r\nContent-Length: %d\r\n"
                "Cache-Control: no-store\r\nConnection: close\r\n%s\r\n"
                % (status, ctype, len(body), extra))
        self.wfile.write(head.encode("latin-1") + body)

    def pin_ok(self, given) -> bool:
        return hmac.compare_digest(str(given or ""), self.server.pin)

    # -- http -------------------------------------------------------------
    def serve_http(self, method, path, params):
        if method not in ("GET", "HEAD"):
            return self.reply("405 Method Not Allowed", b"", "text/plain")

        if path == "/api/info":
            vx, vy, vw, vh = self.server.backend.refresh_metrics()
            body = json.dumps({"host": socket.gethostname(), "backend": self.server.backend.name,
                               "screen": {"w": vw, "h": vh},
                               "bpp": getattr(self.server.backend, "bits_per_pixel", 0)}).encode()
            return self.reply("200 OK", body, "application/json")

        if path == "/api/shot":
            if not self.pin_ok((params.get("pin") or [""])[0]):
                time.sleep(0.4)
                return self.reply("403 Forbidden", b"bad pin", "text/plain")
            try:
                width = max(240, min(1920, int((params.get("w") or ["1100"])[0])))
            except ValueError:
                width = 1100
            with CAPTURE_LOCK:
                png, _, _ = self.server.backend.capture(width)
            return self.reply("200 OK", png, "image/png")

        name = "index.html" if path == "/" else path.lstrip("/")
        full = os.path.normpath(os.path.join(WEB_DIR, name))
        if not full.startswith(WEB_DIR) or not os.path.isfile(full):
            return self.reply("404 Not Found", b"not found", "text/plain")
        with open(full, "rb") as fh:
            body = fh.read()
        ctype = MIME.get(os.path.splitext(full)[1], "application/octet-stream")
        self.reply("200 OK", body, ctype)

    # -- websocket --------------------------------------------------------
    def serve_ws(self, path, headers):
        key = headers.get("sec-websocket-key")
        if path != "/ws" or not key:
            return self.reply("400 Bad Request", b"", "text/plain")
        self.wfile.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n"
                          "Connection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n"
                          % WebSocket.accept_key(key)).encode("latin-1"))
        ws = WebSocket(self.rfile, self.wfile)
        peer = self.client_address[0]
        backend = self.server.backend
        authed = False
        held = set()
        shot_hashes = {}
        log("connect %s" % peer)
        try:
            while ws.open:
                raw = ws.recv()
                if raw is None:
                    break
                try:
                    msg = json.loads(raw)
                except ValueError:
                    continue
                kind = msg.get("t")

                if not authed:
                    if kind == "auth" and self.pin_ok(msg.get("pin")):
                        authed = True
                        vx, vy, vw, vh = backend.refresh_metrics()
                        ws.send({"t": "ready", "host": socket.gethostname(),
                                 "screen": {"w": vw, "h": vh}, "backend": backend.name})
                        log("authorised %s" % peer)
                    else:
                        time.sleep(0.6)
                        ws.send({"t": "denied"})
                        log("rejected %s" % peer)
                        break
                    continue

                if kind == "ping":
                    ws.send({"t": "pong", "id": msg.get("id")})
                    continue

                if kind == "frame":
                    try:
                        width = max(320, min(1600, int(msg.get("w", 960))))
                    except (TypeError, ValueError):
                        width = 960
                    if msg.get("full"):
                        shot_hashes = {}
                    with CAPTURE_LOCK:
                        fw, fh, rgb = backend.grab(width)
                    tiles, shot_hashes = tile_frame(shot_hashes, fw, fh, rgb)
                    sent = 0
                    for tx, ty, tw, th, png in tiles:
                        ws.send_bytes(struct.pack(">HHHH", tx, ty, tw, th) + png)
                        sent += len(png)
                    ws.send({"t": "frame_end", "w": fw, "h": fh, "n": len(tiles),
                             "bytes": sent, "full": bool(msg.get("full"))})
                    continue

                with LOCK:
                    if kind == "rel":
                        backend.move_relative(msg.get("dx", 0), msg.get("dy", 0))
                    elif kind == "abs":
                        backend.move_absolute(float(msg.get("x", 0)), float(msg.get("y", 0)))
                    elif kind == "btn":
                        which, state = msg.get("b", "left"), msg.get("s", "click")
                        backend.button(which, state)
                        held.add(which) if state == "down" else held.discard(which)
                    elif kind == "scroll":
                        backend.scroll(msg.get("dx", 0), msg.get("dy", 0))
                    elif kind == "key":
                        backend.key(msg.get("k", ""), msg.get("mods", ()))
                    elif kind == "text":
                        backend.type_text(msg.get("s", ""))
        finally:
            with LOCK:
                for which in held:
                    backend.button(which, "up")
            log("disconnect %s" % peer)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> int:
    ap = argparse.ArgumentParser(description="Remote Pad agent")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--pin", default=None, help="6 digit PIN (random when omitted)")
    args = ap.parse_args()

    pin = args.pin or "%06d" % random.SystemRandom().randrange(1000000)
    backend = make_backend()
    srv = Server((args.host, args.port), Handler)
    srv.pin, srv.backend = str(pin), backend

    vx, vy, vw, vh = backend.refresh_metrics()
    base = "http://%s:%d/" % (lan_ip(), args.port)
    url = "%s?pin=%s" % (base, pin)
    bar = "-" * 58
    print(bar)
    print(" Remote Pad agent is running")
    print(bar)
    print("  Open this on your phone (the PIN is already in it):")
    print()
    print("      %s" % url)
    print()
    print("  without the PIN :  %s   (PIN: %s)" % (base, pin))
    print("  input backend   :  %s" % backend.name)
    print("  virtual screen  :  %d x %d" % (vw, vh))
    print(bar)
    print("  Keep this window open. Ctrl+C to stop.")
    print(bar, flush=True)
    if backend.name == "stub":
        print("  NOTE: not running on Windows -- input is simulated only.", flush=True)

    try:
        srv.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        print("\nstopping")
    finally:
        srv.shutdown()
        srv.server_close()
    return 0


def _hold() -> None:
    """Keep the console open when the packaged exe is double clicked."""
    if FROZEN:
        try:
            input("\nEnter キーで閉じます... ")
        except Exception:
            pass


if __name__ == "__main__":
    try:
        code = main()
    except OSError as exc:
        print("\n起動できませんでした: %s" % exc)
        print("ポートが既に使われている場合は --port 8788 のように変更してください。")
        _hold()
        raise SystemExit(1)
    except Exception as exc:                      # noqa: BLE001
        print("\n予期しないエラー: %r" % (exc,))
        _hold()
        raise SystemExit(1)
    _hold()
    raise SystemExit(code)
