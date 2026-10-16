"""表示用のユーティリティ。

いちばん大事なのは render_body() です。
ユーザーが書いた本文を「HTMLとして実行させない」ために、
必ずエスケープしてから安全なタグだけを組み立てます。
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from markupsafe import Markup, escape

# 日本標準時。日本はサマータイムが無いので固定オフセットで十分。
JST = timezone(timedelta(hours=9))

# 本文中で特別扱いするもの:
#   1. http(s) で始まるURL
#   2. >>12 のようなレスアンカー
_TOKEN_RE = re.compile(r"(?P<url>https?://[^\s<>\"'`]+)|(?P<anchor>&gt;&gt;|>>)(?P<num>\d{1,6})")

# URLの末尾にくっつきがちな句読点は、リンクから外す
_URL_TRAILING = "。、,.!?！？）)」』]>:;　"

_WS_RE = re.compile(r"[ \t　]+")


def to_jst(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:  # SQLite から戻ると naive になることがある
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(JST)


def format_datetime(value: datetime | None) -> str:
    """2026/10/16 21:05 の形式（日本時間）。"""
    jst = to_jst(value)
    return jst.strftime("%Y/%m/%d %H:%M") if jst else "-"


def format_relative(value: datetime | None) -> str:
    """「3分前」のような相対表記。1週間以上前は日付で返す。"""
    jst = to_jst(value)
    if jst is None:
        return "-"
    delta = datetime.now(JST) - jst
    seconds = int(delta.total_seconds())
    if seconds < 0:
        return "たった今"
    if seconds < 60:
        return "たった今"
    if seconds < 3600:
        return f"{seconds // 60}分前"
    if seconds < 86400:
        return f"{seconds // 3600}時間前"
    if seconds < 86400 * 7:
        return f"{seconds // 86400}日前"
    return jst.strftime("%Y/%m/%d")


def normalize_text(value: str | None) -> str:
    """前後の空白を削り、改行コードを \n に統一する。"""
    if not value:
        return ""
    return value.replace("\r\n", "\n").replace("\r", "\n").strip()


def normalize_single_line(value: str | None) -> str:
    """タイトルや表示名用。改行と連続空白を1つのスペースにまとめる。"""
    text = normalize_text(value).replace("\n", " ")
    return _WS_RE.sub(" ", text).strip()


def text_length(value: str) -> int:
    return len(value)


def render_body(body: str, thread_id: int | None = None) -> Markup:
    """投稿本文を安全な HTML に変換する。

    手順:
      1. 1行ずつ処理する
      2. URL と >>番号 以外の文字はすべて escape() でエスケープする
         → <script> を書かれてもただの文字として表示される（XSS対策）
      3. 改行は <br> に変換する（改行の保持）
    """
    body = body.replace("\r\n", "\n").replace("\r", "\n")
    out_lines: list[str] = []

    for line in body.split("\n"):
        pieces: list[str] = []
        cursor = 0
        for match in _TOKEN_RE.finditer(line):
            pieces.append(str(escape(line[cursor : match.start()])))
            if match.group("url"):
                url = match.group("url")
                trimmed = url.rstrip(_URL_TRAILING)
                tail = url[len(trimmed) :]
                safe_url = escape(trimmed)
                pieces.append(
                    f'<a href="{safe_url}" rel="nofollow noopener noreferrer" '
                    f'target="_blank" class="body-link">{safe_url}</a>{escape(tail)}'
                )
                cursor = match.end()
                continue
            # レスアンカー >>3
            num = match.group("num")
            if thread_id is None:
                pieces.append(str(escape(f">>{num}")))
            else:
                pieces.append(
                    f'<a href="/t/{thread_id}#r{num}" class="anchor-link" '
                    f'data-post-number="{num}">&gt;&gt;{num}</a>'
                )
            cursor = match.end()
        pieces.append(str(escape(line[cursor:])))

        html_line = "".join(pieces)
        # 行頭が > （>> のアンカーを除く）なら引用行として色を変える
        stripped = line.lstrip()
        if stripped.startswith(">") and not re.match(r">>\d", stripped):
            html_line = f'<span class="quote-line">{html_line}</span>'
        out_lines.append(html_line)

    return Markup("<br>".join(out_lines))


def excerpt(body: str, limit: int = 100) -> str:
    """一覧に出す抜粋。タグは一切含めないプレーンテキスト。"""
    text = " ".join(body.split())
    if len(text) <= limit:
        return text
    return text[:limit] + "…"


def safe_next_path(value: str | None, fallback: str = "/") -> str:
    """ログイン後の戻り先。外部サイトへ飛ばされる脆弱性（オープンリダイレクト）を防ぐ。"""
    if not value:
        return fallback
    if not value.startswith("/") or value.startswith("//") or "\\" in value:
        return fallback
    return value


def page_range(current: int, total: int, window: int = 2) -> list[int | None]:
    """ページ送りに出す番号を作る。None は「…」の位置。"""
    if total <= 1:
        return [1] if total == 1 else []
    pages: list[int] = sorted(
        {1, total, *range(max(1, current - window), min(total, current + window) + 1)}
    )
    out: list[int | None] = []
    previous: int | None = None
    for page in pages:
        if previous is not None and page - previous > 1:
            out.append(None)
        out.append(page)
        previous = page
    return out
