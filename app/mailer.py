"""メール送信。

RESEND_API_KEY が設定されていれば Resend 経由で送信し、
未設定ならサーバーのログにリンクを出力します（開発時はこれで十分）。

重要: ログにトークンそのもの以外の認証情報（パスワード等）は出しません。
"""
from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger("kawara.mail")


def send_email(to: str, subject: str, text_body: str) -> bool:
    """送信できたら True。失敗してもアプリは落とさない。"""
    if not settings.resend_api_key:
        logger.warning(
            "[メール未設定のためログ出力] 宛先=%s 件名=%s\n%s",
            to,
            subject,
            text_body,
        )
        return False

    try:
        response = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": f"{settings.site_name} <{settings.mail_from}>",
                "to": [to],
                "subject": subject,
                "text": text_body,
            },
            timeout=10.0,
        )
    except httpx.HTTPError as exc:
        logger.error("メール送信に失敗しました: %s", exc.__class__.__name__)
        return False

    if response.status_code >= 400:
        # レスポンス本文にはAPIキーを含めない
        logger.error("メール送信APIがエラーを返しました: status=%s", response.status_code)
        return False
    return True
