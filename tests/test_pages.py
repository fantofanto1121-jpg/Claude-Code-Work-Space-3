"""公開ページが表示できるかの確認（正常系）。"""
from tests.conftest import create_thread, login, register


def test_top_page(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "NEXTECH" in response.text
    assert "カテゴリーから探す" in response.text


def test_category_page(client):
    response = client.get("/c/free")
    assert response.status_code == 200
    assert "雑談" in response.text


def test_unknown_category_returns_404(client):
    response = client.get("/c/does-not-exist")
    assert response.status_code == 404
    assert "ページが見つかりません" in response.text


def test_legal_pages(client):
    for path, text in [
        ("/terms", "利用規約"),
        ("/privacy", "プライバシーポリシー"),
        ("/guidelines", "ガイドライン"),
        ("/contact", "お問い合わせ"),
    ]:
        response = client.get(path)
        assert response.status_code == 200, path
        assert text in response.text


def test_healthz(client):
    assert client.get("/healthz").text == "ok"


def test_robots_blocks_admin(client):
    assert "Disallow: /admin" in client.get("/robots.txt").text


def test_search_finds_thread_by_title_and_body(client):
    email = register(client)
    login(client, email)
    create_thread(client, title="寒冷地の植物の育て方", body="雪国でも育つ品種をまとめます")

    by_title = client.get("/search", params={"q": "寒冷地"})
    assert by_title.status_code == 200
    assert "寒冷地の植物の育て方" in by_title.text

    by_body = client.get("/search", params={"q": "雪国でも育つ"})
    assert "寒冷地の植物の育て方" in by_body.text


def test_search_requires_two_characters(client):
    response = client.get("/search", params={"q": "あ"})
    assert response.status_code == 200
    assert "2文字以上" in response.text


def test_search_no_results_shows_empty_state(client):
    response = client.get("/search", params={"q": "存在しないはずのことば12345"})
    assert "一致するスレッドが見つかりませんでした" in response.text


def test_pagination_renders(client):
    email = register(client)
    login(client, email)
    for i in range(3):
        create_thread(client, title=f"ページ送り確認{i}", body=f"本文{i}")
    response = client.get("/c/free", params={"page": 1})
    assert response.status_code == 200
