"""指定したメールアドレスのユーザーを管理者にする（緊急用）。

通常は .env の ADMIN_EMAILS を設定してログインし直せば十分です。
このスクリプトは、環境変数を触れない場面の保険として用意しています。

使い方:
    python scripts/make_admin.py you@example.com
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import select  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models import ModerationAction, User  # noqa: E402


def main() -> int:
    if len(sys.argv) != 2:
        print("使い方: python scripts/make_admin.py you@example.com")
        return 1

    email = sys.argv[1].strip().lower()
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            print(f"見つかりません: {email}（先に画面から会員登録してください）")
            return 1
        if user.is_deleted:
            print("退会済みのアカウントです。")
            return 1
        user.role = "admin"
        db.add(
            ModerationAction(
                admin_user_id=user.id,
                action="grant_admin",
                target_type="user",
                target_id=user.id,
                reason="scripts/make_admin.py により付与",
            )
        )
        db.commit()
        print(f"管理者にしました: {user.display_name} <{email}>")
        print("注意: .env の ADMIN_EMAILS にも追加してください。")
        print("      設定が無いと、次回ログイン時に一般ユーザーへ戻されます。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
