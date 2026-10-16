"""アプリ独自の例外。main.py でまとめて画面に変換します。"""
from __future__ import annotations


class LoginRequired(Exception):
    """ログインが必要なページに未ログインで来たとき。ログイン画面へ誘導する。"""

    def __init__(self, next_path: str = "/") -> None:
        self.next_path = next_path
        super().__init__("login required")


class AppError(Exception):
    """利用者に見せてよいエラー。エラーページとして表示する。"""

    def __init__(self, status_code: int, title: str, message: str = "") -> None:
        self.status_code = status_code
        self.title = title
        self.message = message
        super().__init__(title)


class Forbidden(AppError):
    def __init__(self, message: str = "この操作を行う権限がありません。") -> None:
        super().__init__(403, "権限がありません", message)


class NotFound(AppError):
    def __init__(self, message: str = "お探しのページは見つかりませんでした。") -> None:
        super().__init__(404, "ページが見つかりません", message)


class RateLimited(AppError):
    def __init__(self, message: str = "操作が短時間に集中しています。") -> None:
        super().__init__(429, "しばらく時間をおいてください", message)
